// [login.js] 앱을 열면 보이는 로그인 화면 (구글 로그인 + 이 기기에서만 쓰기)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // AUTH_REQUIRED(켜면 로그인하기 전에는 앱이 열리지 않음)는 auth.js 맨 위에 있음
  function loginDone() { location.reload(); }          // 로그인한 뒤에는 새로 불러와서 내 계정 기준으로 모든 것을 다시 시작
  function showLogin() { $("loginScreen").classList.remove("hidden"); document.body.classList.add("loginOpen"); }
  function hideLogin() { $("loginScreen").classList.add("hidden"); document.body.classList.remove("loginOpen"); }
  function setLoginErr(t) { $("loginErr").textContent = t || ""; }
  function startLogin() {
    showLogin(); setLoginErr("");
    authRenderGoogleButton($("loginGoogle"), function () { setLoginErr(""); loginDone(); }, function (e) { setLoginErr(authErrorText(e)); });
  }
  $("loginAnon").addEventListener("click", function () {
    var b = this; b.disabled = true; setLoginErr("");
    authSignInAnonymous().then(function () { b.disabled = false; loginDone(); }, function (e) { b.disabled = false; setLoginErr(authErrorText(e)); });
  });
  (function () {
    if (!AUTH_REQUIRED) return;
    if (!fbAuth) { startLogin(); return; }
    authToken().catch(function (e) {                 // 이미 로그인돼 있으면 조용히 토큰만 갱신. 계정이 사라졌거나 만료된 경우에만 다시 로그인
      if (/INVALID_REFRESH_TOKEN|USER_NOT_FOUND|USER_DISABLED|TOKEN_EXPIRED/.test(e && e.message)) { saveFbAuth(null); startLogin(); }
    });
  })();
