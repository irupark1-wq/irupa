// 계정 로그인 상태(PO-AUTH-001, PO-DEC-006). Supabase Auth 클라이언트를 주입받는 순수 로직 — 화면(account-ui.js)과 분리해 시험한다.
// 원칙: 로그인 상태와 월드 저장 위치는 별개(로그인 성공 ≠ 계정 저장). 실패 문구는 계정이 있는지 드러내지 않는다.
// 토큰·비밀번호는 상태(state)에 담지 않는다. 화면·기록·오류 문구 어디에도 나오지 않는다.

export const AUTH_STATUS = ["unavailable", "guest", "busy", "email_pending", "signed_in", "expired"];
export const PASSWORD_RULE = { min: 10, lower: true, upper: true, digit: true };

/** 비밀번호 규칙(SB-0003: 10자 이상, 영문 소문자·대문자·숫자). 서버도 같은 규칙으로 다시 검사한다. */
export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < PASSWORD_RULE.min) return "password_short";
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) return "password_mix";
  return null;
}
export const emailLooksValid = (e) => typeof e === "string" && e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** 화면에 보여 줄 자기 이메일(어깨너머 노출을 줄이려 앞 두 글자만) */
export function maskEmail(email) {
  if (typeof email !== "string" || !email.includes("@")) return "";
  const [name, domain] = email.split("@");
  return name.slice(0, 2) + "***@" + domain;
}

/** Supabase 오류 → 화면 문구 키. 존재하지 않는 계정과 틀린 비밀번호를 구분하지 않는다. */
export function errorKey(error) {
  if (!error) return null;
  const code = error.code || "",
    status = error.status;
  if (code === "email_not_confirmed") return "email_not_confirmed";
  if (code === "invalid_credentials") return "login_failed";
  if (code === "invalid_email_format" || code === "email_address_invalid") return "email_format";
  if (code === "weak_password") return "password_weak";
  if (/rate_limit/.test(code) || status === 429) return "rate_limited";
  if (code === "signup_disabled") return "signup_closed";
  if (code === "same_password") return "password_same";
  if (code === "reauthentication_needed") return "reauth_needed";
  if (error.name === "AuthRetryableFetchError" || status === 0 || code === "network") return "network";
  return "generic";
}

/**
 * @param {object} o
 * @param {object|null} o.client  supabase client(없으면 unavailable)
 * @param {string|null} o.returnUrl  로그인·메일 확인·재설정 후 돌아올 정확한 주소(SB-0003 의 두 주소 중 하나)
 */
export function createAccount({ client, returnUrl }) {
  let state = { status: client && returnUrl ? "guest" : "unavailable", email: null, providers: [], message: null, user_id: null };
  let signingOut = false;
  const listeners = new Set();
  const set = (patch) => {
    state = { ...state, ...patch };
    for (const f of listeners) f(snapshot());
  };
  const snapshot = () => ({ ...state, providers: [...state.providers], email_masked: maskEmail(state.email) });
  const fromUser = (user) => ({ status: "signed_in", email: user?.email || null, providers: [...(user?.app_metadata?.providers || [])], user_id: user?.id || null });
  const ready = () => state.status !== "unavailable";
  /** 같은 버튼을 두 번 눌러도 요청은 하나(중복 요청 차단) */
  async function run(fn) {
    if (!ready()) return { ok: false, key: "unavailable" };
    if (state.status === "busy") return { ok: false, key: "busy" };
    const before = state.status;
    set({ status: "busy", message: null });
    try {
      return await fn(before);
    } catch (e) {
      const key = errorKey(e);
      set({ status: before === "busy" ? "guest" : before, message: key });
      return { ok: false, key };
    }
  }

  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        // 사용자가 누른 로그아웃이 아니면(갱신 실패 등) 세션 만료로 본다: 로컬 월드는 그대로, 다시 로그인 안내
        set(signingOut || state.status !== "signed_in" ? { status: "guest", email: null, providers: [], user_id: null } : { status: "expired", user_id: null, providers: [], message: "session_expired" });
        signingOut = false;
      } else if (session?.user && ["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED", "INITIAL_SESSION"].includes(event)) set({ ...fromUser(session.user), message: state.message });
    });
  }

  return {
    state: snapshot,
    subscribe(f) {
      listeners.add(f);
      f(snapshot());
      return () => listeners.delete(f);
    },
    /** 저장된 세션 복원(페이지를 다시 열었을 때) */
    async restore() {
      if (!ready()) return snapshot();
      const { data, error } = await client.auth.getSession();
      if (error) set({ status: "guest", message: errorKey(error) });
      else if (data?.session?.user) set(fromUser(data.session.user));
      return snapshot();
    },
    /** Google 로 계속하기: Google 화면으로 이동한다. 취소·실패는 /auth/ 페이지가 받아 공통 문구로 돌려준다 */
    google() {
      return run(async () => {
        const { error } = await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo: returnUrl } });
        if (error) throw error;
        return { ok: true, key: "redirecting" };
      });
    },
    signUp(email, password) {
      return run(async () => {
        if (!emailLooksValid(email)) throw { code: "invalid_email_format" };
        const p = passwordProblem(password);
        if (p) {
          set({ status: "guest", message: p });
          return { ok: false, key: p };
        }
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: returnUrl } });
        if (error) throw error;
        if (data?.session?.user) {
          set(fromUser(data.session.user));
          return { ok: true, key: "signed_in" };
        }
        // 확인 메일 대기. 이미 가입한 주소여도 Supabase 는 같은 응답을 준다(메일은 가지 않음) → 문구도 그 가능성을 함께 안내
        set({ status: "email_pending", email: email.trim(), message: "check_email" });
        return { ok: true, key: "check_email" };
      });
    },
    signIn(email, password) {
      return run(async () => {
        if (!emailLooksValid(email) || typeof password !== "string" || !password) throw { code: "invalid_credentials" };
        const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          if (error.code === "email_not_confirmed") {
            set({ status: "email_pending", email: email.trim(), message: "email_not_confirmed" });
            return { ok: false, key: "email_not_confirmed" };
          }
          throw error;
        }
        set({ ...fromUser(data.user), message: "signed_in" });
        return { ok: true, key: "signed_in" };
      });
    },
    resendConfirm(email) {
      return run(async (before) => {
        const target = (email || state.email || "").trim();
        if (!emailLooksValid(target)) throw { code: "invalid_email_format" };
        const { error } = await client.auth.resend({ type: "signup", email: target, options: { emailRedirectTo: returnUrl } });
        if (error) throw error;
        set({ status: before === "busy" ? "email_pending" : before, message: "resent" });
        return { ok: true, key: "resent" };
      });
    },
    /** 비밀번호 재설정 메일: 계정이 있든 없든 같은 문구 */
    sendReset(email) {
      return run(async (before) => {
        if (!emailLooksValid(email)) throw { code: "invalid_email_format" };
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: returnUrl });
        if (error && errorKey(error) !== "generic") throw error;
        set({ status: before, message: "reset_sent" });
        return { ok: true, key: "reset_sent" };
      });
    },
    /** 로그인한 사용자가 새 비밀번호 정하기(재설정 메일로 들어온 경우 포함) */
    updatePassword(password) {
      return run(async (before) => {
        const p = passwordProblem(password);
        if (p) {
          set({ status: before, message: p });
          return { ok: false, key: p };
        }
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        set({ status: before, message: "password_updated" });
        return { ok: true, key: "password_updated" };
      });
    },
    /** 로그아웃: 이 기기의 로그인만 끝낸다. 서버 자료·로컬 월드는 지우지 않는다 */
    signOut() {
      return run(async () => {
        signingOut = true;
        const { error } = await client.auth.signOut({ scope: "local" });
        if (error) {
          signingOut = false;
          throw error;
        }
        set({ status: "guest", email: null, providers: [], user_id: null, message: "signed_out" });
        return { ok: true, key: "signed_out" };
      });
    },
    clearMessage() {
      set({ message: null });
    },
  };
}

/**
 * /auth/ 페이지가 받은 주소 → 할 일. 토큰·코드를 화면이나 기록에 쓰지 않는다.
 * Google 취소(access_denied)는 정상 취소로, 그 밖의 오류는 공통 실패로 돌려보낸다.
 */
export function readAuthReturn(search = "", hash = "") {
  const q = new URLSearchParams(search),
    h = new URLSearchParams(String(hash).replace(/^#/, ""));
  const error = q.get("error") || h.get("error"),
    code = q.get("error_code") || h.get("error_code");
  if (error) return { kind: "error", back: error === "access_denied" && code !== "otp_expired" ? "cancelled" : code === "otp_expired" ? "link_expired" : "generic" };
  const authCode = q.get("code");
  if (authCode && /^[A-Za-z0-9_-]{8,512}$/.test(authCode)) return { kind: "code", code: authCode };
  return { kind: "none" };
}
