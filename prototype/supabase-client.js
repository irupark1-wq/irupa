// 동그란 사이 전용 Supabase 연결(프로젝트 yvsqivhdwzbshpapfcsy). 다른 프로젝트 주소·키를 넣지 않는다.
// publishable 키는 브라우저용 공개 키다(비밀 아님). service_role 키는 절대 넣지 않는다.
export const GAME1_SUPABASE_URL = "https://yvsqivhdwzbshpapfcsy.supabase.co";
export const GAME1_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_iOqbNcQvm0PxvenZsVdGjA_D3DkMIeM"; // 공개용(브라우저) 키, 김PO 제공 2026-10-13. 비밀 키 아님
const LIB = "./vendor/supabase-js-2.117.2.js";

/** SB-0003 에 등록한 정확한 복귀 주소만 쓴다. 그 밖의 주소(미리보기 등)에서는 로그인을 열지 않는다. */
const RETURN = { "https://neinom.com": "https://neinom.com/auth/", "http://localhost:4199": "http://localhost:4199/auth/" };
export const authReturnUrl = (origin = globalThis.location?.origin) => RETURN[origin] || null;
export const authConfigured = () => !!GAME1_SUPABASE_PUBLISHABLE_KEY && !!authReturnUrl();

let pending = null;
/** 라이브러리는 필요할 때만 불러온다(게스트만 쓰는 사람은 받지 않음). 한 페이지에 클라이언트 하나. */
export function loadClient({ detectSessionInUrl = false, base = "./" } = {}) {
  if (!authConfigured()) return Promise.resolve(null);
  pending ??= new Promise((resolve, reject) => {
    if (globalThis.supabase?.createClient) return resolve();
    const s = document.createElement("script");
    s.src = base + LIB.slice(2);
    s.onload = () => resolve();
    s.onerror = () => reject(Error("auth.lib_load_failed"));
    document.head.append(s);
  }).then(() =>
    globalThis.supabase.createClient(GAME1_SUPABASE_URL, GAME1_SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl, storageKey: "game1-auth" },
    }),
  );
  return pending;
}
/** 이 기기에 로그인 세션이 남아 있는지(라이브러리를 불러오지 않고 확인) */
export const hasStoredSession = () => {
  try {
    return !!localStorage.getItem("game1-auth");
  } catch {
    return false;
  }
};
