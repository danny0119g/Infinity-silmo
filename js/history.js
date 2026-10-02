// [history.js] 날짜별 기록 보기 (대략적인 화면): 날짜 이동(◀ ▶) + 달력 + 그날의 응시 목록
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var HIST_WD = ["일", "월", "화", "수", "목", "금", "토"], histDay = "", histMonth = "", histCalOpen = false;
  function dayDate(s) { var a = s.split("-"); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function dayAdd(s, n) { var d = dayDate(s); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function dayLabel(s) { var d = dayDate(s); return (d.getMonth() + 1) + "월 " + d.getDate() + "일 (" + HIST_WD[d.getDay()] + ")"; }
  function histFirstDay() { var a = localDays().filter(function (d) { return loadDay(d).length > 0; }); return a.length ? a[0] : todayStr(); }
  function histHas(d) { return loadDay(d).length > 0; }
  function histSelect(d) { var t = todayStr(); if (d > t) d = t; histDay = d; histMonth = d.slice(0, 7); histCalOpen = false; renderHistory(); }
  function histTime(r) { var t = idTime(r.id); if (!t) return ""; var d = new Date(t); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function renderHistCal(box) {
    var t = todayStr(), p = histMonth.split("-"), y = +p[0], m = +p[1], first = new Date(y, m - 1, 1), last = new Date(y, m, 0).getDate();
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
      var ds = y + "-" + pad(m) + "-" + pad(n), b = el("button", "hcDay" + (ds === histDay ? " sel" : "") + (ds === t ? " today" : "") + (histHas(ds) ? " has" : ""), String(n));
      b.type = "button"; b.disabled = ds > t;
      (function (d) { b.addEventListener("click", function () { histSelect(d); }); })(ds);
      grid.appendChild(b);
    }
    box.appendChild(grid);
  }
  function renderHistory() {
    var card = $("histCard"); if (!card) return;
    var t = todayStr(); if (!histDay) { histDay = t; histMonth = t.slice(0, 7); }
    if (histDay > t) histDay = t;
    $("histDate").textContent = dayLabel(histDay) + (histDay === t ? " · 오늘" : "");
    $("histPrev").disabled = histDay <= histFirstDay();
    $("histNext").disabled = histDay >= t;
    var cal = $("histCal"); cal.textContent = ""; cal.classList.toggle("hidden", !histCalOpen);
    if (histCalOpen) renderHistCal(cal);
    var list = $("histList"), sum = $("histSum"), arr = loadDay(histDay);
    list.textContent = "";
    if (!arr.length) { sum.textContent = "이 날은 응시 기록이 없어요."; return; }
    var by = {}, order = [];
    arr.forEach(function (r) { var s = recSubject(r); if (by[s] == null) { by[s] = 0; order.push(s); } by[s]++; });
    sum.textContent = "총 " + arr.length + "개 · " + order.map(function (s) { return s + " " + by[s] + "회"; }).join(", ");
    var nums = attemptNumbers(arr);
    arr.forEach(function (r) {
      var li = el("li", "hrow"), l = el("div", "hl"), rr = el("div", "hr");
      var dot = el("span", "cdot"); dot.style.background = SUBJECT_COLORS[recSubject(r)] || "#9aa0aa";
      l.appendChild(dot);
      var tx = el("div", "ht"); tx.appendChild(el("div", "hs", recSubject(r) + " " + nums[r.id] + "회")); tx.appendChild(el("div", "hm", histTime(r))); l.appendChild(tx);
      var sc = r.score1 != null ? r.score1 + "점" : "점수 없음"; if (r.usedExtra && r.score2 != null) sc += " → " + r.score2 + "점";
      rr.appendChild(el("div", "hsc", sc));
      var secs = (r.elapsed1 != null) ? r.elapsed1 : r.elapsed; rr.appendChild(el("div", "hm", secs != null ? fmtDur(secs) : "-"));
      li.appendChild(l); li.appendChild(rr); list.appendChild(li);
    });
  }
  $("histPrev").addEventListener("click", function () { var d = dayAdd(histDay, -1); histSelect(d); });
  $("histNext").addEventListener("click", function () { histSelect(dayAdd(histDay, 1)); });
  $("histDate").addEventListener("click", function () { histCalOpen = !histCalOpen; histMonth = histDay.slice(0, 7); renderHistory(); });
  renderHistory();
