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

  // ---------- 시계 눈금과 숫자 ----------
  var ticks = $("ticks"), nums = $("nums"), NS = "http://www.w3.org/2000/svg";
  for (var i = 0; i < 60; i++) {
    var major = i % 5 === 0;
    var r = document.createElementNS(NS, "rect");
    r.setAttribute("x", major ? -1.6 : -0.6);
    r.setAttribute("y", -90);
    r.setAttribute("width", major ? 3.2 : 1.2);
    r.setAttribute("height", major ? 9 : 4);
    r.setAttribute("fill", "#17181a");
    r.setAttribute("transform", "rotate(" + (i * 6) + ")");
    ticks.appendChild(r);
  }
  for (var n = 1; n <= 12; n++) {
    var t = document.createElementNS(NS, "text");
    var a = n * 30 * Math.PI / 180;
    t.setAttribute("x", (Math.sin(a) * 70).toFixed(2));
    t.setAttribute("y", (-Math.cos(a) * 70 + 5.4).toFixed(2));
    t.textContent = n;
    nums.appendChild(t);
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
  function setSubject(slot, subject) {
    var s = loadSubjects();
    s[slot] = subject;
    memSubj = s;
    try { localStorage.setItem(SUBJ_KEY, JSON.stringify(s)); subjFailed = false; } catch (e) { subjFailed = true; }
    if (typeof onSubjectsChanged === "function") onSubjectsChanged();                 // 선택한 과목도 계정에 저장
  }

