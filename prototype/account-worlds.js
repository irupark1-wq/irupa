// 계정 월드 저장(PO-AUTH-001 §3·§4, PO-DEC-006 §4, SB-0004). 명시 스냅샷 저장/불러오기만 — 실시간 동기화·자동 합치기 없음.
// 로컬 월드 계보(lineage_id) 1개 = 계정 월드 1개. 같은 로컬 월드를 다시 저장하면 그 계정 월드를 갱신한다(새 월드 추가 없음).
// 충돌(다른 기기에서 먼저 저장)·같은 계보의 다른 스냅샷은 조용히 덮어쓰지 않고 선택지를 돌려준다.
// 이 모듈은 Supabase 클라이언트·저장소를 주입받는다(시험 가능). 토큰·비밀번호를 다루지 않는다.

const KEYS = ["world_exists", "world_limit", "version_conflict", "not_found", "unsupported_format", "invalid_data", "not_authenticated", "invalid_version"];
/** 서버 오류 → 화면 키 */
export function saveErrorKey(error) {
  if (!error) return null;
  const text = String(error.message || "") + " " + String(error.details || "");
  for (const k of KEYS) if (text.includes("save." + k)) return k;
  if (error.name === "AuthRetryableFetchError" || /Failed to fetch|NetworkError|fetch failed/i.test(text) || error.status === 0) return "network";
  if (error.status === 401 || error.code === "PGRST301") return "not_authenticated";
  if (error.code === "PGRST202" || error.code === "42P01" || /Could not find the function|does not exist/.test(text)) return "not_ready"; // SB-0004 미적용
  return "generic";
}
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
/** 스냅샷 지문(SHA-256 base64url, 43자) — 같은 스냅샷 재전송을 멱등으로 만든다 */
export async function fingerprintOf(text) {
  return b64url(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}
export const linkKey = (userId) => "game1-account-link:" + userId;

/**
 * @param {object} o
 * @param {object} o.client      supabase client(로그인된 상태)
 * @param {Storage} o.storage    localStorage 같은 것
 * @param {string} o.userId      로그인한 사용자 id(계정마다 연결 기록을 따로 둔다)
 * @param {() => string} o.readLocal          현재 로컬 저장본 원문(JSON 문자열)
 * @param {(fresh:boolean) => string} o.lineage   로컬 계보 id(없으면 만든다. fresh=true 면 새 계보)
 * @param {(text:string) => void} o.validate      불러올 저장본 검사(실패 시 throw, 로컬은 그대로)
 * @param {(text:string) => void} o.writeLocal    검사를 통과한 저장본을 로컬에 쓴다
 * @param {string} o.storeKey                    로컬 저장 키(백업 이름에 씀)
 */
export function createAccountWorlds({ client, storage, userId, readLocal, lineage, validate, writeLocal, storeKey }) {
  const readLinks = () => {
    try {
      return JSON.parse(storage.getItem(linkKey(userId)) || "{}") || {};
    } catch {
      return {};
    }
  };
  const writeLink = (lin, link) => {
    const all = readLinks();
    if (link) all[lin] = link;
    else delete all[lin];
    storage.setItem(linkKey(userId), JSON.stringify(all));
  };
  const titleOf = (text) => {
    try {
      const s = JSON.parse(text);
      return ((s.pawns || []).map((p) => p.name).join("·") || "내 월드").slice(0, 40);
    } catch {
      return "내 월드";
    }
  };
  const summary = (text) => {
    const s = JSON.parse(text);
    return { pawns: (s.pawns || []).length, tick: s.life?.tick || 0, local_version: s.version || 0 };
  };

  /** 지금 로컬 월드가 계정과 어떤 관계인지(화면의 "월드 저장 위치" 줄) */
  async function status() {
    const text = readLocal();
    if (!text) return { kind: "no_world" };
    const lin = lineage(false),
      link = readLinks()[lin],
      fp = await fingerprintOf(readLocal());
    if (!link) return { kind: "local_only", lineage: lin };
    return { kind: link.fingerprint === fp ? "in_account" : "account_older", lineage: lin, link };
  }

  /** 계정에 저장. 연결이 있으면 갱신, 없으면 새로 만들기. 결과: {ok, key, ...} */
  async function save() {
    const lin = lineage(false),
      text = readLocal(),
      fp = await fingerprintOf(text),
      world = JSON.parse(text),
      link = readLinks()[lin];
    if (link) {
      const { data, error } = await client.rpc("game1_update_account_world", { p_world_id: link.world_id, p_world: world, p_fingerprint: fp, p_expected_version: link.version });
      if (error) {
        const key = saveErrorKey(error);
        if (key === "not_found") writeLink(lin, null); // 서버에서 지워진 월드: 연결을 끊고 새로 만들기를 고르게 한다
        return { ok: false, key, world_id: link.world_id };
      }
      writeLink(lin, { world_id: link.world_id, version: data, fingerprint: fp, saved_at: Date.now() });
      return { ok: true, key: "saved", world_id: link.world_id, version: data };
    }
    const { data, error } = await client.rpc("game1_create_account_world", { p_lineage: lin, p_title: titleOf(text), p_world: world, p_fingerprint: fp });
    if (error) {
      const key = saveErrorKey(error);
      // 같은 계보가 이미 계정에 있다(다른 기기에서 저장) → 그 월드 id 를 알려 주고 선택하게 한다
      return { ok: false, key, world_id: key === "world_exists" ? String(error.details || "").trim() || null : null };
    }
    const row = Array.isArray(data) ? data[0] : data;
    writeLink(lin, { world_id: row.world_id, version: row.version, fingerprint: fp, saved_at: Date.now() });
    return { ok: true, key: row.created ? "created" : "saved", world_id: row.world_id, version: row.version };
  }

  /** "이 기기 월드를 새 월드로 저장": 로컬에 새 계보를 주고 새 계정 월드로 만든다(기존 계정 월드는 그대로) */
  async function saveAsNew() {
    lineage(true);
    return save();
  }

  async function list() {
    const { data, error } = await client.rpc("game1_list_account_worlds");
    if (error) return { ok: false, key: saveErrorKey(error), worlds: [] };
    const lin = lineage(false);
    return { ok: true, key: "listed", worlds: (data || []).map((w) => ({ ...w, current: w.lineage_id === lin })) };
  }

  /** 계정 월드 불러오기: 검사 → 이 기기 월드를 먼저 따로 보관 → 바꿔 쓰기. 불러온 월드는 정지 상태로 열린다(소급 없음) */
  async function load(worldId) {
    const { data, error } = await client.from("game1_account_worlds").select("world, version, lineage_id").eq("world_id", worldId).single();
    if (error) return { ok: false, key: error.code === "PGRST116" ? "not_found" : saveErrorKey(error) }; // PGRST116 = 0행(없거나 남의 월드)
    const text = JSON.stringify(data.world);
    try {
      validate(text);
    } catch (e) {
      return { ok: false, key: /newer_format/.test(String(e?.message)) ? "unsupported_format" : "invalid_data" };
    }
    const previous = readLocal();
    if (previous) storage.setItem(storeKey + ".before-account-load", previous);
    writeLocal(text);
    writeLink(data.lineage_id, { world_id: worldId, version: data.version, fingerprint: await fingerprintOf(text), saved_at: Date.now() });
    return { ok: true, key: "loaded", backup: !!previous, ...summary(text) };
  }

  /** 계정 월드 하나 지우기(목록 정리용, 3개 상한). 이 기기 월드는 그대로 */
  async function remove(worldId) {
    const { error } = await client.from("game1_account_worlds").delete().eq("world_id", worldId);
    if (error) return { ok: false, key: saveErrorKey(error) };
    const links = readLinks();
    for (const [lin, l] of Object.entries(links)) if (l.world_id === worldId) writeLink(lin, null);
    return { ok: true, key: "removed" };
  }

  return { status, save, saveAsNew, list, load, remove, summary: () => summary(readLocal()) };
}

/** 로그아웃·계정 전환 때: 이 기기에 남은 다른 계정의 연결 기록을 지운다(서버 자료는 그대로) */
export function forgetAccountLinks(storage, keepUserId = null) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith("game1-account-link:") && k !== linkKey(keepUserId)) keys.push(k);
  }
  for (const k of keys) storage.removeItem(k);
  return keys.length;
}
