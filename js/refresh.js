/* [자동 새로고침] 앱을 다시 열 때(5초 이상 벗어났다 돌아오면) 서버에 새 버전이 올라와 있을 때만 새로고침. 시험 중(session.v1 있음)·로그인 화면·설정 창이 열려 있을 때는 건너뜀.
   버전표는 <meta name="app-version"> — 파일을 올릴 때마다 값이 바뀜 */
(function(){
  var away = 0, checking = false;
  var m = document.querySelector('meta[name="app-version"]'), mine = m && m.content;
  function busy(){
    try { if (localStorage.getItem("examTimer.session.v1")) return true; } catch (e) {}
    if (document.body && document.body.classList.contains("loginOpen")) return true;          // 로그인 도중(구글 창에 다녀오는 중)에는 새로고침하지 않음
    var rm = document.getElementById("roomModal"); if (rm && rm.classList.contains("on")) return true;      // 설정 창(구글 계정 연결)이 열려 있을 때도
    var lo = document.getElementById("liteOverlay"); if (lo && !lo.classList.contains("off")) return true;      // 국어·수학 시계가 떠 있는 동안에도
    return false;
  }
  function check(){
    if (!mine || checking || busy()) return;
    checking = true;
    fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" })
      .then(function(r){ return r.text(); })
      .then(function(t){ var x = t.match(/<meta name="app-version" content="([^"]*)"/); if (x && x[1] !== mine && !busy()) location.reload(); })
      .catch(function(){})
      .then(function(){ checking = false; });
  }
  document.addEventListener("visibilitychange", function(){
    if (document.visibilityState === "hidden") { away = Date.now(); return; }
    if (away && Date.now() - away > 5000) check();
    away = 0;
  });
  window.addEventListener("pageshow", function(e){ if (e.persisted) check(); });
})();
/* [/자동 새로고침] */
