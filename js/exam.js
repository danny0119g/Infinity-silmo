// [exam.js] 시험 진행(타이머, 시작/탈주/종료), 전체 화면, 이벤트, 시작 처리
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 시험 상태 ----------
  // phase: idle → running(30분) → ended1(점수 입력 + 추가시간 질문) → extra(추가시간) → ended2(호머식 점수 입력) → idle
  var phase = "idle", current = null, recId = "", liveStart = 0;     // liveStart: 이번 응시를 시작한 실제 시각(ms), 친구들에게 "몇 분 지났는지" 보여 주는 용도
  var accum = 0, runStart = 0, runStartWall = 0, running = false;       // 시계가 실제로 흐른 시간(초)
  var sleepCredit = 0, hiddenAt = null;               // 화면이 잠겨 브라우저 시계가 멈춰 있던 동안 실제로 흐른 시간(초)
  var extraStart = 0;                                  // 추가 시간을 쓰기 시작한 시점(초)
  var raf = 0, offset = 0, wakeLock = null, showRemain = false;
  var warned = false, warnTimer = 0;

  // 평소에는 브라우저 시계(performance.now)만 쓰고, 화면이 잠겼다 돌아온 경우에만 "실제 시각은 흘렀는데 브라우저 시계는 멈춘 만큼"을 더해 줌
  function runSeconds() {
    return Math.max(0, (performance.now() - runStart) / 1000) + sleepCredit;
  }
  function elapsedNow() {
    return accum + (running ? runSeconds() : 0);
  }
  function resume() {
    if (running) return;
    running = true;
    runStart = performance.now(); runStartWall = Date.now(); sleepCredit = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }
  function pause() {
    if (!running) return;
    accum += runSeconds();
    sleepCredit = 0;
    running = false;
    cancelAnimationFrame(raf);
  }

  function setHands(simSeconds) {
    var s = simSeconds % 60;            // 초침: 소수점 포함 → 부드럽게
    var m = (simSeconds / 60) % 60;
    var h = (simSeconds / 3600) % 12;
    secondEl.setAttribute("transform", "rotate(" + (s * 6) + ")");
    minuteEl.setAttribute("transform", "rotate(" + (m * 6) + ")");
    hourEl.setAttribute("transform", "rotate(" + (h * 30) + ")");
  }
  function render(e) {
    var base = current.startH * 3600 + current.startM * 60 + offset;
    setHands(base + e);
    if (phase === "extra" || phase === "ended2") remainEl.textContent = "추가 시간 +" + fmtClock(Math.max(0, e - extraStart));
    else remainEl.textContent = "남은 시간 " + fmtClock(Math.ceil(Math.max(0, DURATION - e)));
  }

  function tick() {
    var e = elapsedNow();
    if (phase === "running" && e >= DURATION) { endRegular(DURATION); return; }
    render(e);
    if (phase === "running" && !warned && e >= WARN_AT) {
      warned = true;
      if (e - WARN_AT < 20) showWarn();             // 백그라운드에 있다가 한참 뒤에 돌아온 경우엔 틀린 알림이 되므로 띄우지 않음
    }
    raf = requestAnimationFrame(tick);
  }

  function showWarn() {
    warned = true;
    warnEl.classList.add("on");
    clearTimeout(warnTimer);
    warnTimer = setTimeout(hideWarn, WARN_SHOW_MS);
  }
  function hideWarn() { clearTimeout(warnTimer); warnEl.classList.remove("on"); }
  warnEl.addEventListener("click", hideWarn);

  function updateButtons() {
    $("abandon").classList.toggle("hidden", phase !== "running");
    $("endBtn").classList.toggle("hidden", !(phase === "running" || phase === "extra"));
    scheduleSync();                                  // 응시 상태(시작·추가 시간·종료)가 바뀌었으니 친구들에게도 알림
    if (typeof pushExamState === "function") pushExamState();      // 같은 계정의 다른 기기에도 알림
  }

  function saveRec(fields) {
    var all = loadAll(), rec = findRec(all, recId);
    if (!rec) {                                  // 어떤 이유로 기록이 없으면 새로 만든다
      rec = { id: recId, slot: current.slot, subject: current.subject };
      all.push(rec);
    }
    for (var k in fields) rec[k] = fields[k];
    saveAll(all);
  }

  // ---------- 전체 화면 ----------
  // 늘리기: 오른쪽 위·왼쪽 아래로 향하는 화살표 / 줄이기: 안쪽으로 향하는 반대 화살표
  var ICON_EXPAND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  var ICON_SHRINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function updateFsIcon() {
    var b = $("fs"), on = isFullscreen();
    b.innerHTML = on ? ICON_SHRINK : ICON_EXPAND;
    stage.classList.toggle("fs", on);
    b.setAttribute("aria-label", on ? "전체화면 해제" : "전체화면");
    b.setAttribute("title", on ? "전체화면 해제" : "전체화면");
  }
  document.addEventListener("fullscreenchange", updateFsIcon);
  document.addEventListener("webkitfullscreenchange", updateFsIcon);
  function enterFullscreen() {
    try {
      if (isFullscreen()) return;
      var de = document.documentElement, f = de.requestFullscreen || de.webkitRequestFullscreen;
      if (f) { var pr = f.call(de); if (pr && pr.catch) pr.catch(function () {}); }
    } catch (e) {}
  }
  function exitFullscreen() {
    try {
      if (!isFullscreen()) return;
      var f = document.exitFullscreen || document.webkitExitFullscreen;
      if (f) { var pr = f.call(document); if (pr && pr.catch) pr.catch(function () {}); }
    } catch (e) {}
  }

  // ---------- 진행 중인 시험 기억 (탭이 다시 불러와져도 시험이 사라지지 않게) ----------
  var SESSION_KEY = "examTimer.session.v1", SESSION_MAX = 12 * 3600 * 1000;
  function clearSession() { try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function saveSession() {
    if (phase === "idle" || !current) { clearSession(); return; }
    var obj = { v: 1, phase: phase, slot: current.slot, subject: current.subject, recId: recId, offset: offset,
                extraStart: extraStart, accum: accum, wall: running ? runStartWall : null, savedAt: Date.now() };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function restoreSession() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) {}
    if (!s || s.v !== 1 || !SLOTS[s.slot] || typeof s.subject !== "string" || typeof s.recId !== "string") { if (s) clearSession(); return false; }
    var now = Date.now(), ref = s.wall || s.savedAt || 0;
    if (!(now - ref < SESSION_MAX) || now < ref - 60000) { clearSession(); return false; }          // 너무 오래됐거나 시각이 이상하면 버림
    if (!findRec(loadAll(), s.recId)) { clearSession(); return false; }                              // 기록이 이미 지워졌으면 이어갈 게 없음
    var acc = Number(s.accum); if (!isFinite(acc) || acc < 0) acc = 0;
    var elapsed = acc + (s.wall ? Math.max(0, (now - s.wall) / 1000) : 0);
    current = { slot: s.slot, label: SLOTS[s.slot].label, subject: s.subject, startH: SLOTS[s.slot].startH, startM: SLOTS[s.slot].startM };
    recId = s.recId; offset = isFinite(Number(s.offset)) ? Number(s.offset) : 0;
    extraStart = isFinite(Number(s.extraStart)) ? Number(s.extraStart) : 0;
    home.style.display = "none"; stage.classList.add("on"); done.classList.remove("on");
    if (s.phase === "running" && elapsed < DURATION) {
      phase = "running"; accum = elapsed; running = false; warned = elapsed >= WARN_AT; liveStart = Date.now() - elapsed * 1000;
      updateButtons(); requestWake(); render(accum); resume(); saveSession();
    } else if (s.phase === "running") {                  // 안 보는 사이에 30분이 지났음
      phase = "running"; accum = DURATION; running = false; endRegular(DURATION); saveSession();
    } else if (s.phase === "extra") {
      phase = "extra"; accum = elapsed; running = false; liveStart = Date.now() - elapsed * 1000;
      updateButtons(); requestWake(); render(accum); resume(); saveSession();
    } else if (s.phase === "ended1" || s.phase === "ended2") {
      phase = s.phase; accum = acc; running = false;
      render(accum); updateButtons(); openScore(s.phase === "ended1" ? 1 : 2); saveSession();
    } else { clearSession(); home.style.display = ""; stage.classList.remove("on"); current = null; phase = "idle"; return false; }
    return true;
  }

  // ---------- 시작 / 탈주 / 종료 ----------
  function otherDeviceNotice() { notice("같은 계정의 다른 기기에서 응시 중이에요.\n그 시험이 끝난 뒤에 응시할 수 있어요."); }
  function start(slot) {
    var subject = loadSubjects()[slot];
    if (!subject) return;
    if (typeof acctExamLive === "function" && acctExamLive()) { otherDeviceNotice(); return; }
    closeProfile();
    closeAllChats("exam");                           // 대화 중이던 상대에게 "실모를 치러 갔다"고 알리고 내 창은 닫음
    current = { slot: slot, label: SLOTS[slot].label, subject: subject, startH: SLOTS[slot].startH, startM: SLOTS[slot].startM };
    recId = newId();
    var all = loadAll();
    all.push({ id: recId, slot: slot, subject: subject });   // "예"를 누르는 순간 횟수가 오른다
    saveAll(all);

    phase = "running";
    liveStart = Date.now();
    accum = 0; running = false; extraStart = 0;
    warned = false; hideWarn();
    // 시작 시각에서 -30초 ~ +30초: 초침은 아무 위치에서나 출발하고, 분침도 아주 조금 앞서거나 뒤처진다
    offset = Math.random() * 60 - 30;

    home.style.display = "none";
    stage.classList.add("on");
    done.classList.remove("on");
    updateButtons();
    requestWake();
    render(0);
    resume();
    saveSession();
    enterFullscreen();
  }

  function goHome() {
    cancelAnimationFrame(raf);
    running = false;
    phase = "idle";
    liveStart = 0;
    if (typeof pushExamState === "function") pushExamState();
    clearSession();
    dayRollover(recId);
    scheduleSync();
    hideWarn(); closeAsk();
    releaseWake();
    stage.classList.remove("on");
    done.classList.remove("on");
    home.style.display = "";
    renderToday();
    exitFullscreen();
  }

  function abandon() {       // 탈주: 방금 올라간 횟수(기록)를 되돌린다
    if (phase !== "running") return;
    removeRec(recId);
    goHome();
  }
  function askAbandon() {
    if (phase !== "running" || modal.classList.contains("on")) return;
    ask("정말로 응시를 포기하겠습니까?", "포기하기", true, abandon);
  }

  // 30분이 끝났거나, 중간에 종료를 확정했을 때
  function endRegular(e) {
    pause();
    accum = e;
    render(e);
    hideWarn(); closeAsk();
    markDone();
    phase = "ended1";
    updateButtons();
    openScore(1);
    saveSession();
  }
  // 추가 시간을 쓰다가 종료 버튼을 눌렀을 때
  function endExtra() {
    pause();
    render(accum);
    markDone();
    phase = "ended2";
    updateButtons();
    openScore(2);
    saveSession();
  }

  function openScore(step) {
    $("doneTitle").textContent = step === 1 ? "시험이 종료되었습니다" : "추가 시간이 종료되었습니다";
    $("doneSubject").textContent = current.subject;
    $("doneTime").textContent = (step === 1 ? "시험 시간 " : "총 걸린 시간 ") + fmtDur(accum);
    $("scoreLabel").textContent = step === 1 ? "점수" : "호머식 점수";
    scoreInput.value = "";
    scoreErr.textContent = "";
    scoreInput.classList.remove("bad");
    $("extraBlock").classList.toggle("hidden", step !== 1);
    $("scoreSave").classList.toggle("hidden", step !== 2);
    done.classList.add("on");
    done.scrollTop = 0;
  }

  function readScore() {
    var v = scoreInput.value.trim();
    if (v === "") { scoreErr.textContent = ""; return { ok: true, value: null }; }
    var num = Number(v);
    if (!/^\d{1,2}$/.test(v) || num < 0 || num > 50) {
      scoreErr.textContent = "0~50 사이의 정수로 입력해 주세요.";
      return { ok: false };
    }
    scoreErr.textContent = "";
    return { ok: true, value: num };
  }

  // 점수를 비워 둔 채 넘어가려 하면: 입력창 테두리를 빨갛게 하고, "예"를 눌러야만 넘어감
  function withScore(question, next) {
    var v = scoreInput.value.trim();
    if (v !== "") {
      var sc = readScore();
      if (sc.ok) next(sc.value);
      return;
    }
    scoreInput.classList.add("bad");
    ask(question, "예", false, function () { next(null); }, function () { scoreInput.focus(); });
  }

  // 점수 입력 후 "추가 시간을 이용하겠습니까?"
  $("extraYes").addEventListener("click", function () {
    if (phase !== "ended1") return;
    withScore("점수를 입력하지 않겠습니까?", function (score) {
    if (phase !== "ended1") return;
    saveRec({ score1: score, elapsed1: Math.round(accum), usedExtra: true, elapsed: Math.round(accum) });
    phase = "extra";
    extraStart = accum;            // 여기서부터 추가 시간이 올라감
    done.classList.remove("on");
    updateButtons();
    scoreInput.blur();             // 키보드부터 내리고
    // 키보드가 완전히 내려간 뒤에 전체 화면으로 (키보드 애니메이션과 겹치면 아이패드에서 멈추는 문제 방지)
    setTimeout(function () { if (phase === "extra" && stage.classList.contains("on")) enterFullscreen(); }, 450);
    resume();                      // 멈췄던 지점에서 이어서 돌아감
    saveSession();
    });
  });
  $("extraNo").addEventListener("click", function () {
    if (phase !== "ended1") return;
    withScore("점수를 입력하지 않겠습니까?", function (score) {
      if (phase !== "ended1") return;
      saveRec({ score1: score, elapsed1: Math.round(accum), usedExtra: false, elapsed: Math.round(accum) });
      goHome();
    });
  });
  function saveExtraScore() {
    if (phase !== "ended2") return;
    withScore("호머식 점수를 입력하지 않겠습니까?", function (score) {
      if (phase !== "ended2") return;
      saveRec({ score2: score, elapsed: Math.round(accum) });
      goHome();
    });
  }
  $("scoreSave").addEventListener("click", saveExtraScore);
  // 점수를 쓰려고 키보드를 열기 전에 전체 화면부터 깔끔하게 해제 (키보드와 전체 화면이 동시에 얽히지 않게)
  scoreInput.addEventListener("focus", function () { exitFullscreen(); });
  scoreInput.addEventListener("keydown", function (e) { if (e.key === "Enter") saveExtraScore(); });
  scoreInput.addEventListener("input", function () { scoreInput.value = scoreInput.value.replace(/\D/g, ""); scoreErr.textContent = ""; scoreInput.classList.remove("bad"); });

  // 종료 버튼
  $("endBtn").addEventListener("click", function () {
    if (modal.classList.contains("on")) return;
    if (phase === "running") {
      ask("시험을 종료하겠습니까?", "예", false, function () {
        if (phase !== "running") return;
        endRegular(Math.min(elapsedNow(), DURATION));
      });
    } else if (phase === "extra") {
      endExtra();
    }
  });
  $("abandon").addEventListener("click", askAbandon);

  // ---------- 화면 켜짐 유지 ----------
  var wakeToken = 0;
  function requestWake() {
    try {
      if (!navigator.wakeLock) return;
      releaseWake();
      var mine = ++wakeToken;
      navigator.wakeLock.request("screen").then(function (l) {
        if (mine !== wakeToken) { try { l.release(); } catch (e) {} return; }      // 요청하는 사이에 이미 시험이 끝났으면 바로 반납
        wakeLock = l;
        if (l.addEventListener) l.addEventListener("release", function () { if (wakeLock === l) wakeLock = null; });
      }).catch(function () {});
    } catch (e) {}
  }
  function releaseWake() {
    wakeToken++;
    try { if (wakeLock) { wakeLock.release(); } } catch (e) {}
    wakeLock = null;
  }

  // ---------- 기타 이벤트 ----------
  [1, 2].forEach(function (slot) {
    $("slot" + slot).addEventListener("click", function () {
      var subject = loadSubjects()[slot];
      if (!subject) { openPicker(slot, "single"); return; }
      releaseHold();
      var btn = this;
      var go = function () {
        if (typeof acctExamLive === "function" && acctExamLive()) { otherDeviceNotice(); return; }
        holdSlot = btn; btn.classList.add("pressing");        // 확인 창이 떠 있는 동안 파란 테두리 유지
        ask(subject + " 실모를 응시하겠습니까?", "예", false, function () { start(slot); });
      };
      if (typeof pullExamState === "function") pullExamState().then(go, go); else go();       // 누르는 순간 서버에서 한 번 더 확인
    });
  });
  $("fs").addEventListener("click", function () {
    if (isFullscreen()) exitFullscreen(); else enterFullscreen();
  });
  $("toggleRemain").addEventListener("click", function () {
    showRemain = !showRemain;
    remainEl.classList.toggle("on", showRemain);
    this.textContent = showRemain ? "남은 시간 숨기기" : "남은 시간 보기";
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if ($("cropModal").classList.contains("on")) { closeCrop(); return; }
    if (modal.classList.contains("on")) { closeAsk(); return; }
    if (lateModal.classList.contains("on")) { closeLate(); return; }
    if (roomModal.classList.contains("on")) { closeRoomModal(); return; }
    if (profileKey) { closeProfile(); return; }
    if (picker.classList.contains("on")) { closePicker(); return; }
    if (stage.classList.contains("on") && phase === "running") askAbandon();
  });

  // 눌렀다는 느낌: 터치 화면에는 hover가 없으니, 누르는 동안(빠른 탭이어도 잠깐은) 윤곽이 파래지는 등으로 표시
  var PRESS_SEL = ".slot, .pill, .chip, .copt, .rf, .legend .item, .pen, .del, #recClear, #endBtn, #abandon, .primary, .rbtn, .sw, .leaveLink, .loginAnon, #accountOut, .roomSwitch, .roomOpt, .mem, .avPen, .pmItem, .pAct, .pAsk, .bubSend, .chatSend, .pSpy";
  document.addEventListener("pointerdown", function (e) {
    var t = e.target && e.target.closest ? e.target.closest(PRESS_SEL) : null;
    if (!t || t.disabled) return;
    var started = performance.now(), isSlot = t.classList.contains("slot");
    t.classList.add("pressing");
    var guard = setTimeout(function () {                // 손을 뗀 신호를 못 받아도 몇 초 뒤엔 반드시 풀림
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      if (holdSlot !== t) t.classList.remove("pressing");
    }, 6000);
    function release() {
      clearTimeout(guard);
      document.removeEventListener("pointerup", release, true);
      document.removeEventListener("pointercancel", release, true);
      if (isSlot) {                                  // 과목 카드: 확인 창이 열려 붙잡혀 있으면 그대로, 아니면 잠시 뒤 해제
        setTimeout(function () { if (holdSlot !== t) t.classList.remove("pressing"); }, 250);
        return;
      }
      setTimeout(function () { t.classList.remove("pressing"); }, Math.max(0, 160 - (performance.now() - started)));
    }
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
  }, true);

  checkNewDay(true);
  setInterval(function () { checkNewDay(false); }, 60000);
  setInterval(pollTick, 15000);
  // 앱이 화면에 보이는 동안에만 4초마다 "보는 중" 신호를 올림 (앱을 벗어나면 반복도 멈춤)
  var presenceTimer = 0, presenceBusy = false;
  function presenceTick() {
    if (!room || presenceBusy || document.visibilityState !== "visible") return;
    presenceBusy = true;
    enqueue(function () { return pushMe(false); }).then(function () { presenceBusy = false; }, function () { presenceBusy = false; });
  }
  function presenceSync() {
    if (document.visibilityState === "visible") { if (!presenceTimer) presenceTimer = setInterval(presenceTick, 4000); }
    else if (presenceTimer) { clearInterval(presenceTimer); presenceTimer = 0; }
  }
  presenceSync();
  setHands(12 * 3600);
  updateFsIcon();
  renderSlots();
  renderToday();
  restoreSession();                              // 시험 도중에 페이지가 다시 불러와졌다면 그 자리에서 이어서
  pollTick();
