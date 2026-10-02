// [lite.js] 국어·수학 시계 전용 라이트 버전(lite.html)을 전체 화면으로 띄움
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 안쪽 페이지를 미리 불러 두고(투명·클릭 불가), 버튼을 누르면 켜기만 해서 로딩·흰 화면이 보이지 않게 함
  var liteOv = $("liteOverlay"), liteFr = $("liteFrame"), liteReady = false, liteFsT = 0;
  function liteLoad() { liteReady = false; liteFr.src = "lite.html?embed=1&t=" + Date.now(); }
  liteFr.addEventListener("load", function () { liteReady = true; });
  function liteStandalone() { return !!(window.navigator.standalone || (window.matchMedia && matchMedia("(display-mode: standalone)").matches)); }
  function openLite() {
    if (!liteReady) liteLoad();                          // 아직 못 불러왔으면 지금 불러옴
    liteOv.classList.remove("off");
    if (!liteStandalone()) {                             // 홈 화면 앱은 이미 전체 화면이라 전환 효과를 쓰지 않음
      try { var rq = liteOv.requestFullscreen || liteOv.webkitRequestFullscreen; if (rq) { var pr = rq.call(liteOv); if (pr && pr.catch) pr.catch(function () {}); } } catch (e) {}
    }
  }
  function closeLite() {
    liteOv.classList.add("off");
    try { if ((document.fullscreenElement || document.webkitFullscreenElement) === liteOv) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } } catch (e) {}
    clearTimeout(liteFsT); liteFsT = setTimeout(liteLoad, 400);     // 닫힌 뒤 새로 불러 둠(시계·화면 켜짐 유지도 여기서 끝남)
  }
  $("liteOpen").addEventListener("click", openLite);
  window.addEventListener("message", function (e) { if (e.source === liteFr.contentWindow && e.data === "lite-close") closeLite(); });
  if (window.requestIdleCallback) requestIdleCallback(liteLoad, { timeout: 3000 }); else setTimeout(liteLoad, 1200);
