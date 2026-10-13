// 더보기 → 계정 블록(PO-AUTH-001 §3·§6, DES-12 문구 위계 참고). 로그인 상태 줄과 월드 저장 위치 줄을 따로 보여 준다.
import { t as T } from "./i18n.js";
import { createAccount } from "./account.js";
import { loadClient, authReturnUrl, authConfigured, hasStoredSession } from "./supabase-client.js";
import { createAccountWorlds, forgetAccountLinks } from "./account-worlds.js";

const $ = (id) => document.getElementById(id);
export const AUTH_MESSAGES = {
  signed_in: "로그인했어요. 월드는 아직 이 기기에만 저장돼 있어요.",
  check_email: "확인 메일을 보냈어요. 메일의 버튼을 누르면 가입이 끝나요. 메일이 오지 않으면 이미 가입한 주소일 수 있어요. 로그인하거나 비밀번호 재설정을 이용해 주세요.",
  email_not_confirmed: "이메일 확인이 아직 끝나지 않았어요. 받은 메일의 버튼을 눌러 주세요.",
  resent: "확인 메일을 다시 보냈어요.",
  reset_sent: "이 주소로 가입돼 있으면 비밀번호 재설정 메일이 가요.",
  password_short: "비밀번호는 10자 이상이어야 해요.",
  password_mix: "비밀번호에 영문 소문자·대문자·숫자를 모두 넣어 주세요.",
  password_weak: "더 안전한 비밀번호를 써 주세요.",
  password_same: "지금 쓰는 비밀번호와 달라야 해요.",
  password_updated: "새 비밀번호로 바꿨어요.",
  reauth_needed: "보안을 위해 로그아웃 후 다시 로그인한 뒤 바꿔 주세요.",
  login_failed: "로그인하지 못했어요. 이메일과 비밀번호를 확인해 주세요.",
  email_format: "이메일 주소를 확인해 주세요.",
  rate_limited: "요청이 많아요. 잠시 후 다시 시도해 주세요.",
  network: "연결을 확인하고 다시 시도해 주세요.",
  signup_closed: "지금은 새 가입을 받지 않아요.",
  generic: "진행하지 못했어요. 입력과 연결 상태를 확인하고 다시 시도해 주세요.",
  session_expired: "로그인이 끝났어요. 다시 로그인해 주세요. 이 기기의 월드는 그대로예요.",
  signed_out: "로그아웃했어요. 이 기기의 월드는 그대로예요.",
  cancelled: "로그인을 취소했어요.",
  link_expired: "링크가 만료됐거나 이미 쓰였어요. 다시 요청해 주세요.",
  confirm_other_device: "이 브라우저에서는 로그인을 마칠 수 없었어요. 메일 확인을 마쳤다면 게임에서 이메일과 비밀번호로 로그인해 주세요.",
  redirecting: "Google 로그인 화면으로 이동해요…",
  unavailable: "계정 기능을 준비하고 있어요. 지금은 이 기기에만 저장돼요.",
};
/** 계정 월드 저장 문구(SB-0004). 로컬 월드가 그대로인지 항상 함께 말한다 */
export const WORLD_MESSAGES = {
  created: "계정에 새 월드로 저장했어요. 이 기기 월드도 그대로예요.",
  saved: "계정에 저장했어요. 이 기기 월드도 그대로예요.",
  world_limit: "계정에는 월드를 3개까지 저장할 수 있어요. 목록에서 하나를 정리한 뒤 다시 저장해 주세요. 이 기기 월드는 그대로예요.",
  not_found: "계정에서 이 월드를 찾지 못했어요. 새 월드로 저장할 수 있어요.",
  unsupported_format: "이 저장본은 지금 버전에서 열 수 없어요. 이 기기 월드는 그대로예요.",
  invalid_data: "저장본을 확인하지 못했어요. 이 기기 월드는 그대로예요.",
  not_authenticated: "로그인이 끝났어요. 다시 로그인해 주세요. 이 기기 월드는 그대로예요.",
  not_ready: "계정 저장을 아직 준비하고 있어요. 이 기기 월드는 그대로예요.",
  network: "연결을 확인하고 다시 시도해 주세요. 이 기기 월드는 그대로예요.",
  generic: "계정에 저장하지 못했어요. 이 기기 월드는 그대로예요. 다시 시도해 주세요.",
  version_conflict: "다른 기기에서 이 월드를 먼저 저장했어요. 계정 저장본은 그대로예요. 어떻게 할까요?",
  world_exists: "계정에 같은 월드의 다른 저장본이 있어요. 어떻게 할까요?",
  loaded: "계정 월드를 불러왔어요. 화면을 다시 엽니다.",
  removed: "계정에서 지웠어요. 이 기기 월드는 그대로예요.",
};
const STATUS_LINE = {
  unavailable: () => T("계정 기능 준비 중"),
  guest: () => T("게스트로 이용 중"),
  busy: () => T("처리 중…"),
  email_pending: (s) => T("이메일 확인을 기다려요") + (s.email_masked ? " · " + s.email_masked : ""),
  signed_in: (s) => T("로그인됨") + (s.email_masked ? " · " + s.email_masked : "") + (s.providers.includes("google") ? " (Google)" : ""),
  expired: () => T("다시 로그인이 필요해요"),
};

/**
 * @param {object} o
 * @param {() => void} o.pauseLife  로그인 과정 중 생활을 멈춘다(초안은 각 화면이 보존)
 */
export function mountAccountUI({ pauseLife, store, storeKey, validateText }) {
  let account = createAccount({ client: null, returnUrl: authReturnUrl(), lazy: authConfigured() }),
    started = null,
    client = null,
    worldNote = null; // 진행 중·실패·충돌 같은 일시 상태(없으면 실제 연결 상태로 계산)
  const worlds = () =>
    client && account.state().user_id
      ? createAccountWorlds({
          client,
          storage: localStorage,
          userId: account.state().user_id,
          storeKey,
          readLocal: () => localStorage.getItem(storeKey),
          lineage: (fresh) => store.ensureLineage(crypto.randomUUID(), fresh),
          validate: validateText,
          writeLocal: (text) => localStorage.setItem(storeKey, text),
        })
      : null;
  /** "월드 저장 위치" 줄: 로그인 성공 ≠ 계정 저장. 실제로 확정된 것만 말한다 */
  async function renderWorldLine() {
    const line = $("worldLine");
    if (worldNote) return (line.textContent = T(worldNote));
    const w = worlds();
    if (!w) return (line.textContent = T("이 기기에 저장됨"));
    try {
      const st = await w.status();
      line.textContent =
        st.kind === "in_account" ? T("계정에 저장됨 · v{v} · 이 기기에도 있음", { v: st.link.version }) : st.kind === "account_older" ? T("이 기기에 저장됨 · 계정에는 이전 저장본(v{v})", { v: st.link.version }) : T("이 기기에 저장됨");
    } catch {
      line.textContent = T("이 기기에 저장됨");
    }
  }
  const render = (s) => {
    $("authLine").textContent = STATUS_LINE[s.status](s);
    renderWorldLine();
    const msg = s.message || (s.status === "unavailable" ? "unavailable" : null);
    $("authMsg").hidden = !msg;
    $("authMsg").textContent = msg ? T(AUTH_MESSAGES[msg] || AUTH_MESSAGES.generic) : "";
    $("authMsg").className = "auth-msg" + (["signed_in", "resent", "reset_sent", "password_updated", "signed_out", "check_email"].includes(msg) ? " ok" : msg ? " warn" : "");
    const signed = s.status === "signed_in";
    $("authGuest").hidden = signed;
    $("authSigned").hidden = !signed;
    $("authSetPassword").textContent = s.providers.includes("email") ? T("비밀번호 바꾸기") : T("비밀번호 정하기");
    $("authResend").hidden = s.status !== "email_pending";
    const off = s.status === "busy" || s.status === "unavailable";
    for (const id of ["authGoogle", "authSignIn", "authSignUp", "authReset", "authResend", "authSetPassword", "authSignOut", "authEmail", "authPassword", "authNewPassword"]) $(id).disabled = off;
  };
  account.subscribe(render);

  /** 처음 한 번: 라이브러리를 불러와 세션을 복원한다. 실패해도 게임(로컬)은 그대로 */
  function start() {
    started ??= (async () => {
      if (!authConfigured()) return account;
      try {
        client = await loadClient();
        account = createAccount({ client, returnUrl: authReturnUrl() });
        account.subscribe(render);
        account.subscribe((st) => separate(st));
        await account.restore();
      } catch {
        account = createAccount({ client: null, returnUrl: null });
        account.subscribe(render);
      }
      return account;
    })();
    return started;
  }
  const act = async (fn) => {
    pauseLife();
    const a = await start();
    return fn(a);
  };

  $("authGoogle").onclick = () => act((a) => a.google());
  $("authForm").onsubmit = (e) => {
    e.preventDefault();
    act((a) => a.signIn($("authEmail").value, $("authPassword").value));
  };
  $("authSignUp").onclick = () => act((a) => a.signUp($("authEmail").value, $("authPassword").value));
  $("authReset").onclick = () => act((a) => a.sendReset($("authEmail").value));
  $("authResend").onclick = () => act((a) => a.resendConfirm($("authEmail").value));
  $("authPwForm").onsubmit = (e) => {
    e.preventDefault();
    act((a) => a.updatePassword($("authNewPassword").value)).then(() => ($("authNewPassword").value = ""));
  };
  $("authSignOut").onclick = () => act((a) => a.signOut());

  /* ───── 계정 월드 저장(SB-0004) ───── */
  const say = (key) => {
    $("authMsg").hidden = false;
    $("authMsg").textContent = T(WORLD_MESSAGES[key] || WORLD_MESSAGES.generic);
    $("authMsg").className = "auth-msg" + (["created", "saved", "loaded", "removed"].includes(key) ? " ok" : " warn");
  };
  const busyIds = ["worldSave", "worldList", "worldSaveNew", "worldUseAccount"];
  let conflictWorld = null;
  async function runSave(how) {
    pauseLife(); // 저장하는 스냅샷이 확정되도록 생활을 멈춘다
    const w = worlds();
    if (!w) return;
    $("worldConfirm").hidden = true;
    $("worldConflict").hidden = true;
    worldNote = "계정에 저장하는 중 · 이 기기 사본 유지";
    renderWorldLine();
    for (const id of busyIds) $(id).disabled = true;
    const r = await (how === "new" ? w.saveAsNew() : w.save()).catch(() => ({ ok: false, key: "generic" }));
    for (const id of busyIds) $(id).disabled = false;
    worldNote = r.ok ? null : r.key === "version_conflict" || r.key === "world_exists" ? "계정 저장 충돌 · 기존 저장본 유지" : "계정 저장 실패 · 이 기기 사본 유지";
    renderWorldLine();
    say(r.key);
    if (r.key === "version_conflict" || r.key === "world_exists") {
      conflictWorld = r.world_id;
      $("worldConflictText").textContent = T(WORLD_MESSAGES[r.key]);
      $("worldUseAccount").hidden = !conflictWorld;
      $("worldConflict").hidden = false;
    }
    if (!$("worldRows").hidden) showList();
  }
  $("worldSave").onclick = async () => {
    const w = worlds();
    if (!w) return;
    const st = await w.status().catch(() => ({ kind: "local_only" }));
    if (st.kind === "no_world") return say("invalid_data");
    if (st.kind !== "local_only") return runSave("update");
    // 처음 올릴 때만 확인: 폰 수·생활 시간·대상 계정(PO-AUTH-001 §3-4)
    const sum = w.summary(),
      day = Math.floor((480 + sum.tick) / 1440) + 1;
    $("worldConfirmText").textContent = T("이 계정에 현재 월드를 저장할까요? 폰 {n}명 · 생활 Day {day} · 대상 {email}. 이 기기 월드는 그대로 남아요.", { n: sum.pawns, day, email: account.state().email_masked });
    $("worldConfirm").hidden = false;
  };
  $("worldConfirmYes").onclick = () => runSave("update");
  $("worldConfirmNo").onclick = () => ($("worldConfirm").hidden = true);
  $("worldSaveNew").onclick = () => runSave("new");
  $("worldConflictCancel").onclick = () => {
    $("worldConflict").hidden = true;
    worldNote = null;
    renderWorldLine();
  };
  async function loadWorld(id, title) {
    if (!confirm(T("‘{title}’을(를) 불러올까요? 지금 이 기기 월드는 따로 보관한 뒤 바뀌어요. 불러온 월드는 멈춘 상태로 열려요.", { title }))) return;
    pauseLife();
    const r = await worlds()
      .load(id)
      .catch(() => ({ ok: false, key: "generic" }));
    say(r.key);
    if (r.ok) {
      localStorage.removeItem("game1-draft-v1");
      setTimeout(() => location.reload(), 700);
    }
  }
  $("worldUseAccount").onclick = () => conflictWorld && loadWorld(conflictWorld, T("계정 월드"));
  async function showList() {
    const w = worlds(),
      ul = $("worldRows");
    if (!w) return;
    const r = await w.list().catch(() => ({ ok: false, key: "generic", worlds: [] }));
    ul.replaceChildren();
    ul.hidden = false;
    if (!r.ok) return say(r.key);
    if (!r.worlds.length) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = T("계정에 저장된 월드가 없어요.");
      return ul.append(li);
    }
    for (const row of r.worlds) {
      const li = document.createElement("li"),
        label = document.createElement("span");
      label.textContent = T("{title} · 폰 {n}명 · v{v}", { title: row.title, n: row.pawns, v: row.version }) + (row.current ? " · " + T("이 기기 월드") : "");
      const open = document.createElement("button"),
        del = document.createElement("button");
      open.type = del.type = "button";
      open.className = "gbtn gbtn-sm";
      open.textContent = T("불러오기");
      open.onclick = () => loadWorld(row.world_id, row.title);
      del.className = "link-btn";
      del.textContent = T("계정에서 지우기");
      del.onclick = async () => {
        if (!confirm(T("‘{title}’을(를) 계정에서 지울까요? 이 기기 월드는 지워지지 않아요.", { title: row.title }))) return;
        const d = await w.remove(row.world_id);
        say(d.key);
        showList();
        renderWorldLine();
      };
      li.append(label, open, del);
      ul.append(li);
    }
  }
  $("worldList").onclick = () => ($("worldRows").hidden ? showList() : ($("worldRows").hidden = true));
  // 계정 분리(PO-AUTH-001 §6): 로그인한 계정 외의 연결 기록은 이 기기에서 지운다. 로그아웃하면 모두 지운다(서버·로컬 월드는 그대로)
  function separate(st) {
    if (st.status === "signed_in" && st.user_id) forgetAccountLinks(localStorage, st.user_id);
    else if (st.status === "guest" && st.message === "signed_out") forgetAccountLinks(localStorage, null);
  }

  // /auth/ 페이지에서 돌아온 결과(토큰은 주소에 없다. 결과 키만)
  const params = new URLSearchParams(location.search),
    back = params.get("auth");
  if (back) {
    params.delete("auth");
    history.replaceState(null, "", location.pathname + (params.size ? "?" + params : "") + location.hash);
  }
  if (back || hasStoredSession())
    start().then((a) => {
      if (back && AUTH_MESSAGES[back]) {
        a.clearMessage();
        render({ ...a.state(), message: back });
      }
    });
  return { start, state: () => account.state() };
}
