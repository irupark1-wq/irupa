// 더보기 → 계정 블록(PO-AUTH-001 §3·§6, DES-12 문구 위계 참고). 로그인 상태 줄과 월드 저장 위치 줄을 따로 보여 준다.
import { t as T } from "./i18n.js";
import { createAccount } from "./account.js";
import { loadClient, authReturnUrl, authConfigured, hasStoredSession } from "./supabase-client.js";

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
export function mountAccountUI({ pauseLife }) {
  let account = createAccount({ client: null, returnUrl: null }),
    started = null;
  const render = (s) => {
    $("authLine").textContent = STATUS_LINE[s.status](s);
    $("worldLine").textContent = T("이 기기에 저장됨"); // 계정 월드 저장(SB-0004)이 생기기 전까지는 항상 이 기기
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
        const client = await loadClient();
        account = createAccount({ client, returnUrl: authReturnUrl() });
        account.subscribe(render);
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
