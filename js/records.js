// [records.js] 오늘의 기록 저장/불러오기, 하루가 지나면 초기화, 기록 상자 그리기
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 오늘의 기록 (응시한 순서대로 보관, 하루가 지나면 초기화) ----------
  var ALL_KEY = "examTimer.records.v3", OLD_KEY = "examTimer.today.v2";            // 옛 저장 칸(날짜 구분 없던 시절): 처음 한 번 날짜별 칸으로 옮김
  var DAYREC_PREFIX = "examTimer.rec.v4.", DAYS_KEY = "examTimer.recDays.v1", DAY_CUTOFF_H = 5;     // DAY_CUTOFF_H: 하루가 시작되는 시각 (5 = 아침 5시). 하루는 그날 05:00 ~ 다음날 05:00 이고, 시험은 시작한 시각이 속한 하루로 처리됨 (03~05시에 시작하면 전날 기록)
  var memDays = {}, storeFailed = false;           // 저장소에 쓰기가 실패했으면(용량 초과 등) 이번 방문 동안은 메모리 값을 우선
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  // ---- 날짜 도우미: 모든 "오늘/날짜" 계산은 여기 한 곳에서만 ----
  function dayStrOf(ms) { var d = new Date(ms - DAY_CUTOFF_H * 3600000); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayStr() { return dayStrOf(Date.now()); }
  function validDay(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
  function idTime(id) { var t = parseInt(String(id).slice(0, 8), 36); return (isFinite(t) && t > 1e12) ? t : 0; }      // 기록 ID의 앞부분 = 시험을 시작한 시각
  function dayOfId(id) { var t = idTime(id); return t ? dayStrOf(t) : todayStr(); }                                  // 기록이 속한 날짜 = 시작한 날 (자정을 넘겨 끝나도 시작한 날)
  // ---- 날짜별 기록 저장: 칸 하나 = 하루 ({v, list, gone}). gone = 지운 기록 ID(기기끼리 합칠 때 되살아나지 않게) ----
  function readDayRaw(d) {
    var o = null; try { o = JSON.parse(localStorage.getItem(DAYREC_PREFIX + d)); } catch (e) {}
    return (o && Array.isArray(o.list)) ? { list: o.list, gone: Array.isArray(o.gone) ? o.gone.filter(function (x) { return typeof x === "string"; }) : [] } : null;
  }
  function localDays() { var a = []; try { a = JSON.parse(localStorage.getItem(DAYS_KEY)); } catch (e) {} return Array.isArray(a) ? a.filter(validDay) : []; }
  function addDayIdx(d) { var a = localDays(); if (a.indexOf(d) < 0) { a.push(d); a.sort(); try { localStorage.setItem(DAYS_KEY, JSON.stringify(a)); } catch (e) {} } }
  function removeLocalDay(d) { delete memDays[d]; try { localStorage.removeItem(DAYREC_PREFIX + d); localStorage.setItem(DAYS_KEY, JSON.stringify(localDays().filter(function (x) { return x !== d; }))); } catch (e) {} }
  function dayGone(d) { var o = memDays[d] || readDayRaw(d); return o ? o.gone : []; }
  function saveDay(d, arr, gone, silent) {         // silent: 서버에서 받은 값을 반영할 때 (다시 서버로 올리지 않음)
    var g = (gone || dayGone(d)).slice(-100);
    memDays[d] = { list: arr, gone: g };
    try { localStorage.setItem(DAYREC_PREFIX + d, JSON.stringify({ v: 1, list: arr, gone: g })); addDayIdx(d); storeFailed = false; } catch (e) { storeFailed = true; }
    if (!silent && typeof onRecordsChanged === "function") onRecordsChanged(d);
    scheduleSync();
    if (typeof renderHistory === "function") renderHistory();
  }
  function migrateOldRecords() {                   // 날짜 구분 없이 하나로 저장하던 옛 기록을, 그 기록이 속한 날짜 칸으로 옮김
    var arr = null, old = null, stamp = null;
    try { arr = JSON.parse(localStorage.getItem(ALL_KEY)); } catch (e) {}
    try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) {}
    try { stamp = localStorage.getItem("examTimer.day.v1"); } catch (e) {}
    if (!Array.isArray(arr) && !(old && Array.isArray(old.records))) return;
    var list = Array.isArray(arr) ? arr : old.records, d = validDay(stamp) ? stamp : todayStr();
    var cur = loadDay(d);
    saveDay(d, mergeById(cur, sanitize(list)));
    try { localStorage.removeItem(ALL_KEY); localStorage.removeItem(OLD_KEY); } catch (e) {}
  }
  function mergeById(a, b) { var seen = {}, out = []; a.concat(b).forEach(function (r) { if (!seen[r.id]) { seen[r.id] = 1; out.push(r); } }); return out; }
  // 저장된 값이 깨져 있어도 화면이 멈추지 않도록 한 줄씩 점검해서 쓸 수 있는 형태로 만듦
  function cleanScore(v) { return (typeof v === "number" && isFinite(v) && v >= 0 && v <= 50 && Math.floor(v) === v) ? v : null; }
  function cleanSecs(v) { return (typeof v === "number" && isFinite(v) && v >= 0) ? v : null; }
  function sanitize(arr) {
    var seen = {}, out = [];
    arr.forEach(function (r) {
      if (!r || typeof r !== "object") return;
      var c = {}, k, id = (typeof r.id === "string" && r.id) ? r.id : newId();
      for (k in r) c[k] = r[k];
      while (seen[id]) id = newId();
      seen[id] = true;
      c.id = id;
      c.slot = (r.slot === 2 || (r.slot == null && r.key === "earth")) ? 2 : 1;
      c.subject = (typeof r.subject === "string" && r.subject) ? r.subject.slice(0, 40) : (r.key === "earth" ? "지구과학Ⅰ" : "생명과학Ⅰ");
      c.score1 = cleanScore(r.score1); c.score2 = cleanScore(r.score2);
      c.elapsed = cleanSecs(r.elapsed); c.elapsed1 = cleanSecs(r.elapsed1);
      c.usedExtra = !!r.usedExtra;
      out.push(c);
    });
    return out;
  }
  function loadDay(d) {
    if (storeFailed && memDays[d]) return memDays[d].list;
    var o = readDayRaw(d);
    if (o) { var l = sanitize(o.list); memDays[d] = { list: l, gone: o.gone }; return l; }
    return memDays[d] ? memDays[d].list : [];
  }
  var migrated = false;
  function loadAll() {                             // 오늘의 기록 (화면·친구 공유·그래프는 모두 오늘 것을 기준으로 함)
    if (!migrated) { migrated = true; migrateOldRecords(); }
    return loadDay(todayStr());
  }
  var viewDay = "";                                // 홈 화면에 보여 줄 날짜 ("" = 오늘). 헤더의 날짜 이동으로 바뀜
  function viewDayStr() { var t = todayStr(); return (validDay(viewDay) && viewDay < t) ? viewDay : t; }
  function loadView() { return loadDay(viewDayStr()); }          // 홈 화면(기록 목록·그래프·숫자)이 읽는 기록
  function setViewDay(d) {
    viewDay = d || ""; clearSelection(); focusSubject = ""; scoreExpanded = false;
    if (typeof renderHistory === "function") renderHistory();
    renderToday();
  }
  function saveAll(arr, day) {                     // 기록 저장 (day 생략 시 오늘). 목록에서 빠진 기록은 "지운 기록"으로 남김
    var d = day || todayStr(), prev = loadDay(d), keep = {}, gone = dayGone(d).slice();
    arr.forEach(function (r) { keep[r.id] = 1; });
    prev.forEach(function (r) { if (!keep[r.id] && gone.indexOf(r.id) < 0) gone.push(r.id); });
    saveDay(d, arr, gone);
  }
  function fixRecordSlots() {                      // 기록의 탐1/탐2 표시를 지금 고른 과목에 맞춤 (과목 자리가 바뀌면 이미 쌓인 기록도 같이 바뀜). 모든 날짜가 대상
    var s = loadSubjects(), any = false;
    localDays().forEach(function (d) {
      var arr = loadDay(d), ch = false;
      arr.forEach(function (r) { var sub = recSubject(r), want = (sub === s[1]) ? 1 : ((sub === s[2]) ? 2 : 0); if (want && r.slot !== want) { r.slot = want; ch = true; } });
      if (ch) { saveDay(d, arr); any = true; }
    });
    return any;
  }
  function findRec(arr, id) {
    for (var j = 0; j < arr.length; j++) if (arr[j].id === id) return arr[j];
    return null;
  }
  function removeRec(id) {                         // 기록이 속한 날짜 칸에서 지움 (자정을 넘긴 시험도 그 시험의 날짜에서)
    var d = dayOfId(id), gone = dayGone(d).slice();
    if (gone.indexOf(id) < 0) gone.push(id);
    saveDay(d, loadDay(d).filter(function (x) { return x.id !== id; }), gone);
  }
  // 과목별로 응시한 순서대로 회차를 매긴다 (첫 번째 = 1회, 두 번째 = 2회 …)
  function attemptNumbers(all) {
    var count = {}, nums = {};
    all.forEach(function (r) {
      var sub = recSubject(r);
      count[sub] = (count[sub] || 0) + 1;
      nums[r.id] = count[sub];
    });
    return nums;
  }
  // ---------- 날짜가 바뀌면 화면만 새로 ----------
  // 기록은 날짜별 칸에 그대로 남고, 새 날에는 빈 오늘이 시작된다. (선택한 과목은 유지)
  var DAY_KEY = "examTimer.day.v1";
  function dayRollover() {                         // 날짜가 바뀐 걸 처음 알아챘으면 true
    var t = todayStr(), stamp = null;
    try { stamp = localStorage.getItem(DAY_KEY); } catch (e) { return false; }
    if (stamp === t) return false;
    try { localStorage.setItem(DAY_KEY, t); } catch (e) {}
    if (stamp == null) return false;
    clearSession();
    return true;
  }
  function sessionPending() { try { return !!localStorage.getItem(SESSION_KEY); } catch (e) { return false; } }
  function checkNewDay(atStart) {
    if (!atStart && (phase !== "idle" || stage.classList.contains("on"))) return;   // 시험 중에는 건드리지 않음
    if (sessionPending()) return;
    if (!dayRollover()) return;
    if (atStart) return;
    var ok = false;
    try { ok = localStorage.getItem(DAY_KEY) === todayStr(); } catch (e) {}
    if (ok) { location.reload(); return; }          // 하드 리셋
    clearSelection(); focusSubject = ""; scoreExpanded = false; renderSlots(); renderToday();
  }

  // 예전 버전의 기록(생1/지1)도 그대로 읽을 수 있게
  function recSlot(rec) { return rec.slot === 2 ? 2 : 1; }
  function recSubject(rec) { return rec.subject || (rec.key === "earth" ? "지구과학Ⅰ" : "생명과학Ⅰ"); }

  function fmtDur(sec) {
    if (typeof sec !== "number" || !isFinite(sec)) return "-";
    var total = Math.round(sec), m = Math.floor(total / 60), s = total % 60;
    return m + "분 " + s + "초";
  }
  function fmtClock(sec) {
    sec = Math.max(0, Math.floor(sec));
    return pad(Math.floor(sec / 60)) + ":" + pad(sec % 60);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function renderSlots() {
    var subjects = loadSubjects();
    [1, 2].forEach(function (slot) {
      var b = $("slot" + slot), subj = subjects[slot];
      b.textContent = "";
      b.classList.toggle("empty", !subj);
      if (subj) {
        b.appendChild(el("span", "tag", SLOTS[slot].label));
        b.appendChild(el("span", "main", subj));
      } else {
        b.appendChild(el("span", "main", SLOTS[slot].label));
        b.appendChild(el("span", "sub", "눌러서 과목 선택"));
      }
      b.appendChild(el("span", "range", SLOTS[slot].range));
    });
  }

  // 점수가 비어 있을 때만 보이는 작은 펜 버튼 (한 번 입력하면 사라짐)
  var TRASH_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>';
  var PEN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
  function penBtn(rec, field, label) {
    var b = el("button", "pen");
    b.type = "button"; b.innerHTML = PEN_ICON;
    b.setAttribute("aria-label", label); b.setAttribute("title", "점수 입력");
    b.addEventListener("click", function () { openLate(rec.id, field, label); });
    return b;
  }

  // 다시 그리는 동안 페이지 전체의 스크롤 위치는 그대로 유지
  function keepPageScroll(fn) {
    var top = home.scrollTop;
    fn();
    if (home.scrollTop !== top) home.scrollTop = top;
  }
  function renderToday() {
    keepPageScroll(function () {
      renderSummary();
      renderRecords();
      renderChart();
      renderTogether();
    });
  }
  function renderSummary() {
    var all = loadAll(), subjects = loadSubjects(), vd = viewDayStr(), vt = vd === todayStr();      // 상단 숫자는 항상 "오늘" 응시 수
    $("recTitle").textContent = vt ? "오늘의 응시 기록" : (Number(vd.slice(5, 7)) + "월 " + Number(vd.slice(8)) + "일의 응시 기록");
    // 선택한 과목 이름으로 표시 (아직 안 골랐으면 탐1/탐2), 다른 과목으로 본 기록이 있으면 함께 표시
    var entries = [];
    function entry(name) {
      for (var q = 0; q < entries.length; q++) if (entries[q].name === name) return entries[q];
      var en = { name: name, count: 0 };
      entries.push(en);
      return en;
    }
    [1, 2].forEach(function (slot) { entry(subjects[slot] || SLOTS[slot].label); });
    all.forEach(function (x) { entry(recSubject(x)).count++; });
    $("todayTotal").textContent = all.length;
    $("todayDetail").textContent = entries.map(function (en) { return en.name + " " + en.count + "회"; }).join(", ");
  }
  // 응시 기록 상자만 다시 그림 (과목 버튼을 누를 때는 그래프나 페이지는 건드리지 않음)
  function renderRecords(keepHeight) {
    var all = loadView(), nums = attemptNumbers(all), recBox = $("recBox");
    if (keepHeight) recBox.style.minHeight = recBox.offsetHeight + "px";   // 목록이 짧아져도 상자 크기를 유지해서 페이지 길이가 안 변하게
    else recBox.style.minHeight = "";
    // 과목별로 따로 보기 (상자 위쪽 버튼)
    var color = colorMap(all), subs = [];
    all.forEach(function (r) { var nm = recSubject(r); if (subs.indexOf(nm) < 0) subs.push(nm); });
    if (focusSubject && subs.indexOf(focusSubject) < 0) focusSubject = "";
    var rf = $("recFilter");
    rf.textContent = "";
    $("recTop").classList.toggle("hidden", !all.length);
    function filterChip(label, value, c) {
      var on = focusSubject === value;
      var bt = el("button", "rf" + (on ? " on" : ""));
      bt.type = "button"; bt.setAttribute("aria-pressed", on ? "true" : "false");
      if (c) { var d = el("span", "cdot"); d.style.background = c; bt.appendChild(d); }
      bt.appendChild(document.createTextNode(label));
      bt.addEventListener("click", function () {
        focusSubject = (value && focusSubject === value) ? "" : value;   // 그래프도 같은 과목으로
        clearSelection();
        keepPageScroll(function () { renderRecords(true); renderChart(); });
        $("records").scrollTop = 0;
      });
      return bt;
    }
    if (subs.length) {
      rf.appendChild(filterChip("전체", "", null));
      subs.forEach(function (nm) { rf.appendChild(filterChip(nm, nm, color[nm])); });
    }

    // 가장 최근에 본 것이 위로
    var ul = $("records"), keepTop = ul.scrollTop;
    ul.textContent = "";
    $("recordsEmpty").style.display = all.length ? "none" : ""; $("recordsEmpty").textContent = viewDayStr() === todayStr() ? "아직 응시한 실모가 없어요." : "이 날은 응시한 기록이 없어요.";
    var shown = focusSubject ? all.filter(function (r) { return recSubject(r) === focusSubject; }) : all;
    shown.slice().reverse().forEach(function (rec) {
      var title = recSubject(rec) + " " + nums[rec.id] + "회";
      var li = el("li", "rec");
      var info = el("div", "info");
      var head = el("div", "head");
      head.appendChild(el("span", "subj", title));
      head.appendChild(el("span", "badge", SLOTS[recSlot(rec)].label));
      info.appendChild(head);
      var sc = el("div", "scores");
      if (rec.score1 != null) sc.appendChild(el("span", "", rec.score1 + "점"));
      else { sc.appendChild(el("span", "none", "점수 미입력")); sc.appendChild(penBtn(rec, "score1", title + " 점수 입력")); }
      if (rec.usedExtra) {
        sc.appendChild(document.createTextNode(", "));
        if (rec.score2 != null) sc.appendChild(el("span", "", "호머식 " + rec.score2 + "점"));
        else { sc.appendChild(el("span", "none", "호머식 미입력")); sc.appendChild(penBtn(rec, "score2", title + " 호머식 점수 입력")); }
      }
      info.appendChild(sc);
      if (rec.elapsed != null) info.appendChild(el("div", "meta", fmtDur(rec.elapsed) + " 걸림"));
      var del = el("button", "del"); del.type = "button"; del.innerHTML = TRASH_ICON; del.setAttribute("aria-label", "삭제"); del.setAttribute("title", "삭제");
      del.addEventListener("click", function () {
        var label = title + (rec.score1 != null ? " " + rec.score1 + "점" : "") + " 기록을 삭제하겠습니까?";
        ask(label, "삭제", true, function () { removeRec(rec.id); renderToday(); });
      });
      li.appendChild(info); li.appendChild(del);
      ul.appendChild(li);
    });
    ul.scrollTop = keepTop;
  }

