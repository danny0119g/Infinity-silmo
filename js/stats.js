// [stats.js] 전체 통계: 날짜별 응시 횟수 / 평균 점수(호머식 평균 포함) 그래프. 날짜 달력의 "전체 통계"를 누르면 켜짐
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var statsOn = false, statSel = "", statFocus = "";
  function trendTitleText(side) {
    if (statsOn) return side === "homer" ? "평균 점수 추이" : "응시 횟수 추이";
    return side === "homer" ? "시간 추이" : "점수 추이";
  }
  function setStats(on, quiet) {                     // 전체 통계 보기 켜기/끄기 (quiet: 화면을 다시 그리지 않음)
    on = !!on;
    if (statsOn === on && !quiet) return;
    statsOn = on; statSel = ""; statFocus = "";
    document.body.classList.toggle("statsView", on);
    var labs = $("chartSwitch").querySelectorAll(".lab");
    labs[0].textContent = on ? "횟수" : "점수"; labs[1].textContent = on ? "점수" : "시간";
    $("chartSwitch").setAttribute("aria-label", on ? "그래프 종류 전환 (횟수 또는 점수)" : "그래프 종류 전환 (점수 또는 시간)");
    chartMode = "score"; $("chartSwitch").setAttribute("data-pos", "score"); $("chartSwitch").setAttribute("aria-checked", "false");
    $("trendTitle").textContent = trendTitleText("score");
    if (typeof renderHistory === "function") renderHistory();
    if (!quiet) { clearSelection(); focusSubject = ""; renderToday(); }
  }
  function dayDiff(a, b) { return Math.round((dayDate(b) - dayDate(a)) / 86400000); }
  function r1(v) { return Math.round(v * 10) / 10; }
  function statsData() {                             // 날짜 오름차순: [{d, by:{과목:{n, sc:[점수], hs:[호머식 점수]}}}]
    var out = [];
    localDays().slice().sort().forEach(function (d) {
      var arr = loadDay(d); if (!arr.length) return;
      var by = {};
      arr.forEach(function (r) {
        var s = recSubject(r), o = by[s] || (by[s] = { n: 0, sc: [], hs: [] });
        o.n++; if (r.score1 != null) o.sc.push(r.score1); if (r.usedExtra && r.score2 != null) o.hs.push(r.score2);
      });
      out.push({ d: d, by: by });
    });
    return out;
  }
  function renderStatsInner() {
    var box = $("chart"), legend = $("legend"), info = $("pointInfo"), measuredW = box.clientWidth;
    box.textContent = ""; legend.textContent = ""; info.textContent = "";
    var score = chartMode === "homer";               // 오른쪽 = 평균 점수, 왼쪽 = 응시 횟수
    $("chartCard").setAttribute("data-mode", "stats");
    var data = statsData();
    var flat = []; data.forEach(function (x) { Object.keys(x.by).forEach(function (s) { flat.push({ subject: s }); }); });
    var color = colorMap(flat.map(function (q) { return { subject: q.subject }; }));
    var names = []; flat.forEach(function (q) { if (names.indexOf(q.subject) < 0) names.push(q.subject); });
    if (!data.length) { box.appendChild(el("p", "empty", "응시 기록이 쌓이면 여기에 날짜별 통계가 그려져요.")); return; }
    if (statFocus && names.indexOf(statFocus) < 0) statFocus = "";
    // 범례 (누르면 그 과목만)
    legend.classList.toggle("has-focus", !!statFocus);
    names.forEach(function (name) {
      var on = name === statFocus, item = el("button", "item" + (on ? " on" : ""));
      item.type = "button"; item.setAttribute("aria-pressed", on ? "true" : "false");
      var sw = el("span", "sw"); sw.style.background = color[name];
      item.appendChild(sw); item.appendChild(document.createTextNode(name));
      item.addEventListener("click", function () { statFocus = on ? "" : name; statSel = ""; renderChart(); });
      legend.appendChild(item);
    });
    var shown = statFocus ? [statFocus] : names;
    // 과목·날짜별 값
    var series = {}, vals = [];
    shown.forEach(function (s) {
      series[s] = [];
      data.forEach(function (x) {
        var o = x.by[s]; if (!o) return;
        var pt = { d: x.d, n: o.n, avg: o.sc.length ? mean(o.sc) : null, max: o.sc.length ? Math.max.apply(null, o.sc) : null, min: o.sc.length ? Math.min.apply(null, o.sc) : null, sn: o.sc.length, havg: o.hs.length ? mean(o.hs) : null, hn: o.hs.length };
        series[s].push(pt);
        if (!score) vals.push(pt.n); else { if (pt.avg != null) vals.push(pt.avg); if (pt.havg != null) vals.push(pt.havg); }
      });
    });
    if (!vals.length) { box.appendChild(el("p", "empty", score ? "점수를 입력한 기록이 생기면 평균 점수가 그려져요." : "표시할 기록이 없어요.")); return; }
    var W = Math.max(280, Math.round(measuredW || 600)), H = Math.round(Math.max(250, Math.min(350, W * 0.56)));
    var L = 40, R = 16, T = 20, B = 30, PAD = 14, plotW = W - L - R, plotH = H - T - B, innerW = plotW - 2 * PAD;
    var lo, hi, step;
    if (!score) { lo = 0; hi = Math.max(1, Math.max.apply(null, vals)); step = hi <= 6 ? 1 : (hi <= 12 ? 2 : (hi <= 30 ? 5 : 10)); hi = Math.ceil(hi / step) * step; }
    else { var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals); hi = Math.min(50, Math.ceil((mx + 2) / 5) * 5); lo = Math.max(0, Math.floor((mn - 3) / 5) * 5); if (hi - lo < 10) lo = Math.max(0, hi - 10); step = hi - lo <= 20 ? 5 : 10; lo = Math.floor(lo / step) * step; }
    var first = data[0].d, last = data[data.length - 1].d, span = Math.max(1, dayDiff(first, last));
    function X(d) { return data.length === 1 ? L + plotW / 2 : L + PAD + dayDiff(first, d) / span * innerW; }
    function Y(v) { return T + (hi - v) / (hi - lo) * plotH; }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": score ? "날짜별 평균 점수" : "날짜별 응시 횟수" });
    for (var tv = lo; tv <= hi; tv += step) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: Y(tv), y2: Y(tv), stroke: TC.line, "stroke-width": 1 }));
      var yl = svgEl("text", { x: L - 8, y: Y(tv) + 4, "text-anchor": "end", "font-size": 12, fill: TC.muted }); yl.textContent = tv; svg.appendChild(yl);
    }
    // 가로축: 날짜 (자리에 맞게 간격을 골라 표시)
    var cand = [1, 2, 3, 7, 14, 30, 60, 90, 180, 365], dstep = 365;
    for (var ci = 0; ci < cand.length; ci++) if (span / cand[ci] <= Math.max(2, Math.floor(innerW / 56))) { dstep = cand[ci]; break; }
    for (var k = 0; k <= span; k += dstep) {
      var dd = dayAdd(first, k), p = dd.split("-"), xl = svgEl("text", { x: X(dd), y: H - 8, "text-anchor": "middle", "font-size": 12, fill: TC.muted });
      xl.textContent = Number(p[1]) + "/" + Number(p[2]); svg.appendChild(xl);
      if (data.length === 1) break;
    }
    var plist = [];
    shown.forEach(function (s) {
      var list = series[s], c = color[s], lc = lighten(c, 0.5);
      var main = list.filter(function (q) { return score ? q.avg != null : true; });
      if (main.length > 1) svg.appendChild(svgEl("polyline", { points: main.map(function (q) { return X(q.d).toFixed(1) + "," + Y(score ? q.avg : q.n).toFixed(1); }).join(" "), fill: "none", stroke: c, "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      if (score) {                                    // 호머식 평균: 같은 과목의 밝은 색 점선
        var hl = list.filter(function (q) { return q.havg != null; });
        if (hl.length > 1) svg.appendChild(svgEl("polyline", { points: hl.map(function (q) { return X(q.d).toFixed(1) + "," + Y(q.havg).toFixed(1); }).join(" "), fill: "none", stroke: lc, "stroke-width": 2, "stroke-dasharray": "6 5", "stroke-linejoin": "round", "stroke-linecap": "round" }));
        hl.forEach(function (q) { plist.push({ key: s + "|" + q.d + "|h", s: s, q: q, kind: "h", x: X(q.d), y: Y(q.havg), color: lc }); });
      }
      main.forEach(function (q) { plist.push({ key: s + "|" + q.d + "|a", s: s, q: q, kind: "a", x: X(q.d), y: Y(score ? q.avg : q.n), color: c }); });
    });
    var sel = null; plist.forEach(function (pt) { if (pt.key === statSel) sel = pt; });
    if (!sel) statSel = "";
    plist.forEach(function (pt) {
      var on = pt.key === statSel, hollow = pt.kind === "h";
      if (on) svg.appendChild(svgEl("circle", { cx: pt.x, cy: pt.y, r: 9, fill: "none", stroke: TC.text, "stroke-width": 2 }));
      svg.appendChild(svgEl("circle", hollow ? { cx: pt.x, cy: pt.y, r: 4.8, fill: TC.panel, stroke: pt.color, "stroke-width": 2.4 } : { cx: pt.x, cy: pt.y, r: 4.8, fill: pt.color, stroke: TC.panel, "stroke-width": 2 }));
      var hit = svgEl("circle", { cx: pt.x, cy: pt.y, r: 14, fill: "transparent", style: "cursor:pointer" });
      hit.addEventListener("click", function (e) { e.stopPropagation(); statSel = (statSel === pt.key) ? "" : pt.key; renderChart(); });
      svg.appendChild(hit);
    });
    box.appendChild(svg);
    // 점을 누르면: 그날의 최고점·최저점 (호머식 점은 호머식 평균)
    if (sel) {
      var q = sel.q, p2 = q.d.split("-"), box2 = el("div", "statInfo");
      var dot = el("span", "cdot"); dot.style.background = sel.color;
      var head = el("div", "statHead"); head.appendChild(dot); head.appendChild(el("b", "", sel.s)); head.appendChild(el("span", "", " · " + Number(p2[1]) + "월 " + Number(p2[2]) + "일 (" + HIST_WD[dayDate(q.d).getDay()] + ")"));
      box2.appendChild(head);
      var line;
      if (!score) line = "그날 " + q.n + "회 응시";
      else if (sel.kind === "h") line = "호머식 평균 " + r1(q.havg) + "점 (" + q.hn + "회)";
      else line = "평균 " + r1(q.avg) + "점 · 최고 " + q.max + "점 · 최저 " + q.min + "점 (" + q.sn + "회)";
      box2.appendChild(el("div", "statLine", line));
      if (score && sel.kind === "a" && q.havg != null) box2.appendChild(el("div", "statSub", "호머식 평균 " + r1(q.havg) + "점 (" + q.hn + "회)"));
      info.appendChild(box2);
    } else if (score) info.appendChild(el("div", "statHint", "점을 누르면 그날의 최고점과 최저점이 나와요. 점선은 호머식 평균이에요."));
    else info.appendChild(el("div", "statHint", "점을 누르면 그날의 응시 횟수가 나와요."));
  }
