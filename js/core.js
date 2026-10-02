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
  var CLOCK_INK = "#0f3b2e", CLOCK_SOFT = "#b9bec8", CLOCK_ACCENT = "#b8892f";
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
  function setSubject(slot, subject) {
    var s = loadSubjects();
    s[slot] = subject;
    memSubj = s;
    try { localStorage.setItem(SUBJ_KEY, JSON.stringify(s)); subjFailed = false; } catch (e) { subjFailed = true; }
    if (typeof onSubjectsChanged === "function") onSubjectsChanged();                 // 선택한 과목도 계정에 저장
  }

