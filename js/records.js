// [records.js] 오늘의 기록 저장/불러오기, 하루가 지나면 초기화, 기록 상자 그리기
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 오늘의 기록 (응시한 순서대로 보관, 하루가 지나면 초기화) ----------
  var ALL_KEY = "examTimer.records.v3", OLD_KEY = "examTimer.today.v2", memAll = null;
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  var storeFailed = false;                       // 저장소에 쓰기가 실패했으면(용량 초과 등) 이번 방문 동안은 메모리 값을 우선
  function saveAll(arr) {
    memAll = arr;
    try { localStorage.setItem(ALL_KEY, JSON.stringify(arr)); storeFailed = false; } catch (e) { storeFailed = true; }
    if (typeof onRecordsChanged === "function") onRecordsChanged();             // 계정 기록 동기화
    scheduleSync();
  }
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
  function loadAll() {
    if (storeFailed && memAll) return memAll;
    var arr = null;
    try { arr = JSON.parse(localStorage.getItem(ALL_KEY)); } catch (e) {}
    if (Array.isArray(arr)) return sanitize(arr);
    if (memAll) return memAll;
    // 이전 버전에서 쓰던 기록이 있으면 그대로 이어받기
    var old = null;
    try { old = JSON.parse(localStorage.getItem(OLD_KEY)); } catch (e) {}
    arr = sanitize((old && Array.isArray(old.records)) ? old.records : []);
    saveAll(arr);
    return arr;
  }
  function findRec(arr, id) {
    for (var j = 0; j < arr.length; j++) if (arr[j].id === id) return arr[j];
    return null;
  }
  function removeRec(id) {
    saveAll(loadAll().filter(function (x) { return x.id !== id; }));
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
  // ---------- 하루가 지나면 초기화 ----------
  // 기록은 "오늘 것"만 남긴다. 날짜가 바뀐 걸 알아채면 기록과 진행 중 정보를 지우고 페이지를 새로 불러온다. (선택한 과목은 유지)
  var DAY_KEY = "examTimer.day.v1";
  function todayStr() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayRollover(keepId) {                   // 날짜가 바뀌어 지웠으면 true. keepId: 방금 끝난 시험은 남김(자정을 넘겨 끝난 경우)
    var t = todayStr(), stamp = null;
    try { stamp = localStorage.getItem(DAY_KEY); } catch (e) { return false; }
    if (stamp === t) return false;
    if (stamp == null) { try { localStorage.setItem(DAY_KEY, t); } catch (e) {} return false; }   // 이전 버전에서 넘어온 기록은 오늘 것으로 봄
    var keep = keepId ? loadAll().filter(function (r) { return r.id === keepId; }) : [];
    saveAll(keep);
    try { localStorage.removeItem(OLD_KEY); localStorage.setItem(DAY_KEY, t); } catch (e) {}
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
    var all = loadAll(), subjects = loadSubjects();
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
    var all = loadAll(), nums = attemptNumbers(all), recBox = $("recBox");
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
    $("recordsEmpty").style.display = all.length ? "none" : "";
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

