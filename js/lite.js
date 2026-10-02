// [lite.js] 국어·수학 시계 전용 라이트 버전(lite.html)을 전체 화면으로 띄움
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var liteOv = $("liteOverlay"), liteFr = $("liteFrame");
  function openLite() {
    liteOv.classList.add("loading");                    // 다 불러올 때까지 투명하게 두었다가 부드럽게 나타냄 (흰 화면 번쩍임 방지)
    liteFr.src = "lite.html?embed=1&t=" + Date.now();
    liteOv.classList.remove("hidden");
    clearTimeout(liteShowT); liteShowT = setTimeout(showLite, 1500);
    try { var rq = liteOv.requestFullscreen || liteOv.webkitRequestFullscreen; if (rq) { var pr = rq.call(liteOv); if (pr && pr.catch) pr.catch(function () {}); } } catch (e) {}
  }
  var liteShowT = 0;
  function showLite() { clearTimeout(liteShowT); requestAnimationFrame(function () { liteOv.classList.remove("loading"); }); }
  liteFr.addEventListener("load", function () { if (liteFr.getAttribute("src") && liteFr.getAttribute("src") !== "about:blank") showLite(); });
  function closeLite() {
    clearTimeout(liteShowT);
    liteOv.classList.add("hidden");
    liteFr.src = "about:blank";                       // 시계·화면 켜짐 유지를 멈춤
    try { if ((document.fullscreenElement || document.webkitFullscreenElement) === liteOv) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); } } catch (e) {}
  }
  $("liteOpen").addEventListener("click", openLite);
  window.addEventListener("message", function (e) { if (e.source === liteFr.contentWindow && e.data === "lite-close") closeLite(); });
