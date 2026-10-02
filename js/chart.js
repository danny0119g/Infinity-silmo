// [chart.js] 점수·시간 추이 그래프, 추세곡선, 점수/시간 스위치
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 추이 그래프 (가로축: 회차, 과목별 꺾은선) ----------
  // 점수 추이: 세로축 점수 (위로 갈수록 높음). 기본은 29~50점만 보이고 그 아래는 가려져 있다가 눌러서 펼침
  // 시간 추이: 세로축 시간 (위로 갈수록 짧음)
  var PALETTE = ["#4da3ff", "#ff9f43", "#3ddc97", "#ff6b8b", "#b388ff", "#ffd43b", "#22d3ee", "#a3e635", "#e879f9", "#f87171"];
  var TOL = 1;                                   // 같은 회차에서 ±1점(시간은 ±1분) 이내면 겹친 점으로 보고 고르는 창을 띄움
  var SCORE_CARD_BG_UNUSED = "";                 // 점수 그래프 카드 색 (가림막 그라데이션이 이 색으로 사라짐)
  // 점수 그래프는 29점 아래가 가려짐
  var selectedPoint = "", chooser = null, chartMode = "score", focusSubject = "", focusSrc = "", scoreExpanded = false;
  function inFocus(r) { return (!focusSubject || recSubject(r) === focusSubject) && (!focusSrc || r.src === focusSrc); }
  function svgEl(tag, attrs) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  function niceStep(range) {
    var c = [1, 2, 5, 10, 15, 20, 30, 60, 120, 180, 240, 360, 720];
    for (var i = 0; i < c.length; i++) if (range / c[i] <= 7) return c[i];
    return 1440;
  }
  function lighten(hex, amt) {
    var num = parseInt(hex.slice(1), 16), r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
    function m(c) { return Math.round(c + (255 - c) * amt); }
    return "rgb(" + m(r) + "," + m(g) + "," + m(b) + ")";
  }
  function clearSelection() { selectedPoint = ""; chooser = null; }
  // 과목마다 고정 색 (기록이 늘거나 지워져도 바뀌지 않음)
  var SUBJECT_COLORS = {
    "생활과 윤리": "#ff8c1a", "윤리와 사상": "#818cf8", "한국지리": "#3ddc97", "세계지리": "#2dd4bf",
    "동아시아사": "#e08f5f", "세계사": "#cbd5e1", "경제": "#a3e635", "정치와 법": "#e879f9", "사회·문화": "#f87171",
    "물리학Ⅰ": "#22d3ee", "화학Ⅰ": "#4da3ff", "생명과학Ⅰ": "#ff6b8b", "지구과학Ⅰ": "#a78bfa",
    "물리학Ⅱ": "#67e8f9", "화학Ⅱ": "#fdba74", "생명과학Ⅱ": "#fda4af", "지구과학Ⅱ": "#d8b4fe"
  };
  function colorMap(all) {
    var color = {};
    all.forEach(function (r) {
      var sub = recSubject(r);
      if (color[sub]) return;
      var c = SUBJECT_COLORS[sub];
      if (!c) { var h = 0; for (var i = 0; i < sub.length; i++) h = (h * 31 + sub.charCodeAt(i)) >>> 0; c = PALETTE[h % PALETTE.length]; }
      color[sub] = c;
    });
    return color;
  }
  function mean(a) { var t = 0; a.forEach(function (v) { t += v; }); return t / a.length; }
  // 추세곡선: 모든 점을 가까운 순서로 무게를 달리해 반영하는 가우시안 국소 직선 회귀.
  // 폭(sig)이 넓을수록 매끈하고 좁을수록 점을 따라 깊게 파임
  function trendCurve(xs, ys) {
    var n = xs.length, span = xs[n - 1] - xs[0], gap = span / (n - 1) || 1;
    var sig = 0.85 * gap, S = Math.min(240, Math.max(80, (n - 1) * 12)), out = [];     // 점이 아주 많아도 계산량이 폭주하지 않게 상한
    for (var i = 0; i <= S; i++) {
      var x = xs[0] + span * i / S, sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0, near = 0, nd = Infinity;
      for (var j = 0; j < n; j++) {
        var dx = xs[j] - x, w = Math.exp(-0.5 * (dx / sig) * (dx / sig));
        sw += w; sx += w * dx; sy += w * ys[j]; sxx += w * dx * dx; sxy += w * dx * ys[j];
        if (Math.abs(dx) < nd) { nd = Math.abs(dx); near = j; }
      }
      var den = sw * sxx - sx * sx, y;
      y = (sw > 1e-12 && Math.abs(den) >= 1e-12) ? (sxx * sy - sx * sxy) / den : (sw > 1e-12 ? sy / sw : ys[near]);
      if (!isFinite(y)) y = ys[near];                        // 어떤 경우에도 NaN 이 그래프를 망가뜨리지 않게
      out.push([x, y]);
    }
    return out;
  }

  function renderChart() { keepPageScroll(renderChartInner); }
  function renderChartInner() {
    if (typeof statsOn !== "undefined" && statsOn) { renderStatsInner(); return; }          // 전체 통계 보기
    var box = $("chart"), legend = $("legend"), info = $("pointInfo");
    var measuredW = box.clientWidth;               // 비우기 전에 폭을 재야 페이지 높이가 순간적으로 줄어들지 않음
    box.textContent = ""; legend.textContent = ""; info.textContent = "";
    var homer = chartMode === "homer";
    $("chartCard").setAttribute("data-mode", chartMode);
    var all = loadView(), nums = attemptNumbers(all), color = colorMap(all);
    var allPts = all.filter(function (r) { return homer ? (r.usedExtra && r.elapsed != null) : r.score1 != null; });
    function val(r) { return homer ? r.elapsed / 60 : r.score1; }

    // 범례: 누르면 그 과목만 보기(응시 기록도 같은 과목으로), 한 번 더 누르면 전체 보기
    var names = [], hasPts = {};
    all.forEach(function (r) { var nm = recSubject(r); if (names.indexOf(nm) < 0) names.push(nm); });
    allPts.forEach(function (r) { hasPts[recSubject(r)] = true; });
    if (focusSubject && names.indexOf(focusSubject) < 0) focusSubject = "";
    legend.classList.toggle("has-focus", !!focusSubject);
    names.forEach(function (name) {
      if (!hasPts[name] && name !== focusSubject) return;
      var on = name === focusSubject;
      var item = el("button", "item subj" + (on ? " on" : ""));
      item.type = "button";
      item.setAttribute("aria-pressed", on ? "true" : "false");
      item.setAttribute("title", on ? "전체 과목 보기" : name + "만 보기");
      var sw = el("span", "sw"); sw.style.background = color[name];
      item.appendChild(sw); item.appendChild(document.createTextNode(name));
      item.addEventListener("click", function () {
        focusSubject = on ? "" : name;
        clearSelection();
        keepPageScroll(function () { renderRecords(true); renderChart(); });
        $("records").scrollTop = 0;
      });
      legend.appendChild(item);
    });
    var shapeSeen = {}, shapeNames = [];            // 점 모양 안내: 그래프에 있는 업체만 (누르면 그 업체만 보기)
    allPts.forEach(function (r) { var k = r.src || ""; if (k && !shapeSeen[k]) { shapeSeen[k] = 1; shapeNames.push(k); } });
    if (focusSrc && shapeNames.indexOf(focusSrc) < 0 && !all.some(function (r) { return r.src === focusSrc; })) focusSrc = "";
    var srcRow = el("div", "srcLegRow");               // 과목 줄 아래 새 줄
    shapeNames.forEach(function (k, i) {
      var on = k === focusSrc, it = el("button", "item src" + (on ? " on" : ""));
      it.type = "button"; it.setAttribute("aria-pressed", on ? "true" : "false"); it.setAttribute("title", on ? "전체 업체 보기" : k + "만 보기");
      it.appendChild(el("span", "glyph", SRC_SHAPE_CH[srcShapeIdx(k)])); it.appendChild(document.createTextNode(k));
      it.addEventListener("click", function () {
        focusSrc = on ? "" : k; clearSelection();
        keepPageScroll(function () { renderRecords(true); renderChart(); });
        $("records").scrollTop = 0;
      });
      srcRow.appendChild(it);
    });
    if (shapeNames.length) legend.appendChild(srcRow);

    var pts = allPts.filter(inFocus);
    if (!pts.length) {
      clearSelection();
      box.appendChild(el("p", "empty", (focusSubject || focusSrc)
        ? [focusSubject, focusSrc].filter(Boolean).join(" · ") + "의 " + (homer ? "시간" : "점수") + " 기록이 아직 없어요."
        : (homer ? "추가 시간을 쓴 기록이 생기면 여기에 시간 추이가 그려져요." : "점수를 입력한 기록이 생기면 여기에 과목별 추이가 그려져요.")));
      return;
    }
    if (!pts.some(function (r) { return r.id === selectedPoint; })) selectedPoint = "";

    // 과목과 업체를 모두 골랐고 회차가 다 있으면: 가로축을 친 순서가 아니라 실제 회차로 (17회부터 시작했으면 17회가 맨 앞)
    var realMode = !!(focusSubject && focusSrc) && pts.every(function (r) { return typeof r.no === "number"; });
    if (realMode) { nums = {}; pts.forEach(function (r) { nums[r.id] = r.no; }); }
    var order = [], series = {};
    pts.forEach(function (r) {
      var sub = recSubject(r);
      if (!series[sub]) { series[sub] = []; order.push(sub); }
      series[sub].push({ n: nums[r.id], v: val(r), rec: r });
    });
    if (realMode) order.forEach(function (nm) { series[nm].sort(function (a, b) { return a.n - b.n; }); });

    // 한 과목만 볼 때: 평균·최고·최저 (점이 2개 이상), 3개 이상이면 추세곡선도
    var focus = !!focusSubject, stat = null;
    if (focus && series[focusSubject] && series[focusSubject].length >= 2) {
      var sl = series[focusSubject], sxs = sl.map(function (q) { return q.n; }), sys = sl.map(function (q) { return q.v; });
      stat = {
        avg: mean(sys), max: Math.max.apply(null, sys), min: Math.min.apply(null, sys),
        curve: sl.length >= 3 ? trendCurve(sxs, sys) : null
      };
    }

    var W = Math.max(280, Math.round(measuredW || 600));
    var H = Math.round(Math.max(250, Math.min(350, W * 0.56)));    // 세로를 넉넉히 해서 점수 변동이 잘 보이게
    // 점수 그래프는 숫자 눈금이 왼쪽, 시간 그래프는 오른쪽
    var collapsed = !homer && !scoreExpanded;               // 29점 아래를 가리고 있는 상태
    var GC = 36;                                            // 가린 상태일 때 그라데이션 띠의 높이
    var G = collapsed ? GC : 0;                             // 가려진(그라데이션) 구간의 높이
    var U = 34;                                             // 하얀 그라데이션이 29점 선 위쪽으로 올라오는 길이
    var L = homer ? 14 : 40, R = homer ? 46 : 14, T = 20, B = 30, PAD = 14;
    var PADR = focus ? (homer ? 100 : 92) : PAD;           // 한 과목만 볼 때는 오른쪽에 숫자 자리를 남김
    var plotW = W - L - R, plotH = H - T - B - G, innerW = plotW - PAD - PADR;
    var yBottom = T + plotH;                                // 눈금의 맨 아래 (25점 / 0점 / 시간 맨 아래)
    var minN = 1, maxN = 1;
    if (realMode) { minN = Infinity; maxN = -Infinity; pts.forEach(function (r) { if (nums[r.id] < minN) minN = nums[r.id]; if (nums[r.id] > maxN) maxN = nums[r.id]; }); }
    else pts.forEach(function (r) { if (nums[r.id] > maxN) maxN = nums[r.id]; });
    function X(nn) { return maxN === minN ? L + (plotW - PADR + PAD) / 2 : L + PAD + (nn - minN) * innerW / (maxN - minN); }

    // 세로축 범위
    var mn, mx, lo, hi, step;
    if (!homer) {
      hi = 50;
      if (collapsed) { lo = 29; step = 5; }                // 29점 아래는 범위 계산에서 무시 → 화면에는 29~50만
      else { lo = 0; step = 10; }
    } else {
      var vals = [];
      pts.forEach(function (r) { vals.push(val(r)); });
      if (stat && stat.curve) stat.curve.forEach(function (c) { vals.push(c[1]); });
      vals.push(30);                               // 본 시험 시간(30분)이 항상 보이게
      mn = Math.min.apply(null, vals); mx = Math.max.apply(null, vals);
      lo = Math.max(0, Math.floor(mn - 1)); hi = Math.ceil(mx + 1);
      if (hi - lo < 4) hi = lo + 4;
      step = niceStep(hi - lo);
      lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    }
    function Y(v) { return homer ? T + (v - lo) / (hi - lo) * plotH : T + (hi - v) / (hi - lo) * plotH; }
    function fmtVal(v) { return homer ? Math.round(v) + "분" : String(v); }
    function visible(y) { return !collapsed || y <= yBottom + 1; }   // 가려진 구간 안의 점은 숫자·선택 대상에서 제외

    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": homer ? "과목별 시간 추이" : "과목별 점수 추이" });
    var ticks = [];
    if (collapsed) ticks = [30, 35, 40, 45, 50];                                   // 29점 경계는 눈금 없이 그라데이션이 시작되는 곳
    else for (var tv = lo; tv <= hi; tv += step) ticks.push(tv);
    ticks.forEach(function (t) {
      var gl = { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: TC.line, "stroke-width": 1 };
      if (homer) gl["stroke-dasharray"] = "1 5"; gl["stroke-linecap"] = "round";
      svg.appendChild(svgEl("line", gl));
      var yl = svgEl("text", homer
        ? { x: W - R + 10, y: Y(t) + 4, "text-anchor": "start", "font-size": 12, fill: TC.muted }
        : { x: L - 8, y: Y(t) + 4, "text-anchor": "end", "font-size": 12, fill: TC.muted });
      yl.textContent = homer ? t + "분" : t;
      svg.appendChild(yl);
    });
    // 데이터는 가려진 구간까지만 그리도록 잘라냄 (그 아래는 그라데이션으로 가림)
    var uid = "c" + Math.random().toString(36).slice(2, 8), dg = svg;
    if (collapsed) {
      var defs = svgEl("defs", {});
      var cp = svgEl("clipPath", { id: uid });
      cp.appendChild(svgEl("rect", { x: 0, y: 0, width: W, height: yBottom + G }));
      defs.appendChild(cp);
      var lg = svgEl("linearGradient", { id: uid + "g", x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(svgEl("stop", { offset: "0%", "stop-color": TC.scorecard, "stop-opacity": 0 }));
      lg.appendChild(svgEl("stop", { offset: "55%", "stop-color": TC.scorecard, "stop-opacity": 0.78 }));
      lg.appendChild(svgEl("stop", { offset: "100%", "stop-color": TC.scorecard, "stop-opacity": 1 }));
      defs.appendChild(lg);
      var wg = svgEl("linearGradient", { id: uid + "w", x1: 0, y1: 0, x2: 0, y2: 1 });   // 위쪽은 차트 배경과 이어지고, 아래로 갈수록 살짝 하얘짐
      wg.appendChild(svgEl("stop", { offset: "0%", "stop-color": TC.glow, "stop-opacity": 0 }));
      wg.appendChild(svgEl("stop", { offset: "50%", "stop-color": TC.glow, "stop-opacity": 0.045 }));
      wg.appendChild(svgEl("stop", { offset: "85%", "stop-color": TC.glow, "stop-opacity": 0.13 }));
      wg.appendChild(svgEl("stop", { offset: "100%", "stop-color": TC.glow, "stop-opacity": 0.1 }));
      defs.appendChild(wg);
      var hg = svgEl("linearGradient", { id: uid + "h", x1: 0, y1: 0, x2: 1, y2: 0 });      // 눈금선 폭에 맞추고, 좌우 끝은 부드럽게 사라지게
      hg.appendChild(svgEl("stop", { offset: "0%", "stop-color": "#fff", "stop-opacity": 0 }));
      hg.appendChild(svgEl("stop", { offset: "10%", "stop-color": "#fff", "stop-opacity": 1 }));
      hg.appendChild(svgEl("stop", { offset: "90%", "stop-color": "#fff", "stop-opacity": 1 }));
      hg.appendChild(svgEl("stop", { offset: "100%", "stop-color": "#fff", "stop-opacity": 0 }));
      defs.appendChild(hg);
      var mk = svgEl("mask", { id: uid + "m", maskUnits: "userSpaceOnUse", x: L, y: yBottom - U, width: plotW, height: G + U });
      mk.appendChild(svgEl("rect", { x: L, y: yBottom - U, width: plotW, height: G + U, fill: "url(#" + uid + "h)" }));
      defs.appendChild(mk);
      svg.appendChild(defs);
      dg = svgEl("g", { "clip-path": "url(#" + uid + ")" });
      svg.appendChild(dg);
    }
    // 시간 그래프: 본 시험 시간(30분) 기준선. 각 점에서 이 선까지 이어지는 세로선이 추가로 쓴 시간
    if (homer) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: Y(30), y2: Y(30), stroke: TC.muted, "stroke-width": 1.2, "stroke-dasharray": "6 4", "stroke-opacity": 0.8 }));
      var rl = svgEl("text", { x: L + 2, y: Y(30) - 6, "text-anchor": "start", "font-size": 11, "font-weight": 600, fill: TC.muted });
      rl.textContent = "본 시험 30분";
      svg.appendChild(rl);
    }
    // 가로축: 회차 (자리가 좁으면 건너뛰며 표시)
    var spacing = maxN > minN ? innerW / (maxN - minN) : 100;
    var every = Math.max(1, Math.ceil(34 / spacing));
    for (var nn = minN; nn <= maxN; nn += every) {
      var xl = svgEl("text", { x: X(nn), y: H - 8, "text-anchor": "middle", "font-size": 12, fill: TC.muted });
      xl.textContent = nn + "회";
      svg.appendChild(xl);
    }

    // 모든 점을 실제 위치에 하나씩 (겹쳐도 합치지 않음)
    var plist = [];
    order.forEach(function (name) {
      series[name].forEach(function (q, k) {
        plist.push({ name: name, color: color[name], n: q.n, v: q.v, x: X(q.n), y: Y(q.v), rec: q.rec, last: k === series[name].length - 1 });
      });
    });
    var colTop = {};                       // 각 회차에서 화면 맨 위에 있는 점 (숫자를 위쪽에 쓰고, 나머지는 아래쪽에)
    plist.forEach(function (pt) { if (colTop[pt.n] == null || pt.y < colTop[pt.n]) colTop[pt.n] = pt.y; });
    var selRec = null;
    pts.forEach(function (r) { if (r.id === selectedPoint) selRec = r; });

    // 시간 그래프: 기준선에서 각 점까지의 세로선
    if (homer) {
      plist.forEach(function (pt) {
        if (Math.abs(pt.y - Y(30)) < 2) return;
        dg.appendChild(svgEl("line", { x1: pt.x, x2: pt.x, y1: Y(30), y2: pt.y, stroke: pt.color, "stroke-width": 2, "stroke-opacity": 0.45, "stroke-linecap": "round" }));
      });
    }
    // 선 (과목별)
    order.forEach(function (name) {
      var list = series[name];
      if (list.length > 1) {
        dg.appendChild(svgEl("polyline", {
          points: list.map(function (q) { return X(q.n).toFixed(1) + "," + Y(q.v).toFixed(1); }).join(" "),
          fill: "none", stroke: color[name], "stroke-width": homer ? 2 : 2.5, "stroke-linejoin": "round", "stroke-linecap": "round",
          "stroke-opacity": stat && stat.curve ? 0.55 : 1
        }));
      }
    });
    // 한 과목만 볼 때의 추세곡선 (점선)
    if (stat && stat.curve) {
      dg.appendChild(svgEl("path", {
        d: stat.curve.map(function (c, i) { return (i ? "L" : "M") + X(c[0]).toFixed(1) + "," + Y(c[1]).toFixed(1); }).join(" "),
        fill: "none", stroke: lighten(color[focusSubject], 0.4), "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": "8 6"
      }));
    }

    // 점수 그래프: 선택한 점 위에 호머식 점수를 연한 색 점으로 (다른 곳을 누르면 사라짐)
    var homerDotY = null;
    if (!homer && selRec && selRec.usedExtra && selRec.score2 != null) {
      var hx = X(nums[selRec.id]), hy = Y(selRec.score2), sy = Y(selRec.score1);
      homerDotY = hy;
      var hc = lighten(color[recSubject(selRec)], 0.55);
      if (Math.abs(hy - sy) > 7) {
        dg.appendChild(svgEl("line", { x1: hx, x2: hx, y1: sy, y2: hy, stroke: hc, "stroke-width": 1.6, "stroke-dasharray": "3 3" }));
        dg.appendChild(svgEl("circle", { cx: hx, cy: hy, r: 4.6, fill: hc, stroke: TC.panel, "stroke-width": 2 }));
      } else {
        dg.appendChild(svgEl("circle", { cx: hx, cy: hy, r: 8.5, fill: "none", stroke: hc, "stroke-width": 2 }));
      }
      var hAbove = hy < sy || Math.abs(hy - sy) <= 7;
      var ht = svgEl("text", {
        x: hx, y: hAbove ? hy - 12 : hy + 20, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: hc,
        stroke: TC.panel, "stroke-width": 3, "paint-order": "stroke"
      });
      ht.textContent = selRec.score2;
      dg.appendChild(ht);
    }

    // 점: 점수 그래프는 꽉 찬 동그라미, 시간 그래프는 속이 빈 동그라미
    var showAll = pts.length <= 12, labeled = {};
    plist.forEach(function (pt) {
      var selected = pt.rec.id === selectedPoint;
      if (selected) dg.appendChild(svgEl("circle", { cx: pt.x, cy: pt.y, r: homer ? 10 : 9, fill: "none", stroke: TC.text, "stroke-width": 2 }));
      if (homer) {
        dg.appendChild(srcMarker(pt.rec.src, pt.x, pt.y, 5.2, selected ? pt.color : TC.panel, pt.color, 2.4));
      } else {
        dg.appendChild(srcMarker(pt.rec.src, pt.x, pt.y, 4.6, pt.color, TC.panel, 2));
      }
      if ((showAll || pt.last || selected) && visible(pt.y)) {
        var seenY = labeled[pt.n] || (labeled[pt.n] = []);
        var dup = seenY.some(function (yy) { return Math.abs(yy - pt.y) < 3; });   // 거의 같은 위치면 숫자는 한 번만
        if (!dup || selected) {
          var above = pt.y === colTop[pt.n] ? (pt.y - 12 >= 10) : !(pt.y + 20 <= yBottom + 6);
          if (selected && homerDotY != null && homerDotY < pt.y) above = false;   // 호머식 점이 위에 있으면 숫자는 아래로
          var tx = svgEl("text", {
            x: pt.x, y: above ? pt.y - 12 : pt.y + 20, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: pt.color,
            stroke: TC.panel, "stroke-width": 3, "paint-order": "stroke"
          });
          tx.textContent = fmtVal(pt.v);
          dg.appendChild(tx);
          seenY.push(pt.y);
        }
      }
    });

    // 한 과목만 볼 때: 오른쪽 끝에 평균·최고·최저를 적어 둠 (시간 그래프는 최단·최장)
    if (stat) {
      var u = homer ? "분" : "점", f1 = function (v) { return homer ? v.toFixed(1) : String(v); };
      var lines = [
        "평균 " + stat.avg.toFixed(1) + u,
        (homer ? "최단 " : "최고 ") + f1(homer ? stat.min : stat.max) + u,
        (homer ? "최장 " : "최저 ") + f1(homer ? stat.max : stat.min) + u
      ];
      var endY = Y(stat.curve ? stat.curve[stat.curve.length - 1][1] : series[focusSubject][series[focusSubject].length - 1].v);
      var ty0 = Math.min(Math.max(endY - 18, T + 8), yBottom - 8 - (lines.length - 1) * 15);
      var tcol = lighten(color[focusSubject], 0.3);
      lines.forEach(function (ln, i) {
        var st = svgEl("text", {
          x: X(maxN) + 16, y: ty0 + i * 15, "text-anchor": "start", "font-size": 12, "font-weight": 700, fill: tcol,
          stroke: TC.panel, "stroke-width": 3, "paint-order": "stroke"
        });
        st.textContent = ln;
        svg.appendChild(st);
      });
    }

    // 29점 아래를 가리는 그라데이션: 눌러서 전체(0~50점) 보기
    if (collapsed) {
      svg.appendChild(svgEl("rect", { x: L - 2, y: yBottom, width: plotW + 4, height: G, fill: "url(#" + uid + "g)", "pointer-events": "none" }));
      svg.appendChild(svgEl("rect", { x: L, y: yBottom - U, width: plotW, height: G + U, fill: "url(#" + uid + "w)", mask: "url(#" + uid + "m)", "pointer-events": "none" }));
      var strip = svgEl("rect", { x: L, y: yBottom - 14, width: plotW, height: G + 20, fill: "transparent", "class": "strip" });
      strip.setAttribute("role", "button"); strip.setAttribute("aria-label", "29점 아래까지 전체 보기");
      strip.addEventListener("click", function (e) {
        e.stopPropagation();
        scoreExpanded = true; clearSelection();
        renderChart();
      });
      svg.appendChild(strip);
      var hint = svgEl("text", { x: L + plotW / 2, y: yBottom + G - 9, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: TC.muted, "pointer-events": "none" });
      hint.textContent = "눌러서 전체 보기";
      svg.appendChild(hint);
    }

    // 펼친 상태: "눌러서 전체 보기" 글자가 있던 자리에 "다시 가리기". 누르는 영역도 "눌러서 전체 보기"(가림막 띠)와 똑같은 사각형
    var hintX = L + plotW / 2, hintY = H - B - 9;
    if (!homer && scoreExpanded) {
      var fx = hintX, fy = hintY;
      var fg = svgEl("g", { "class": "foldbtn", role: "button", tabindex: 0, "aria-label": "29점 아래를 다시 가리기" });
      // 보이지 않는 누르는 영역: 가린 상태의 띠(strip)와 같은 위치·크기
      fg.appendChild(svgEl("rect", { x: L, y: H - B - GC - 14, width: plotW, height: GC + 20, fill: "transparent" }));
      var ft = svgEl("text", { x: fx, y: fy, "text-anchor": "middle", "font-size": 12, "font-weight": 700, fill: TC.muted, "pointer-events": "none" });
      ft.textContent = "다시 가리기";
      fg.appendChild(ft);
      var collapseAgain = function (e) { e.stopPropagation(); scoreExpanded = false; clearSelection(); renderChart(); };
      fg.addEventListener("click", collapseAgain);
      fg.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); collapseAgain(e); } });
      svg.appendChild(fg);
    }

    // 누르기 쉽도록 보이지 않는 원을 맨 위에 (가려진 구간의 점은 제외)
    plist.forEach(function (pt) {
      if (!visible(pt.y)) return;
      var c = svgEl("circle", { cx: pt.x, cy: pt.y, r: 14, fill: "transparent", "class": "hit" });
      c.addEventListener("click", function (e) {
        e.stopPropagation();
        var near = plist.filter(function (q) { return q.n === pt.n && Math.abs(q.v - pt.v) <= TOL + 1e-9; });
        if (near.length > 1) {                                   // ±1 이내로 겹친 점들 → 어느 시험인지 고르는 작은 창
          chooser = (chooser && chooser.anchor === pt.rec.id) ? null : { anchor: pt.rec.id, ids: near.map(function (q) { return q.rec.id; }) };
        } else {
          selectedPoint = selectedPoint === pt.rec.id ? "" : pt.rec.id;
          chooser = null;
        }
        renderChart();
      });
      svg.appendChild(c);
    });
    var hintX = L + plotW / 2, hintY = H - B - 9;      // 가린 상태의 "눌러서 전체 보기" 글자와 같은 자리
    box.appendChild(svg);

    // 겹친 점 중에서 고르는 창 (점 옆에 표시)
    if (chooser) {
      var anchor = null;
      plist.forEach(function (q) { if (q.rec.id === chooser.anchor) anchor = q; });
      if (!anchor) { chooser = null; }
      else {
        var pop = el("div", "chooser");
        chooser.ids.forEach(function (id) {
          var q = null;
          plist.forEach(function (z) { if (z.rec.id === id) q = z; });
          if (!q) return;
          var bt = el("button", "copt");
          var dot = el("span", "cdot"); dot.style.background = q.color;
          bt.appendChild(dot);
          bt.appendChild(document.createTextNode(q.name + " " + q.n + "회"));
          bt.addEventListener("click", function (e) {
            e.stopPropagation();
            selectedPoint = q.rec.id; chooser = null;
            renderChart();
          });
          pop.appendChild(bt);
        });
        pop.addEventListener("click", function (e) { e.stopPropagation(); });
        box.appendChild(pop);
        var pw = pop.offsetWidth, ph = pop.offsetHeight;
        var px = anchor.x + 16;
        if (px + pw > W - 4) px = anchor.x - 16 - pw;
        px = Math.max(4, px);
        var py = Math.min(Math.max(anchor.y - ph / 2, 4), Math.max(4, H - ph - 4));
        pop.style.left = px + "px"; pop.style.top = py + "px";
      }
    }

    // 선택한 점의 내용
    if (selRec) {
      var name = recSubject(selRec) + " " + recNoText(selRec, nums) + "회";
      var txt = el("span", "");
      if (!homer) {
        txt.appendChild(el("strong", "", name + " " + selRec.score1 + "점"));
        if (selRec.usedExtra && selRec.score2 != null) txt.appendChild(document.createTextNode(", 호머식 " + selRec.score2 + "점"));
      } else {
        txt.appendChild(el("strong", "", name + " 총 " + fmtDur(selRec.elapsed)));
        var detail = "";
        if (selRec.elapsed1 != null) detail = " (본 시험 " + fmtDur(selRec.elapsed1) + " + 추가 " + fmtDur(Math.max(0, selRec.elapsed - selRec.elapsed1)) + ")";
        if (selRec.score2 != null) detail += ", 호머식 " + selRec.score2 + "점";
        if (detail) txt.appendChild(document.createTextNode(detail));
      }
      var del = el("button", "del"); del.type = "button"; del.innerHTML = TRASH_ICON; del.setAttribute("aria-label", "삭제"); del.setAttribute("title", "삭제");
      del.addEventListener("click", function () {
        ask(name + " 기록을 삭제하겠습니까?", "삭제", true, function () {
          removeRec(selRec.id); clearSelection(); renderToday();
        });
      });
      info.appendChild(txt); info.appendChild(del);
    } else {
      info.appendChild(el("span", "", "점을 누르면 자세한 내용을 볼 수 있어요."));
    }
  }

  // 점·상태창·삭제 확인 창이 아닌 곳을 누르면 선택(연한 호머식 점, 고르는 창)이 사라짐
  document.addEventListener("click", function (e) {
    if (!selectedPoint && !chooser) return;
    var t = e.target;
    if (t && t.closest && t.closest("#pointInfo, .chooser, circle.hit, #modal, #lateModal")) return;
    clearSelection();
    renderChart();
  });

  // 점수 / 시간 스위치
  // - 그냥 탭하면 누른 쪽으로 상자가 이동하며 바뀜 (이미 선택된 쪽이면 변화 없음)
  // - 드래그하면 상자가 손가락(마우스) 위치를 따라 움직이고, 손을 뗄 때 상자의 중심이 절반을 넘은 쪽으로 바뀜
  var sw = $("chartSwitch"), swThumb = sw.querySelector(".thumb"), swDrag = null;
  function switchChart(side) {
    if (chartMode === side) return;
    chartMode = side;
    sw.setAttribute("aria-checked", side === "homer" ? "true" : "false");
    $("trendTitle").textContent = trendTitleText(side);
    clearSelection();
    renderChart();
    var card = $("chartCard");                    // 어느 쪽으로 바꿔도 같은 연한 페이드
    card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () { card.classList.remove("swap"); }, 420);
  }
  function swapSwitchGeometry() {
    var r = sw.getBoundingClientRect(), cs = getComputedStyle(sw);
    var padL = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), padR = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
    var inner = r.width - padL - padR;
    return { left: r.left + padL, inner: inner, thumb: inner / 2 };
  }
  function followPointer(clientX, instant) {
    var g = swDrag.g;
    var tx = Math.min(Math.max(clientX - g.left - g.thumb / 2, 0), g.thumb);       // 상자가 트랙 밖으로 나가지 않게
    swThumb.style.transition = instant ? "none" : "transform .12s ease-out";
    swThumb.style.transform = "translateX(" + tx + "px)";
    var side = tx + g.thumb / 2 > g.inner / 2 ? "homer" : "score";                  // 상자 중심이 절반을 넘었는지
    sw.setAttribute("data-pos", side);
    swDrag.side = side;
  }
  // 2단계: 처음엔 탭일 수도 있으니 가만히 두고, 가로로 몇 px 이상 움직여 "드래그"라고 판단되면 그때부터 따라옴
  var DRAG_START = 6;          // 이 거리(px) 이상 가로로 움직이면 드래그로 봄
  var FLICK_V = 0.15;          // px/ms: 이 속도 이상으로 휙 밀면 절반을 못 넘겨도 그 방향으로 넘어감
  // 손을 떼기 직전 100ms 동안의 가로 속도 (px/ms, 오른쪽이 +)
  function flickVelocity(d) {
    var now = performance.now(), recent = d.samples.filter(function (q) { return now - q.t <= 120; });
    if (recent.length < 2) return 0;
    var first = recent[0], last = recent[recent.length - 1], dt = last.t - first.t;
    if (dt <= 0 || now - last.t > 90) return 0;           // 손가락을 멈춘 채 떼면 속도 없음
    return (last.x - first.x) / dt;
  }
  function endSwitchDrag(commit, clientX) {
    if (!swDrag) return;
    var d = swDrag, side;
    swDrag = null;
    if (d.dragging) {
      var vx = flickVelocity(d);
      if (Math.abs(vx) >= FLICK_V) side = vx > 0 ? "homer" : "score";             // 빠르게 밀었으면 미는 방향으로
      else side = d.side;                                                         // 아니면 상자 중심이 절반을 넘은 쪽
    } else {
      side = (clientX - d.g.left) > d.g.inner / 2 ? "homer" : "score";            // 탭: 누른 쪽 (이미 그쪽이면 변화 없음)
    }
    swThumb.style.transition = ""; swThumb.style.transform = "";                   // 인라인 위치를 풀고 CSS 전환으로 자리잡기
    if (commit && side !== chartMode) switchChart(side);
    sw.setAttribute("data-pos", chartMode);
  }
  sw.addEventListener("pointerdown", function (e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    swDrag = { g: swapSwitchGeometry(), side: chartMode, id: e.pointerId, startX: e.clientX, lastX: e.clientX, dragging: false,
               samples: [{ t: performance.now(), x: e.clientX }] };
    try { sw.setPointerCapture(e.pointerId); } catch (err) {}
  });
  sw.addEventListener("pointermove", function (e) {
    if (!swDrag || e.pointerId !== swDrag.id) return;
    swDrag.lastX = e.clientX;
    swDrag.samples.push({ t: performance.now(), x: e.clientX });
    if (swDrag.samples.length > 30) swDrag.samples.shift();
    if (!swDrag.dragging) {
      if (Math.abs(e.clientX - swDrag.startX) < DRAG_START) return;                 // 아직 탭일 수 있음
      swDrag.dragging = true;
      followPointer(e.clientX, false);                                              // 첫 이동만 살짝 부드럽게
      return;
    }
    followPointer(e.clientX, true);
  });
  sw.addEventListener("pointerup", function (e) { if (swDrag && e.pointerId === swDrag.id) endSwitchDrag(true, e.clientX); });
  // 손가락이 미끄러져 브라우저가 제스처를 가로채도, 이미 드래그 중이었다면 지금까지의 움직임으로 판단
  sw.addEventListener("pointercancel", function () { if (swDrag) endSwitchDrag(swDrag.dragging, swDrag.lastX); });
  sw.addEventListener("lostpointercapture", function () { if (swDrag) endSwitchDrag(swDrag.dragging, swDrag.lastX); });
  window.addEventListener("blur", function () { if (swDrag) endSwitchDrag(false, swDrag.lastX); });
  sw.addEventListener("click", function (e) {                                       // 키보드(스페이스/엔터)로는 반대쪽으로 전환
    if (e.detail !== 0) return;
    switchChart(chartMode === "score" ? "homer" : "score");
    sw.setAttribute("data-pos", chartMode);
  });
  sw.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") { switchChart("score"); sw.setAttribute("data-pos", chartMode); e.preventDefault(); }
    if (e.key === "ArrowRight") { switchChart("homer"); sw.setAttribute("data-pos", chartMode); e.preventDefault(); }
  });
  var swapTimer = 0, resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (home.style.display !== "none") renderChart(); }, 120);
  });

  document.addEventListener("visibilitychange", function () {
    if (room) { lastSentBy = {}; enqueue(function () { return pushMe(true); }); }       // 화면을 보기 시작/그만둔 것을 바로 알려서 알림이 알맞게 오게 함
    presenceSync();
    if (document.visibilityState === "hidden") {
      if (swDrag) endSwitchDrag(false, swDrag.lastX);
      hiddenAt = { p: performance.now(), w: Date.now() };
    }
    if (document.visibilityState === "visible") {
      if (hiddenAt && running) {                    // 잠겨 있던 동안 실제 시각과 브라우저 시계의 차이만큼을 시험 시간에 반영
        var gp = (performance.now() - hiddenAt.p) / 1000, gw = (Date.now() - hiddenAt.w) / 1000;
        if (gw - gp > 1 && gw < 12 * 3600) sleepCredit += gw - gp;
      }
      hiddenAt = null;
      checkNewDay(false);
      if (home.style.display !== "none") renderToday();
      pollTick();
      chatTick();
      if (stage.classList.contains("on") && (phase === "running" || phase === "extra")) requestWake();
    }
  });

