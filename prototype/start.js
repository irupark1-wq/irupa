// 시작 화면(PO-START-001). 준비 화면 → 시작 화면 → (이어하기 | 이 기기에서 시작 | 로그인·계정 월드) → 멈춘 월드 입장.
// 원칙: 게스트 플레이를 숨기지 않는다. 로그인 성공 ≠ 계정 저장. 늦은 로그인 응답이 고른 월드를 바꾸지 않는다(자동 불러오기 없음).
// 계정 칸(#accountBlock)은 더보기와 같은 것을 잠시 이 화면으로 옮겨 쓴다(같은 버튼·같은 규칙).
import { t as T } from "./i18n.js";
import { readOrigin, forgetAccountCopy } from "./account-worlds.js";

const $ = (id) => document.getElementById(id);

/** 시작 화면 종류: 로컬 월드 유무 × 로그인 여부(로그인 상태는 화면 안 계정 칸이 따로 보여 준다) */
export function startVariant({ localPawns = 0 } = {}) {
  return localPawns > 0 ? "returning" : "first";
}
/** 계정에서 불러온 월드는 그 계정으로 로그인한 경우에만 이어할 수 있다(PO-AUTH-001 §6, PO-START-001 §4) */
export function accountCopyLocked(origin, auth) {
  if (!origin) return false;
  return !(auth && auth.status === "signed_in" && auth.user_id === origin.user_id);
}

/** 로컬 월드 요약(제목·폰 수·마지막 확정 저장 시점=생활 시간) */
export function localSummary(state) {
  const pawns = state?.pawns || [],
    tick = state?.life?.tick || 0,
    day = Math.floor((480 + tick) / 1440) + 1,
    minute = (480 + tick) % 1440;
  return {
    pawns: pawns.length,
    title: pawns.map((p) => p.name).join("·") || "내 월드",
    day,
    clock: String(Math.floor(minute / 60)).padStart(2, "0") + ":" + String(minute % 60).padStart(2, "0"),
  };
}

/**
 * @param {object} o
 * @param {object} o.store         로컬 저장소
 * @param {string} o.storeKey
 * @param {() => Promise<void>} o.enterGame   고른 뒤 실제 화면으로(그리기·월드)
 */
export function mountStart({ store, storeKey, enterGame }) {
  const block = $("accountBlock"),
    home = block.parentElement,
    homeNext = block.nextElementSibling,
    screen = $("startScreen");
  const state = store.read(),
    sum = localSummary(state),
    variant = startVariant({ localPawns: sum.pawns });

  $("startLocal").hidden = variant !== "returning";
  $("startGuest").hidden = variant === "returning";
  $("startNewWorld").hidden = variant !== "returning";
  $("startLocalNote").hidden = variant === "returning"; // DES-15: 처음 시작 안내
  const origin = readOrigin(localStorage);
  let auth = null;
  function paintLocal() {
    if (variant !== "returning") return;
    const locked = accountCopyLocked(origin, auth);
    // 잠긴 계정 사본: 제목·폰 이름을 보이지 않고, 이어하기 대신 로그인 안내
    $("startLocalTitle").textContent = locked ? T("계정에서 불러온 월드") : T(sum.title);
    $("startLocalMeta").textContent = locked
      ? auth?.status === "checking"
        ? T("로그인 확인 중…")
        : T("불러온 계정으로 로그인하면 이어할 수 있어요.")
      : T("폰 {n}명 · 생활 Day {day} {clock}까지 이 기기에 저장됨", { n: sum.pawns, day: sum.day, clock: sum.clock });
    $("startContinue").hidden = locked;
    $("startForget").hidden = !locked;
    $("startNewWorld").hidden = locked;
  }
  paintLocal();
  const onAuth = (e) => {
    auth = e.detail;
    paintLocal();
  };
  document.addEventListener("game1-auth", onAuth);
  $("startForget").onclick = () => {
    if (!confirm(T("이 기기의 계정 사본을 지울까요? 계정에 저장된 월드는 그대로예요. 불러오기 전에 있던 이 기기 월드가 있으면 되돌려요."))) return;
    forgetAccountCopy(localStorage, storeKey);
    location.reload();
  };
  // 계정 칸을 시작 화면으로 옮긴다. 이메일 입력은 "이메일로 계속하기"를 누르면 펼친다(Google 이 첫 선택)
  $("startAccountSlot").append(block);
  screen.classList.remove("email-open");
  screen.hidden = false;

  let leaving = false;
  async function leave() {
    if (leaving) return;
    leaving = true;
    document.removeEventListener("game1-auth", onAuth);
    home.insertBefore(block, homeNext); // 더보기로 돌려놓는다
    screen.hidden = true;
    await enterGame();
  }
  $("startContinue").onclick = leave;
  $("startGuest").onclick = leave;
  $("startEmail").onclick = () => {
    screen.classList.add("email-open");
    $("authEmail")?.focus();
  };
  // 새 월드: 기존 월드를 지우지 않고 따로 보관한 뒤 빈 월드로 시작(PO-START-001 §4)
  $("startNewWorld").onclick = () => {
    if (!confirm(T("새 월드를 만들까요? 지금 월드는 이 기기에 따로 보관돼요. 계정에 저장한 월드도 그대로예요."))) return;
    const raw = localStorage.getItem(storeKey);
    try {
      if (raw) localStorage.setItem(storeKey + ".before-new-world", raw);
    } catch {
      alert(T("보관할 공간이 부족해요. 더보기의 '현재 월드 저장'으로 먼저 내려받아 주세요. 지금 월드는 그대로예요."));
      return;
    }
    localStorage.removeItem(storeKey);
    localStorage.removeItem("game1-draft-v1");
    localStorage.removeItem("game1-world-origin");
    location.reload();
  };
  return { variant, leave };
}

/** 저장본을 읽지 못했을 때(손상·새 형식): 원본을 지우지 않고 내려받기·보관 후 새로 시작만 제공(PO-START-001 §2) */
export function showUnreadable({ storeKey, reason }) {
  $("splashText").hidden = true;
  $("splashError").hidden = false;
  $("splashErrorText").textContent =
    reason === "save.newer_format"
      ? T("이 저장본은 더 새 버전에서 만들어져 지금 열 수 없어요. 원본은 그대로 두었어요.")
      : T("저장 기록을 읽지 못했어요. 원본은 그대로 두었어요. 내려받아 보관하거나, 원본을 따로 보관하고 새로 시작할 수 있어요.");
  $("splashExport").onclick = () => {
    const raw = localStorage.getItem(storeKey) || "";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    a.download = "donggeuran-original-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $("splashFresh").onclick = () => {
    if (!confirm(T("원본을 이 기기에 따로 보관하고 새 월드로 시작할까요?"))) return;
    const raw = localStorage.getItem(storeKey);
    try {
      if (raw) localStorage.setItem(storeKey + ".unreadable", raw);
    } catch {
      $("splashErrorText").textContent = T("보관할 공간이 부족해요. 먼저 원본을 내려받아 주세요. 원본은 그대로예요.");
      return;
    }
    localStorage.removeItem(storeKey);
    localStorage.removeItem("game1-world-origin");
    location.reload();
  };
}
export const hideSplash = () => ($("splash").hidden = true);
