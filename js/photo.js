// [photo.js] 프로필 사진 고르기와 1:1 자르기 창
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 사진 고르기 → 1:1 자르기 창
  $("photoInput").addEventListener("change", function () {
    var f = this.files && this.files[0];
    this.value = "";
    if (f) openCrop(f);
  });
  function clampN(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function openCrop(file) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var iw = img.naturalWidth, ih = img.naturalHeight;
      if (!iw || !ih) { URL.revokeObjectURL(url); return; }
      var maxW = Math.max(160, Math.min(340, window.innerWidth - 80)), maxH = Math.max(160, Math.min(340, window.innerHeight - 280));
      var k = Math.min(maxW / iw, maxH / ih), dw = Math.round(iw * k), dh = Math.round(ih * k);
      var stageEl = $("cropStage"), size = Math.round(Math.min(dw, dh) * 0.9);
      stageEl.style.width = dw + "px"; stageEl.style.height = dh + "px";
      $("cropImg").src = url;
      crop = { img: img, url: url, dw: dw, dh: dh, size: size, x: Math.round((dw - size) / 2), y: Math.round((dh - size) / 2), drag: null };
      drawCrop();
      $("cropModal").classList.add("on");
    };
    img.onerror = function () { URL.revokeObjectURL(url); };
    img.src = url;
  }
  function drawCrop() {
    var b = crop, box = $("cropBox");
    if (!b) return;
    box.style.left = b.x + "px"; box.style.top = b.y + "px"; box.style.width = b.size + "px"; box.style.height = b.size + "px";
  }
  function closeCrop() {
    if (crop) { try { URL.revokeObjectURL(crop.url); } catch (e) {} }
    crop = null;
    $("cropModal").classList.remove("on");
  }
  (function () {
    var stageEl = $("cropStage");
    stageEl.addEventListener("pointerdown", function (e) {
      var b = crop;
      if (!b) return;
      var r = stageEl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      var c = e.target && e.target.getAttribute ? e.target.getAttribute("data-c") : null;
      if (c) {                                          // 모서리: 반대쪽 모서리를 고정한 채 정사각형으로 크기 조절
        var right = c.charAt(1) === "r", bottom = c.charAt(0) === "b";
        b.drag = { type: "resize", ax: right ? b.x : b.x + b.size, ay: bottom ? b.y : b.y + b.size, sx: right ? 1 : -1, sy: bottom ? 1 : -1 };
      } else if (px >= b.x && px <= b.x + b.size && py >= b.y && py <= b.y + b.size) {
        b.drag = { type: "move", ox: px - b.x, oy: py - b.y };
      } else return;
      try { stageEl.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    stageEl.addEventListener("pointermove", function (e) {
      var b = crop;
      if (!b || !b.drag) return;
      var r = stageEl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, d = b.drag;
      if (d.type === "move") {
        b.x = clampN(px - d.ox, 0, b.dw - b.size); b.y = clampN(py - d.oy, 0, b.dh - b.size);
      } else {
        var raw = Math.max((px - d.ax) * d.sx, (py - d.ay) * d.sy);
        var maxX = d.sx > 0 ? b.dw - d.ax : d.ax, maxY = d.sy > 0 ? b.dh - d.ay : d.ay;
        var min = Math.min(48, b.dw, b.dh), size = Math.max(min, Math.min(raw, maxX, maxY));
        b.size = size; b.x = d.sx > 0 ? d.ax : d.ax - size; b.y = d.sy > 0 ? d.ay : d.ay - size;
      }
      drawCrop();
    });
    function endDrag() { if (crop) crop.drag = null; }
    stageEl.addEventListener("pointerup", endDrag);
    stageEl.addEventListener("pointercancel", endDrag);
  })();
  $("cropCancel").addEventListener("click", closeCrop);
  $("cropOk").addEventListener("click", function () {
    var b = crop;
    if (!b) return;
    var k = b.img.naturalWidth / b.dw, S = 112, c = document.createElement("canvas"), data = "";
    c.width = c.height = S;
    var ctx = c.getContext("2d");
    if (ctx) {
      ctx.drawImage(b.img, b.x * k, b.y * k, b.size * k, b.size * k, 0, 0, S, S);
      try { data = c.toDataURL("image/jpeg", 0.72); } catch (e) {}
    }
    closeCrop();
    if (validPhoto(data)) applyPhoto(data);
  });
  function placeProfile(anchor) {
    var pop = $("profilePop");
    pop.style.visibility = "hidden"; pop.classList.add("on");
    var r = anchor.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, pw = pop.offsetWidth, ph = pop.offsetHeight, G = 10, x, y;
    var sh = (profileM && chats[profileM.id]) ? chats[profileM.id].el.offsetWidth + 10 : 0;        // 이 사람과 채팅 중이면 채팅창 왼쪽으로 비켜서 뜸
    if (r.left - sh - G - pw >= 8) { x = r.left - sh - G - pw; y = r.top; }                // 카드 왼쪽 옆 (오른쪽 열이므로 기본)
    else if (r.right + G + pw <= vw - 8) { x = r.right + G; y = r.top; }                     // 왼쪽이 좁으면 오른쪽 옆
    else { x = Math.min(Math.max(8, r.left), vw - pw - 8); y = r.bottom + 8; if (y + ph > vh - 8) y = r.top - ph - 8; }   // 폰: 카드 아래(안 되면 위)
    y = Math.max(8, Math.min(y, vh - ph - 8));
    Object.keys(chats).forEach(function (k) {           // 어떤 채팅창과든 겹치면 그 왼쪽으로 비켜서 뜸 (자리가 없으면 채팅창 위에 뜸)
      var cr = chats[k].el.getBoundingClientRect();
      if (x < cr.right + 4 && x + pw > cr.left - 4 && y < cr.bottom + 4 && y + ph > cr.top - 4 && cr.left - G - pw >= 8) x = cr.left - G - pw;
    });
    pop.style.left = x + "px"; pop.style.top = y + "px"; pop.style.visibility = "";
  }
  document.addEventListener("click", function (e) {
    if (!profileKey) return;
    var t = e.target;
    if (t && t.closest && t.closest("#profilePop, #spyPop, #modal, #cropModal, #photoZoom")) return;
    closeProfile();
  });
  home.addEventListener("scroll", closeProfile, { passive: true });
  document.querySelector(".together").addEventListener("scroll", closeProfile, { passive: true });
  window.addEventListener("resize", closeProfile);

