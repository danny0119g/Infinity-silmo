// [core.js] 공통 상수와 도구 함수 (과목 시간표, 저장 키, 작은 도우미)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 탐구 영역 두 칸: 첫 번째 과목 3:35~4:05, 두 번째 과목 4:07~4:37
  var SLOTS = {
    1: { label: "탐1", startH: 3, startM: 35, range: "3:35 ~ 4:05" },
    2: { label: "탐2", startH: 4, startM: 7,  range: "4:07 ~ 4:37" }
  };
  var SUBJECT_GROUPS = [
    { name: "사회탐구", list: ["생활과 윤리", "윤리와 사상", "한국지리", "세계지리", "동아시아사", "세계사", "경제", "정치와 법", "사회·문화"] },
    { name: "과학탐구", list: ["물리학Ⅰ", "화학Ⅰ", "생명과학Ⅰ", "지구과학Ⅰ", "물리학Ⅱ", "화학Ⅱ", "생명과학Ⅱ", "지구과학Ⅱ"] }
  ];
  var ALL_SUBJECTS = [].concat(SUBJECT_GROUPS[0].list, SUBJECT_GROUPS[1].list);

  var DURATION = 30 * 60;      // 시험 시간(초)
  var WARN_AT = 25 * 60;       // 5분 전
  var WARN_SHOW_MS = 12000;    // 알림 표시 시간

  var $ = function (id) { return document.getElementById(id); };
  var home = $("home"), stage = $("stage"), done = $("done"), modal = $("modal"), picker = $("picker");
  var hourEl = $("hour"), minuteEl = $("minute"), secondEl = $("second");
  var remainEl = $("remain"), warnEl = $("warn5");
  var scoreInput = $("scoreInput"), scoreErr = $("scoreErr");

  // ---------- 시계 눈금 (숫자 없음) ----------
  var ticks = $("ticks"), NS = "http://www.w3.org/2000/svg";
  var CLOCK_INK = "#14234d", CLOCK_SOFT = "#9aa0ab", CLOCK_ACCENT = "#16bf9f";
  for (var i = 0; i < 60; i++) {
    var quarter = i % 15 === 0, hour = i % 5 === 0, r = document.createElementNS(NS, "rect");
    var w = quarter ? 2.8 : (hour ? 1.8 : 0.7), h = quarter ? 12 : (hour ? 8 : 3.2);
    r.setAttribute("x", -w / 2);
    r.setAttribute("y", -88 + (quarter ? -1 : 0));
    r.setAttribute("width", w);
    r.setAttribute("height", h);
    r.setAttribute("rx", Math.min(w / 2, 0.8));
    r.setAttribute("fill", (i === 0 || i === 30) ? CLOCK_ACCENT : (hour ? CLOCK_INK : CLOCK_SOFT));
    r.setAttribute("transform", "rotate(" + (i * 6) + ")");
    ticks.appendChild(r);
  }

  // ---------- 시계 모양: 지금 시계 / 버전 1 시계(눈금·숫자·뾰족한 바늘) — 이 기기에만 저장 ----------
  (function () {
    var tc = $("ticksC"), nc = $("numsC");
    for (var i = 0; i < 60; i++) {
      var major = i % 5 === 0, r = document.createElementNS(NS, "rect");
      r.setAttribute("x", major ? -1.6 : -0.6); r.setAttribute("y", -90); r.setAttribute("width", major ? 3.2 : 1.2); r.setAttribute("height", major ? 9 : 4);
      r.setAttribute("fill", "#17181a"); r.setAttribute("transform", "rotate(" + (i * 6) + ")"); tc.appendChild(r);
    }
    for (var n = 1; n <= 12; n++) {
      var t = document.createElementNS(NS, "text"), a = n * 30 * Math.PI / 180;
      t.setAttribute("x", (Math.sin(a) * 70).toFixed(2)); t.setAttribute("y", (-Math.cos(a) * 70 + 5.4).toFixed(2)); t.textContent = n; nc.appendChild(t);
    }
  })();
  var CLK_KEY = "examTimer.clockTheme.v1";
  function clockThemeGet() { try { return localStorage.getItem(CLK_KEY) === "classic" ? "classic" : "modern"; } catch (e) { return "modern"; } }
  function clockThemeApply() { var v = clockThemeGet(), sw = $("clockTheme"); if (v === "classic") $("clock").setAttribute("data-clock", "classic"); else $("clock").removeAttribute("data-clock"); sw.classList.toggle("on", v === "classic"); sw.setAttribute("aria-checked", v === "classic" ? "true" : "false"); }
  clockThemeApply();
  $("clockTheme").addEventListener("click", function () { try { localStorage.setItem(CLK_KEY, clockThemeGet() === "classic" ? "modern" : "classic"); } catch (e) {} clockThemeApply(); });

  // ---------- 화면 색 (다크 모드 / 밝은 모드) ----------
  var THEME_KEY = "examTimer.theme.v1", THEMEAT_KEY = "examTimer.themeAt.v1", TC = {};
  function loadTC() {                                // 그래프(SVG)가 쓰는 색을 CSS 변수에서 읽어 둠
    var cs = getComputedStyle(document.documentElement);
    ["bg", "panel", "line", "muted", "text", "glow", "scorecard"].forEach(function (n) { TC[n] = cs.getPropertyValue("--" + n).trim(); });
  }
  function themePref() { try { var v = localStorage.getItem(THEME_KEY); return (v === "light" || v === "system") ? v : "dark"; } catch (e) { return "dark"; } }      // 저장된 선택: dark | light | system(기기 설정 따르기)
  function systemLight() { try { return !!(window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches); } catch (e) { return false; } }
  function getTheme() { var p = themePref(); return p === "system" ? (systemLight() ? "light" : "dark") : p; }      // 실제로 화면에 쓰는 색: dark | light
  function applyTheme() {
    if (getTheme() === "light") document.documentElement.setAttribute("data-theme", "light"); else document.documentElement.removeAttribute("data-theme");
    loadTC();
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", TC.bg || "#1b1d21");
  }
  function setTheme(p) {
    try { localStorage.setItem(THEME_KEY, p); localStorage.setItem(THEMEAT_KEY, String(Date.now())); } catch (e) {}
    applyTheme();
    if (typeof onThemeChanged === "function") onThemeChanged();
  }
  applyTheme();
  (function () {                                     // 기기 설정이 바뀌면(밤이 되어 자동으로 어두워지는 등) "기기 설정 따르기"일 때만 따라감
    if (!window.matchMedia) return;
    var mq = matchMedia("(prefers-color-scheme: light)");
    var fn = function () { if (themePref() === "system") { applyTheme(); if (typeof themeRedraw === "function") themeRedraw(); } };
    if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn);
  })();

  // ---------- 햅틱 (톡 하는 진동): 안드로이드는 vibrate, 아이폰·아이패드(사파리 17.4 이상)는 보이지 않는 스위치를 눌러 시스템 햅틱을 냄 ----------
  function hapticTap() {
    try { if (navigator.vibrate && navigator.vibrate(12)) return; } catch (e) {}
    try {                                            // 아이폰(사파리 17.4 이상): 보이지 않는 스위치를 눌러 시스템 햅틱을 냄. 아이패드에는 햅틱 부품이 없어서 아무 느낌도 없음
      var l = document.createElement("label"), i = document.createElement("input");
      l.setAttribute("aria-hidden", "true"); l.style.display = "none"; l.addEventListener("click", function (ev) { ev.stopPropagation(); });          // 이 가짜 클릭이 화면의 다른 "바깥을 누르면 닫기"를 건드리지 않게
      i.type = "checkbox"; i.setAttribute("switch", ""); l.appendChild(i);
      document.head.appendChild(l); l.click(); document.head.removeChild(l);
    } catch (e) {}
  }
  // ---------- 슬라이드 스위치 (홈의 점수/시간 스위치와 같은 방식: 탭하면 그쪽으로, 드래그하면 따라오고 손을 떼면 가까운 칸으로, 빠르게 밀면 그 방향으로) ----------
  function makeSlideSwitch(sw, n, getIdx, onPick) {
    var thumb = sw.querySelector(".thumb"), labs = sw.querySelectorAll(".lab"), drag = null, DRAG_START = 6, FLICK_V = 0.15;
    function geom() {
      var r = sw.getBoundingClientRect(), cs = getComputedStyle(sw);
      var pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), pr = parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth), inner = r.width - pl - pr;
      return { left: r.left + pl, inner: inner, thumb: inner / n };
    }
    function paint(i) {
      sw.setAttribute("data-pos", String(i));
      Array.prototype.forEach.call(labs, function (l, k) { l.classList.toggle("on", k === i); l.setAttribute("aria-checked", k === i ? "true" : "false"); });
    }
    function sync() { paint(getIdx()); }
    function clamp(i) { return Math.min(n - 1, Math.max(0, i)); }
    function velocity(d) {
      var now = performance.now(), recent = d.samples.filter(function (q) { return now - q.t <= 120; });
      if (recent.length < 2) return 0;
      var a = recent[0], b = recent[recent.length - 1], dt = b.t - a.t;
      if (dt <= 0 || now - b.t > 90) return 0;
      return (b.x - a.x) / dt;
    }
    function follow(x, instant) {
      var g = drag.g, tx = Math.min(Math.max(x - g.left - g.thumb / 2, 0), g.thumb * (n - 1));
      thumb.style.transition = instant ? "none" : "transform .12s ease-out"; thumb.style.transform = "translateX(" + tx + "px)";
      drag.idx = clamp(Math.floor((tx + g.thumb / 2) / g.thumb)); paint(drag.idx);
    }
    function end(commit, x) {
      if (!drag) return;
      var d = drag, idx; drag = null;
      if (d.dragging) { var vx = velocity(d); idx = Math.abs(vx) >= FLICK_V ? clamp(d.start + (vx > 0 ? 1 : -1)) : d.idx; }
      else idx = clamp(Math.floor((x - d.g.left) / d.g.thumb));
      thumb.style.transition = ""; thumb.style.transform = "";
      if (commit && idx !== getIdx()) onPick(idx);
      sync();
    }
    sw.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      drag = { g: geom(), start: getIdx(), idx: getIdx(), id: e.pointerId, startX: e.clientX, lastX: e.clientX, dragging: false, samples: [{ t: performance.now(), x: e.clientX }] };
      try { sw.setPointerCapture(e.pointerId); } catch (err) {}
    });
    sw.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.lastX = e.clientX; drag.samples.push({ t: performance.now(), x: e.clientX }); if (drag.samples.length > 30) drag.samples.shift();
      if (!drag.dragging) { if (Math.abs(e.clientX - drag.startX) < DRAG_START) return; drag.dragging = true; follow(e.clientX, false); return; }
      follow(e.clientX, true);
    });
    sw.addEventListener("pointerup", function (e) { if (drag && e.pointerId === drag.id) end(true, e.clientX); });
    sw.addEventListener("pointercancel", function () { if (drag) end(drag.dragging, drag.lastX); });
    sw.addEventListener("lostpointercapture", function () { if (drag) end(drag.dragging, drag.lastX); });
    sw.tabIndex = 0;
    sw.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { onPick(clamp(getIdx() - 1)); sync(); e.preventDefault(); }
      if (e.key === "ArrowRight") { onPick(clamp(getIdx() + 1)); sync(); e.preventDefault(); }
    });
    return sync;
  }

  // ---------- 선택한 과목 (직접 수정하기 전까지 계속 유지) ----------
  var SUBJ_KEY = "examTimer.subjects.v1", memSubj = { 1: null, 2: null }, subjFailed = false;
  function loadSubjects() {
    var s = null;
    if (subjFailed) return { 1: memSubj[1], 2: memSubj[2] };
    try { s = JSON.parse(localStorage.getItem(SUBJ_KEY)); } catch (e) {}
    if (s && typeof s === "object") {
      return {
        1: ALL_SUBJECTS.indexOf(s[1]) >= 0 ? s[1] : null,
        2: ALL_SUBJECTS.indexOf(s[2]) >= 0 ? s[2] : null
      };
    }
    return { 1: memSubj[1], 2: memSubj[2] };
  }
  // 탐구 과목 번호 = ALL_SUBJECTS 안의 순서 (생활과 윤리 1 … 지구과학Ⅱ 17). 화면에는 보이지 않고, 탐1이 탐2보다 번호가 크면 자동으로 서로 바꿈
  function subjectNo(name) { return ALL_SUBJECTS.indexOf(name); }
  function normalizeSubjects() {
    var s = loadSubjects();
    if (s[1] && s[2] && subjectNo(s[1]) > subjectNo(s[2])) { var a = s[1], b = s[2]; setSubject(1, b); setSubject(2, a); if (typeof fixRecordSlots === "function") fixRecordSlots(); return true; }
    return false;
  }
  function setSubject(slot, subject) {
    var s = loadSubjects();
    s[slot] = subject;
    memSubj = s;
    try { localStorage.setItem(SUBJ_KEY, JSON.stringify(s)); subjFailed = false; } catch (e) { subjFailed = true; }
    if (typeof onSubjectsChanged === "function") onSubjectsChanged();                 // 선택한 과목도 계정에 저장
  }

