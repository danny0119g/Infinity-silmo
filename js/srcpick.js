// [srcpick.js] 실모 업체(서바·전국서바·강k·강k+·기타) 고르기 + 그래프 점 모양
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var SRC_DEFAULTS = ["서바", "전국서바", "강k", "강k+"], SRC_KEY = "examTimer.srcCustom.v1", SRC_MAX_CUSTOM = 8;
  function cleanSrc(v) { return typeof v === "string" ? v.trim().slice(0, 10) : ""; }
  function loadSrcCustom() {
    try { var a = JSON.parse(localStorage.getItem(SRC_KEY) || "[]"); return Array.isArray(a) ? a.map(cleanSrc).filter(function (s, i, ar) { return s && SRC_DEFAULTS.indexOf(s) < 0 && ar.indexOf(s) === i; }).slice(0, SRC_MAX_CUSTOM) : []; } catch (e) { return []; }
  }
  var SRC_HIDE_KEY = "examTimer.srcHidden.v1";       // 지운 기본 업체
  function loadSrcHidden() { try { var a = JSON.parse(localStorage.getItem(SRC_HIDE_KEY) || "[]"); return Array.isArray(a) ? a.filter(function (x) { return SRC_DEFAULTS.indexOf(x) >= 0; }) : []; } catch (e) { return []; } }
  function saveSrcHidden(a) { try { localStorage.setItem(SRC_HIDE_KEY, JSON.stringify(a)); } catch (e) {} }
  function srcOptions() { var h = loadSrcHidden(); return SRC_DEFAULTS.filter(function (n) { return h.indexOf(n) < 0; }).concat(loadSrcCustom()); }
  function srcFirst() { var o = srcOptions(); return o.length ? o[0] : ""; }
  function removeSrcOption(n) {
    if (SRC_DEFAULTS.indexOf(n) >= 0) { var h = loadSrcHidden(); if (h.indexOf(n) < 0) h.push(n); saveSrcHidden(h); }
    else saveSrcCustom(loadSrcCustom().filter(function (x) { return x !== n; }));
  }
  function saveSrcCustom(a) { try { localStorage.setItem(SRC_KEY, JSON.stringify(a)); } catch (e) {} }
  // 방금 친 시험의 업체 (없으면 "")
  function lastUsedSrc() {
    var days = localDays().slice().sort().reverse();
    for (var i = 0; i < days.length; i++) {
      var arr = loadDay(days[i]);
      for (var j = arr.length - 1; j >= 0; j--) if (arr[j].src && srcOptions().indexOf(arr[j].src) >= 0) return arr[j].src;
    }
    return "";
  }
  // 업체 이름 테두리 색: 파란색을 바탕으로 조금씩만 변주
  var SRC_HUES = { "서바": [217, 90, 62], "전국서바": [197, 80, 56], "강k": [236, 85, 70], "강k+": [258, 80, 72] };
  function srcColor(name) { var h = SRC_HUES[name] || [210, 40, 62]; return "hsl(" + h[0] + "," + h[1] + "%," + h[2] + "%)"; }
  var CHEV_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  // box 안에 드롭다운을 그림. get(): 지금 고른 값, set(v): 바꾸기, placeholder: 값이 없을 때 글자
  function buildSrcPicker(box, get, set, placeholder) {
    var listOpen = false, otherOpen = false;
    function render() {
      box.textContent = "";
      var cur = get(), wrap = el("div", "srcdd");
      var sel = el("button", "srcsel" + (listOpen ? " open" : ""));
      sel.type = "button"; sel.setAttribute("aria-haspopup", "listbox"); sel.setAttribute("aria-expanded", listOpen ? "true" : "false");
      sel.appendChild(el("span", "v" + (cur ? "" : " none"), cur || placeholder || "업체 선택"));
      var ar = el("span", "arr"); ar.innerHTML = CHEV_ICON; sel.appendChild(ar);
      sel.addEventListener("click", function () { listOpen = !listOpen; if (!listOpen) otherOpen = false; render(); });
      wrap.appendChild(sel);
      if (listOpen) {
        var list = el("div", "srclist");
        function opt(name) {
          var on = cur === name, b = el("button", "srcopt" + (on ? " on" : ""), name);
          b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false");
          b.addEventListener("click", function () { set(name); listOpen = false; otherOpen = false; render(); });
          return b;
        }
        srcOptions().forEach(function (n) {          // 기본·기타 모두 오른쪽 휴지통으로 지움
          var row = el("div", "srcrow"), tr = el("button", "srctrash");
          tr.type = "button"; tr.innerHTML = TRASH_ICON; tr.setAttribute("aria-label", n + " 삭제"); tr.setAttribute("title", "목록에서 삭제");
          tr.addEventListener("click", function () {
            removeSrcOption(n);
            if (get() === n) set("");
            render();
          });
          row.appendChild(opt(n)); row.appendChild(tr); list.appendChild(row);
        });
        var ob = el("button", "srcopt other" + (otherOpen ? " on" : ""), "기타");
        ob.type = "button"; ob.setAttribute("aria-expanded", otherOpen ? "true" : "false");
        ob.addEventListener("click", function () { otherOpen = !otherOpen; render(); if (otherOpen) { var i = box.querySelector("input"); if (i) i.focus(); } });
        list.appendChild(ob);
        if (otherOpen) {
          var row2 = el("div", "srcadd"), inp = el("input", "tinput"), add = el("button", "srcaddbtn", "추가");
          inp.type = "text"; inp.maxLength = 10; inp.placeholder = "업체 이름"; inp.setAttribute("autocomplete", "off"); inp.setAttribute("aria-label", "기타 업체 이름");
          add.type = "button";
          function commit() {
            var v = cleanSrc(inp.value); if (!v) return;
            var ls = loadSrcCustom();
            if (SRC_DEFAULTS.indexOf(v) >= 0) saveSrcHidden(loadSrcHidden().filter(function (x) { return x !== v; }));      // 지웠던 기본 업체를 다시 쓰면 되살림
            else if (ls.indexOf(v) < 0) { ls.push(v); if (ls.length > SRC_MAX_CUSTOM) ls.shift(); saveSrcCustom(ls); }
            listOpen = false; otherOpen = false; set(v); render();
          }
          add.addEventListener("click", commit);
          inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); } });
          inp.addEventListener("focus", function () { if (typeof exitFullscreen === "function") exitFullscreen(); });
          row2.appendChild(inp); row2.appendChild(add); list.appendChild(row2);
        }
        wrap.appendChild(list);
      }
      box.appendChild(wrap);
    }
    render();
  }
  // 그래프 점 모양 초안: 서바 ●, 전국서바 ■, 강k ▲, 강k+ ◆, 기타 ⬢, 업체 없음 ●
  var SRC_SHAPE_CH = ["●", "■", "▲", "◆", "⬢"];
  function srcShapeIdx(src) { if (!src) return 0; var i = SRC_DEFAULTS.indexOf(src); return i < 0 ? 4 : i; }
  function srcMarker(src, cx, cy, r, fill, stroke, sw) {
    var a = { fill: fill, stroke: stroke, "stroke-width": sw, "stroke-linejoin": "round" }, t = srcShapeIdx(src), p;
    function poly(pts) { a.points = pts.map(function (q) { return (cx + q[0] * r).toFixed(1) + "," + (cy + q[1] * r).toFixed(1); }).join(" "); return svgEl("polygon", a); }
    if (t === 1) { a.x = cx - r * 0.9; a.y = cy - r * 0.9; a.width = r * 1.8; a.height = r * 1.8; return svgEl("rect", a); }
    if (t === 2) return poly([[0, -1.15], [1.1, 0.85], [-1.1, 0.85]]);
    if (t === 3) return poly([[0, -1.25], [1.1, 0], [0, 1.25], [-1.1, 0]]);
    if (t === 4) return poly([[0, -1.15], [1, -0.58], [1, 0.58], [0, 1.15], [-1, 0.58], [-1, -0.58]]);
    a.cx = cx; a.cy = cy; a.r = r; return svgEl("circle", a);
  }
  // 기록 목록에서 업체 고치기
  var srcEditId = "", srcEditVal = "";
  function openSrcEdit(rec) {
    srcEditId = rec.id; srcEditVal = (typeof rec.src === "string") ? rec.src : "";
    buildSrcPicker($("srcEditPick"), function () { return srcEditVal; }, function (v) { srcEditVal = v; });
    $("srcModal").classList.add("on");
  }
  function closeSrcEdit() { $("srcModal").classList.remove("on"); srcEditId = ""; }
  $("srcEditSave").addEventListener("click", function () {
    var all = loadView(), rec = findRec(all, srcEditId);
    if (rec && (rec.src || "") !== srcEditVal) { rec.src = srcEditVal; saveAll(all, viewDayStr()); }
    closeSrcEdit(); renderToday();
  });
  $("srcEditCancel").addEventListener("click", closeSrcEdit);
  $("srcModal").addEventListener("click", function (e) { if (e.target === $("srcModal")) closeSrcEdit(); });
