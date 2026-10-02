// [history.js] 헤더의 날짜 이동(◀ ▶)과 달력. 날짜를 고르면 홈 화면(기록 목록·그래프·숫자)이 그 날의 기록으로 바뀜 (보는 날짜는 records.js 의 viewDay)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  function isStats() { return typeof statsOn !== "undefined" && statsOn; }
  var HIST_WD = ["일", "월", "화", "수", "목", "금", "토"], histMonth = "", histCalOpen = false;
  function dayDate(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function dayAdd(s, n) { var d = dayDate(s); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayLabel(s) { var d = dayDate(s); return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + HIST_WD[d.getDay()] + ")"; }
  function histFirstDay() { var a = localDays().filter(function (d) { return loadDay(d).length > 0; }); var t = todayStr(); return a.length && a[0] < t ? a[0] : t; }
  function histHas(d) { return loadDay(d).length > 0; }
  function histSelect(d) { var t = todayStr(); if (d > t) d = t; histMonth = d.slice(0, 7); histCalOpen = false; setStats(false, true); setViewDay(d === t ? "" : d); }
  function renderHistCal(box) {
    var t = todayStr(), cur = viewDayStr(), p = histMonth.split("-"), y = +p[0], m = +p[1], first = new Date(y, m - 1, 1), last = new Date(y, m, 0).getDate();
    var head = el("div", "hcHead"), prev = el("button", "hcNav", "‹"), next = el("button", "hcNav", "›");
    prev.type = next.type = "button";
    prev.addEventListener("click", function () { var d = new Date(y, m - 2, 1); histMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1); renderHistory(); });
    next.addEventListener("click", function () { var d = new Date(y, m, 1); histMonth = d.getFullYear() + "-" + pad(d.getMonth() + 1); renderHistory(); });
    next.disabled = histMonth >= t.slice(0, 7);
    head.appendChild(prev); head.appendChild(el("span", "hcTitle", y + "년 " + m + "월")); head.appendChild(next);
    box.appendChild(head);
    var grid = el("div", "hcGrid");
    HIST_WD.forEach(function (w) { grid.appendChild(el("span", "hcWd", w)); });
    for (var i = 0; i < first.getDay(); i++) grid.appendChild(el("span", "hcBlank"));
    for (var n = 1; n <= last; n++) {
      var ds = y + "-" + pad(m) + "-" + pad(n), b = el("button", "hcDay" + (ds === cur ? " sel" : "") + (ds === t ? " today" : "") + (histHas(ds) ? " has" : ""), String(n));
      b.type = "button"; b.disabled = ds > t;
      (function (d) { b.addEventListener("click", function () { histSelect(d); }); })(ds);
      grid.appendChild(b);
    }
    box.appendChild(grid);
    box.appendChild(el("div", "hcDivider"));
    var sb = el("button", "hcStats" + (isStats() ? " on" : ""), isStats() ? "날짜별 기록으로 돌아가기" : "전체 통계 보기");
    sb.type = "button";
    sb.addEventListener("click", function () { histCalOpen = false; if (isStats()) setStats(false); else setStats(true); renderHistory(); });
    box.appendChild(sb);
  }
  function renderHistory() {
    if (!$("histDate")) return;
    var t = todayStr(), cur = viewDayStr();
    if (!histMonth) histMonth = cur.slice(0, 7);
    $("histDate").textContent = isStats() ? "전체 통계" : dayLabel(cur);
    $("histPrev").disabled = isStats() || cur <= histFirstDay();
    $("histNext").disabled = isStats() || cur >= t;
    var cal = $("histCal"); cal.textContent = ""; cal.classList.toggle("hidden", !histCalOpen);
    if (histCalOpen) renderHistCal(cal);
  }
  $("histPrev").addEventListener("click", function () { histSelect(dayAdd(viewDayStr(), -1)); });
  $("histNext").addEventListener("click", function () { histSelect(dayAdd(viewDayStr(), 1)); });
  $("histDate").addEventListener("click", function () { histCalOpen = !histCalOpen; histMonth = viewDayStr().slice(0, 7); renderHistory(); });
  document.addEventListener("click", function (e) { if (histCalOpen && !(e.target.closest && e.target.closest("#dateNav"))) { histCalOpen = false; renderHistory(); } });
  renderHistory();
