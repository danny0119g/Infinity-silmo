// [srcpick.js] 실모 업체(서바·전국서바·강k·강k+·기타) 고르기 + 그래프 점 모양
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var SRC_DEFAULTS = ["서바", "전국서바", "강k", "강k+"], SRC_KEY = "examTimer.srcCustom.v1", SRC_MAX_CUSTOM = 8;
  function cleanSrc(v) { return typeof v === "string" ? v.trim().slice(0, 10) : ""; }
  function loadSrcCustom() {
    try { var a = JSON.parse(localStorage.getItem(SRC_KEY) || "[]"); return Array.isArray(a) ? a.map(cleanSrc).filter(function (s, i, ar) { return s && SRC_DEFAULTS.indexOf(s) < 0 && ar.indexOf(s) === i; }).slice(0, SRC_MAX_CUSTOM) : []; } catch (e) { return []; }
  }
  function saveSrcCustom(a) { try { localStorage.setItem(SRC_KEY, JSON.stringify(a)); } catch (e) {} }
  // box 안에 고르기 상자를 그림. get(): 지금 고른 값, set(v): 고른 값 바꾸기 ("" = 선택 안 함)
  function buildSrcPicker(box, get, set) {
    var otherOpen = false;
    function render() {
      box.textContent = "";
      var cur = get(), customs = loadSrcCustom(), wrap = el("div", "srcbox"), grid = el("div", "srcgrid");
      function opt(name, cls) {
        var on = cur === name, b = el("button", "srcopt" + (on ? " on" : "") + (cls ? " " + cls : ""), name);
        b.type = "button"; b.setAttribute("aria-pressed", on ? "true" : "false");
        b.addEventListener("click", function () { set(on ? "" : name); render(); });
        return b;
      }
      SRC_DEFAULTS.forEach(function (n) { grid.appendChild(opt(n)); });
      wrap.appendChild(grid);
      customs.forEach(function (n) {                 // 저장해 둔 기타 업체 (오른쪽 휴지통으로 지움)
        var row = el("div", "srcrow"), tr = el("button", "srctrash");
        tr.type = "button"; tr.innerHTML = TRASH_ICON; tr.setAttribute("aria-label", n + " 삭제"); tr.setAttribute("title", "목록에서 삭제");
        tr.addEventListener("click", function () {
          saveSrcCustom(loadSrcCustom().filter(function (x) { return x !== n; }));
          if (get() === n) set("");
          render();
        });
        row.appendChild(opt(n)); row.appendChild(tr); wrap.appendChild(row);
      });
      var ob = el("button", "srcopt other" + (otherOpen ? " on" : ""), "기타");
      ob.type = "button"; ob.setAttribute("aria-expanded", otherOpen ? "true" : "false");
      ob.addEventListener("click", function () { otherOpen = !otherOpen; render(); if (otherOpen) { var i = box.querySelector("input"); if (i) i.focus(); } });
      wrap.appendChild(ob);
      if (otherOpen) {
        var row2 = el("div", "srcadd"), inp = el("input", "tinput"), add = el("button", "srcaddbtn", "추가");
        inp.type = "text"; inp.maxLength = 10; inp.placeholder = "업체 이름"; inp.setAttribute("autocomplete", "off"); inp.setAttribute("aria-label", "기타 업체 이름");
        add.type = "button";
        function commit() {
          var v = cleanSrc(inp.value); if (!v) return;
          var list = loadSrcCustom();
          if (SRC_DEFAULTS.indexOf(v) < 0 && list.indexOf(v) < 0) { list.push(v); if (list.length > SRC_MAX_CUSTOM) list.shift(); saveSrcCustom(list); }
          otherOpen = false; set(v); render();
        }
        add.addEventListener("click", commit);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); commit(); } });
        inp.addEventListener("focus", function () { if (typeof exitFullscreen === "function") exitFullscreen(); });
        row2.appendChild(inp); row2.appendChild(add); wrap.appendChild(row2);
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
