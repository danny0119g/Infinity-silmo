// [auth.js] 로그인 (Firebase Authentication REST + Google Identity Services). SDK 없이 동작.
// 이 파일은 앱(index.html)과 로그인 점검 페이지(auth-test.html)가 같이 씁니다. 다른 파일에 의존하지 않음.
  // 새 서버 구조(v2: 로그인 필요) 스위치. false면 지금까지처럼 로그인 없이 옛 구조로 동작. 규칙을 새로 붙여넣은 뒤에 true로 바꿈.
  var AUTH_REQUIRED = false;
  var USE_V2 = AUTH_REQUIRED;
  var FB_API_KEY = "AIzaSyAuq8pMbt6u56cuReLLBo1j9CIYWh-MpeQ";                                  // 웹 앱용 공개 키 (비밀이 아님)
  var GOOGLE_CLIENT_ID = "710576098481-rmhuv2j1ejtb7dob9s1k49d304qrojl4.apps.googleusercontent.com";
  var AUTH_KEY = "examTimer.auth.v1";
  // fbAuth: { uid, refresh(갱신용), token(1시간짜리), exp(만료 시각 ms), kind: "google" | "anon" } 또는 null
  function loadFbAuth() {
    try {
      var o = JSON.parse(localStorage.getItem(AUTH_KEY));
      if (o && typeof o.uid === "string" && typeof o.refresh === "string" && o.refresh.length > 20 && (o.kind === "google" || o.kind === "anon")) {
        return { uid: o.uid, refresh: o.refresh, token: typeof o.token === "string" ? o.token : "", exp: typeof o.exp === "number" ? o.exp : 0, kind: o.kind };
      }
    } catch (e) {}
    return null;
  }
  var fbAuth = loadFbAuth();
  function saveFbAuth(a) {
    fbAuth = a;
    try { if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); } catch (e) {}
  }
  function authCall(url, body, asForm) {             // 실패하면 Error(서버가 준 코드) 를 던짐
    var opt = { method: "POST", headers: { "Content-Type": asForm ? "application/x-www-form-urlencoded" : "application/json" }, body: asForm ? body : JSON.stringify(body) };
    return fetch(url, opt).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) { var m = (j && j.error && j.error.message) || ("http " + res.status); throw new Error(String(m).split(" ")[0]); }
        return j;
      });
    });
  }
  function applyAuthResult(j, kind) {                // 로그인/갱신 응답을 저장
    var token = j.idToken || j.id_token, refresh = j.refreshToken || j.refresh_token, uid = j.localId || j.user_id, sec = Number(j.expiresIn || j.expires_in) || 3600;
    if (!token || !refresh || !uid) throw new Error("BAD_RESPONSE");
    saveFbAuth({ uid: uid, refresh: refresh, token: token, exp: Date.now() + sec * 1000, kind: kind || (fbAuth && fbAuth.kind) || "anon" });
    return fbAuth;
  }
  function authSignInAnonymous() {
    return authCall("https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + FB_API_KEY, { returnSecureToken: true }).then(function (j) { return applyAuthResult(j, "anon"); });
  }
  function authSignInGoogle(credential) {            // credential: 구글이 준 ID 토큰(JWT)
    function exchange(linkToken) {
      var body = { postBody: "id_token=" + encodeURIComponent(credential) + "&providerId=google.com", requestUri: location.origin || "http://localhost", returnIdpCredential: true, returnSecureToken: true };
      if (linkToken) body.idToken = linkToken;       // 이 기기에서만 쓰던 계정(익명)이 있으면 그 계정에 구글을 연결
      return authCall("https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=" + FB_API_KEY, body);
    }
    var link = (fbAuth && fbAuth.kind === "anon" && fbAuth.token) ? authToken().catch(function () { return ""; }) : Promise.resolve("");
    return link.then(function (lt) {
      return exchange(lt).catch(function (err) {
        if (lt && (err.message === "FEDERATED_USER_ID_ALREADY_LINKED" || err.message === "CREDENTIAL_ALREADY_IN_USE")) return exchange("");   // 이미 다른 계정에 연결된 구글이면 그 계정으로 로그인
        throw err;
      });
    }).then(function (j) { return applyAuthResult(j, "google"); });
  }
  function authRefresh() {
    if (!fbAuth) return Promise.reject(new Error("NO_AUTH"));
    var cur = fbAuth;
    return authCall("https://securetoken.googleapis.com/v1/token?key=" + FB_API_KEY, "grant_type=refresh_token&refresh_token=" + encodeURIComponent(cur.refresh), true).then(function (j) { return applyAuthResult(j, cur.kind); });
  }
  var authRefreshing = null;
  function authToken() {                             // 쓸 수 있는 토큰을 돌려줌 (만료 1분 전이면 갱신)
    if (!fbAuth) return Promise.reject(new Error("NO_AUTH"));
    if (fbAuth.token && fbAuth.exp - Date.now() > 60000) return Promise.resolve(fbAuth.token);
    if (!authRefreshing) authRefreshing = authRefresh().then(function (a) { authRefreshing = null; return a.token; }, function (e) { authRefreshing = null; throw e; });
    return authRefreshing;
  }
  function authSignOut() { saveFbAuth(null); }
  var gsiPromise = null;
  function authLoadGsi() {                           // 구글 로그인 스크립트를 한 번만 불러옴
    if (typeof google !== "undefined" && google.accounts && google.accounts.id) return Promise.resolve();
    if (gsiPromise) return gsiPromise;
    gsiPromise = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { gsiPromise = null; reject(new Error("GSI_LOAD_FAILED")); };
      document.head.appendChild(s);
    });
    return gsiPromise;
  }
  // 구글 로그인 버튼을 box 안에 그림. 성공하면 onDone(fbAuth), 실패하면 onError(Error)
  function authRenderGoogleButton(box, onDone, onError) {
    return authLoadGsi().then(function () {
      google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID, ux_mode: "popup", auto_select: false, cancel_on_tap_outside: true,
        callback: function (resp) {
          if (!resp || !resp.credential) { onError(new Error("NO_CREDENTIAL")); return; }
          authSignInGoogle(resp.credential).then(onDone, onError);
        }
      });
      box.textContent = "";
      google.accounts.id.renderButton(box, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "pill", width: 260, locale: "ko" });
    }, onError);
  }
  function authErrorText(err) {                      // 사람이 읽을 수 있는 설명
    var m = err && err.message || "";
    var map = {
      GSI_LOAD_FAILED: "구글 로그인 스크립트를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.",
      NO_CREDENTIAL: "구글에서 로그인 정보를 받지 못했어요.",
      OPERATION_NOT_ALLOWED: "Firebase에서 이 로그인 방식이 꺼져 있어요. (Authentication > 로그인 방법)",
      INVALID_IDP_RESPONSE: "구글 로그인 정보가 맞지 않아요. 웹 클라이언트 ID나 승인된 원본을 확인해 주세요.",
      API_KEY_INVALID: "웹 API 키가 올바르지 않아요.",
      INVALID_KEY: "웹 API 키가 올바르지 않아요.",
      TOKEN_EXPIRED: "로그인이 만료됐어요. 다시 로그인해 주세요.",
      USER_DISABLED: "이 계정은 사용할 수 없어요.",
      USER_NOT_FOUND: "계정을 찾을 수 없어요. 다시 로그인해 주세요.",
      INVALID_REFRESH_TOKEN: "로그인이 만료됐어요. 다시 로그인해 주세요.",
      TOO_MANY_ATTEMPTS_TRY_LATER: "시도가 너무 많아요. 잠시 뒤 다시 해 주세요."
    };
    if (map[m]) return map[m];
    if (/^Failed to fetch|NetworkError|Load failed/i.test(m) || m === "") return "인터넷에 연결하지 못했어요.";
    return "로그인에 실패했어요. (" + m + ")";
  }
