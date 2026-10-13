// 로그인 복귀 페이지(SB-0003 의 정확한 복귀 주소 /auth/). Google·메일 확인·비밀번호 재설정 링크가 여기로 온다.
// 코드를 세션으로 바꾸고 게임으로 돌려보낸다. 결과는 ?auth=<결과 키> 로만 전한다(토큰·코드는 주소에 남기지 않음).
import { t as T, applyStatic } from "../i18n.js";
import { readAuthReturn, passwordProblem, errorKey, errorRef } from "../account.js";
import { loadClient, authConfigured } from "../supabase-client.js";
import { AUTH_MESSAGES } from "../account-ui.js";

const $ = (id) => document.getElementById(id);
applyStatic();
const home = (result) => location.replace("../?auth=" + encodeURIComponent(result));
const say = (key) => {
  $("authStatus").textContent = T(AUTH_MESSAGES[key] || AUTH_MESSAGES.generic);
  $("authBack").hidden = false;
};

async function main() {
  const r = readAuthReturn(location.search, location.hash);
  history.replaceState(null, "", location.pathname); // 코드가 주소창·방문 기록에 남지 않게
  if (r.kind === "error") return home(r.back);
  if (r.kind === "none") return home("generic");
  if (!authConfigured()) return say("unavailable");
  let recovery = false;
  const client = await loadClient({ base: "../" });
  client.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recovery = true;
  });
  const { error } = await client.auth.exchangeCodeForSession(r.code);
  // 다른 기기·브라우저에서 메일 링크를 연 경우: 확인은 됐을 수 있지만 이 기기에서 로그인을 마칠 수 없다
  if (error) return say(errorKey(error) === "network" ? "network" : "confirm_other_device");
  if (!recovery) return home("signed_in");
  $("authStatus").textContent = T("새 비밀번호를 정해 주세요.");
  $("recoverForm").hidden = false;
  $("recoverForm").onsubmit = async (e) => {
    e.preventDefault();
    const pw = $("recoverPassword").value,
      problem = passwordProblem(pw);
    if (problem) return ($("authStatus").textContent = T(AUTH_MESSAGES[problem]));
    $("recoverSave").disabled = true;
    const { error: err } = await client.auth.updateUser({ password: pw });
    $("recoverSave").disabled = false;
    if (err) {
      const key = errorKey(err);
      return ($("authStatus").textContent = T(AUTH_MESSAGES[key] || AUTH_MESSAGES.generic) + (key === "generic" && errorRef(err) ? " " + T("(오류 코드: {ref})", { ref: errorRef(err) }) : ""));
    }
    home("password_updated");
  };
}
main().catch(() => say("generic"));
