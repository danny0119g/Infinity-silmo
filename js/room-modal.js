// [room-modal.js] 방 설정 창 (초대 코드, 프로필, 기타, 방 나가기)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 방 창
  var roomModal = $("roomModal"), nickInput = $("nickInput"), codeInput = $("codeInput"), nickEdit = $("nickEdit"), roomMsg = $("roomErrMsg");
  function setRoomMsg(text, bad) {
    roomMsg.textContent = text || ""; roomMsg.style.color = bad === false ? "#9aa0aa" : "";
    if (text && roomMsg.scrollIntoView) roomMsg.scrollIntoView({ block: "nearest" });       // 아래쪽에 있는 안내가 화면 밖이면 보이게
  }
  // 설정 창: 방이 있으면 방 설정(이름·초대 코드·프로필·기타) + 방 만들기·입장 + 계정(+방 나가기), 방이 없으면 방 만들기·입장(펼침) + 계정
  var addOpen = false;
  function setAddOpen(on) {                          // 방 만들기·입장 칸을 펼치거나 접음. 펼치면 버튼이 "닫기"로 바뀜
    addOpen = on;
    var has = !!room, full = rooms.length >= MAX_ROOMS, t = $("roomAddToggle");
    $("roomJoinView").classList.toggle("hidden", !on);
    t.classList.toggle("hidden", !has && on);        // 방이 없으면 항상 펼쳐 둠(닫을 필요 없음)
    t.textContent = on ? "닫기" : (full ? "방은 최대 " + MAX_ROOMS + "개예요" : "+ 새 방 만들기 · 입장");
    t.disabled = full && !on;
  }
  function openRoom(mode) {                          // mode "add": 방 만들기·입장 칸을 펼친 채로 열기
    var has = !!room, full = rooms.length >= MAX_ROOMS;
    closeRoomMenu();
    setRoomMsg("");
    codeInput.value = ""; nickInput.value = ""; $("newTitleInput").value = "";
    $("roomInView").classList.toggle("hidden", !has);
    $("roomLeaveSec").classList.toggle("hidden", !has);
    $("profileGroup").classList.toggle("hidden", !has);
    renderThemeSeg();
    if (!has) $("pushLine").classList.add("hidden");
    renderAskSeg();
    if (has) { $("roomCodeShow").value = room.code; nickEdit.value = room.name; $("labelEdit").value = roomLabel(room); }
    setAddOpen(!full && (mode === "add" || !has));      // 방이 없으면 항상 펼쳐 둠
    if (has) {
      refreshRoomPhoto();
      setSw($("shareToggle"), shareOn(), shareOn() ? "켜짐" : "꺼짐");
      $("pushLine").classList.toggle("hidden", !PUSH_URL); setSw($("pushToggle"), chatPushOn(), pushLabel());
      applyLabelPerm();
    }
    roomModal.classList.add("on");
    renderAccount();                                 // 창이 보이는 상태에서 계정 칸(구글 연결 버튼 포함)을 그림
  }
  $("roomAddToggle").addEventListener("click", function () {
    if (addOpen) { setAddOpen(false); return; }
    setAddOpen(true); $("newTitleInput").focus(); setTimeout(function () { $("roomJoinView").scrollIntoView({ block: "nearest" }); }, 0);
  });
  function closeRoomModal() { closePenMenu(); roomModal.classList.remove("on"); nickInput.blur(); codeInput.blur(); nickEdit.blur(); }
  function enterRoom(code, name, joining, title) {
    if (roomBusy) return;
    var had = roomByCode(code), hadName = had ? had.name : "", prev = room, joinTitle = "", newTitle = (!joining && !had) ? cleanTitle(title) : "", newLabel = had ? "" : (newTitle || defaultLabel());
    if (!had && rooms.length >= MAX_ROOMS) { setRoomMsg("방은 최대 " + MAX_ROOMS + "개까지 들어갈 수 있어요."); return; }
    roomBusy = true;
    setRoomMsg(joining ? "입장하는 중…" : "방을 만드는 중…", false);
    var me = getDeviceId(), check;
    if (USE_V2) {                                    // 새 구조: 입장은 방 정보(meta) 확인, 만들기는 meta부터 만들어야 함(규칙이 방이 있어야 멤버로 쓰게 함)
      check = joining
        ? dbFetch(ROOMS_ROOT + code + "/meta", { cache: "no-store" }).then(function (m) {
            if (!m || typeof m !== "object" || typeof m.host !== "string") throw new Error("noroom");
            if (m.kicked && m.kicked[me] === true) throw new Error("kicked");
            if (typeof m.title === "string") joinTitle = m.title;
          })
        : putMetaCreate(code, me, newLabel);
    } else {
      check = joining
        ? dbFetch(ROOMS_ROOT + code + "/members", { cache: "no-store" }).then(function (d) { if (!d || typeof d !== "object") throw new Error("noroom"); }).then(function () {
            return dbFetch(ROOMS_ROOT + code + "/meta/kicked/" + me, { cache: "no-store" }).then(function (v) { if (v === true) throw new Error("kicked"); }, function () {});
          })
        : Promise.resolve();
    }
    function rollback() {                            // 서버에 연결하지 못하면 방 목록과 보던 방을 원래대로 돌림
      if (had) had.name = hadName; else rooms = rooms.filter(function (r) { return r.code !== code; });
      saveRooms();
      if (prev) { if (!room || room.code !== prev.code) activateRoom(prev); } else if (room) activateRoom(null);
      renderRoomSwitch();
    }
    check.then(function () {
      var r = addRoom(code, name);
      if (newTitle) { r.label = newTitle; saveRooms(); }
      if (joinTitle) applyTitle(r, joinTitle);          // 입장하면 방 친구들이 쓰는 방 이름으로 보임
      activateRoom(r);
      try { localStorage.setItem("examTimer.shareNotice.v1", "1"); } catch (e) {}
      return enqueue(function () { return pushMe(true); });
    }).then(function () {
      if (netErr) { rollback(); throw new Error("net"); }
      roomBusy = false;
      closeRoomModal();
      if (!had) setPhotoUse(code, photo ? "ask" : true);
      var hp = (joining || USE_V2) ? Promise.resolve() : enqueue(function () { return putHost(getDeviceId()); });     // 방을 만든 사람이 방장
      hp.then(pullOthers).then(function () { renderRoomSwitch(); keepPageScroll(renderTogether); });
      renderRoomSwitch();
      keepPageScroll(renderTogether);
      askPhotoUse();
      syncOtherRooms(true);
    }).catch(function (err) {
      roomBusy = false;
      var em = err && err.message;
      if (em !== "net") rollbackIfNeeded();
      setRoomMsg(em === "noroom" ? "없는 방이에요. 코드를 다시 확인해 주세요." : em === "kicked" ? "방장이 내보낸 방이라 다시 들어갈 수 없어요." : "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
    function rollbackIfNeeded() { if (!had && roomByCode(code) && room && room.code === code) rollback(); }   // 확인 단계에서 실패하면 아직 아무것도 바뀌지 않았으므로 보통은 아무 일도 안 함
  }
  function cleanName(v) { return v.replace(/\s+/g, " ").trim().slice(0, 12); }
  $("roomBtn").addEventListener("click", function () { openRoom(); });
  $("roomClose").addEventListener("click", closeRoomModal);
  roomModal.addEventListener("click", function (e) { if (e.target === roomModal) closeRoomModal(); });
  $("roomCreate").addEventListener("click", function () {
    var name = cleanName(nickInput.value);
    if (!name) { setRoomMsg("닉네임을 입력해 주세요."); nickInput.focus(); return; }
    enterRoom(rnd(8, CODE_CHARS), name, false, $("newTitleInput").value);
  });
  function joinNow() {
    var name = cleanName(nickInput.value), code = codeInput.value.trim();
    if (!name) { setRoomMsg("닉네임을 입력해 주세요."); nickInput.focus(); return; }
    if (!/^[a-z0-9]{6,12}$/.test(code)) { setRoomMsg("초대 코드를 확인해 주세요."); codeInput.focus(); return; }
    enterRoom(code, name, true);
  }
  $("roomJoin").addEventListener("click", joinNow);
  codeInput.addEventListener("keydown", function (e) { if (e.key === "Enter") joinNow(); });
  codeInput.addEventListener("input", function () { codeInput.value = codeInput.value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12); setRoomMsg(""); });
  nickInput.addEventListener("input", function () { setRoomMsg(""); });
  var THEME_ORDER = ["system", "light", "dark"];
  var syncThemeSw = makeSlideSwitch($("themeSeg"), 3, function () { return THEME_ORDER.indexOf(themePref()); }, function (i) { setTheme(THEME_ORDER[i]); themeRedraw(true); });
  function renderThemeSeg() { syncThemeSw(); }
  function themeRedraw(fromSwitch) {                 // 화면 색이 바뀐 뒤: 그래프·목록을 새 색으로 다시 그림, 구글 로그인 버튼도 새 색으로
    renderThemeSeg();
    keepPageScroll(function () { renderToday(); renderTogether(); });
    if (typeof renderAccount === "function") { accountLinkDrawn = false; renderAccount(); }
  }
  $("shareToggle").addEventListener("click", function () {
    if (!room) return;
    var on = !shareOn();
    setShareOn(room.code, on);
    setSw(this, on, on ? "켜짐" : "꺼짐");
    delete lastSentBy[room.code]; scheduleSync();
    setRoomMsg(on ? "이 방 친구들이 내 점수를 볼 수 있어요." : "이 방 친구들에게 내 점수가 보이지 않아요.", false);
  });
  $("photoChange").addEventListener("click", function (e) {      // 펜 아이콘: 프로필 사진 수정 / 삭제 메뉴
    e.stopPropagation();
    if (penMenuOpen) closePenMenu(); else { penMenuOpen = true; buildPenMenu(this.parentNode); }
  });
  roomModal.addEventListener("click", function (e) { if (penMenuOpen && !(e.target.closest && e.target.closest(".penMenu, .avPen"))) closePenMenu(); });
  $("photoUseToggle").addEventListener("click", function () {
    if (!room) return;
    var code = room.code;
    if (photoUsable()) {                             // 이 방에서는 사진을 안 쓰기: 올려 둔 사진도 서버에서 지움
      setPhotoUse(code, false); photoSentBy = {};
      enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
      setRoomMsg("이 방에서는 사진이 보이지 않아요.", false);
    } else {
      setPhotoUse(code, true); photoSentBy = {}; photoBlocked = false;
      enqueue(function () { return pushPhoto(true); }).then(function () { keepPageScroll(renderTogether); });
      setRoomMsg("이 방에서 사진을 쓰기로 했어요.", false);
    }
    keepPageScroll(renderTogether);
  });
  var pushBusy = false;
  function ringBell() { var pl = $("pushLine"); pl.classList.remove("ring"); void pl.offsetWidth; pl.classList.add("ring"); setTimeout(function () { pl.classList.remove("ring"); }, 1500); }
  $("pushToggle").addEventListener("click", function () {
    var btn = this;
    if (!pushSupported()) { setRoomMsg("홈 화면에 추가한 앱에서만 알림을 켤 수 있어요.", false); return; }
    if (pushBusy) return;
    pushBusy = true;
    function done() { pushBusy = false; setSw(btn, chatPushOn(), pushLabel()); }
    if (chatPushOn()) {                              // 채팅·점수 답장 알림만 끔 (다른 알림이 켜져 있으면 알림 허용은 그대로 둠)
      setPushChat(false); setSw(btn, false, "꺼짐");
      setRoomMsg("채팅 알림을 껐어요.", false); done();
      return;
    }
    setSw(btn, true, "켜짐");
    hapticTap(); ringBell();                         // 켤 때 톡 하는 햅틱 + 종이 한 번 울림
    var p = pushSub ? (setPushChat(true), Promise.resolve()) : ensurePush(true);
    p.then(function () { setRoomMsg("이제 앱이 닫혀 있어도 채팅 알림이 와요.", false); })
      .catch(function (err) { setRoomMsg(err && err.message === "denied" ? "알림이 허용되지 않았어요. 기기 설정 > 알림에서 허용해 주세요." : "알림을 켜지 못했어요. 잠시 뒤 다시 시도해 주세요."); })
      .then(done);
  });
  var syncAskSw = makeSlideSwitch($("askSeg"), 3, function () { return ASK_ORDER.indexOf(askMode()); }, function (i) {
    var mode = ASK_ORDER[i];
    if (mode === "on" && pushSupported() && !pushSub) {          // 알림을 처음 켜는 경우: 허용부터 받음 (채팅 알림은 켜지 않음)
      setAskMode("on");
      ensurePush(false).catch(function (err) { setAskMode("mute"); renderAskSeg(); setRoomMsg(err && err.message === "denied" ? "알림이 허용되지 않았어요. 기기 설정 > 알림에서 허용해 주세요." : "알림을 켜지 못했어요."); });
    } else setAskMode(mode);
    setRoomMsg(mode === "on" ? "누가 점수를 물어보면 알림이 와요." : mode === "mute" ? "점수 질문은 받되 알림은 오지 않아요." : "이제 아무도 나에게 점수를 물어볼 수 없어요.", false);
  });
  function renderAskSeg() { syncAskSw(); }
  $("nickSave").addEventListener("click", function () {
    var name = cleanName(nickEdit.value);
    if (!name) { setRoomMsg("닉네임을 입력해 주세요."); return; }
    if (!room) return;
    room.name = name; persistRoom();
    lastSentBy = {};
    scheduleSync();
    renderRoomSwitch();
    keepPageScroll(renderTogether);
    setRoomMsg("저장했어요.", false);
  });
  $("roomCopy").addEventListener("click", function () {
    var b = this, txt = room ? room.code.toUpperCase() : "";
    function done(ok) { b.textContent = ok ? "복사했어요" : "코드를 길게 눌러 복사하세요"; setTimeout(function () { b.textContent = "복사"; }, 1800); }
    function fallback() {
      var inp = $("roomCodeShow"), ok = false;
      inp.focus(); inp.select();
      try { ok = document.execCommand("copy"); } catch (e) {}
      done(ok);
    }
    try { navigator.clipboard.writeText(txt).then(function () { done(true); }, fallback); } catch (e) { fallback(); }
  });
  $("roomLeave").addEventListener("click", function () {
    ask("방에서 나가겠습니까?\n서버에 있는 내 기록도 지워져요.", "나가기", true, function () {
      if (!room) return;
      var code = room.code, wasHost = isHost(), succ = others.length ? others[0] : null;
      closeAllChats("gone");
      if (wasHost) {                                 // 방장이 나가면 다음 사람에게 넘기고, 혼자였다면 방 정보를 정리
        if (succ) enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/meta/host", { method: "PUT", headers: JSONH, body: JSON.stringify(succ.id) }).catch(function () {}); });
        else enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/meta", { method: "DELETE" }).catch(function () {}); });
      }
      dropRoom(code);                                // 내 기록 지우기 + 남은 방이 있으면 그 방으로 이동
      closeRoomModal();
    });
  });
  // 방 이름 (이 기기에서만 보임)
  function applyLabelPerm() {                      // 방 이름은 방장만 바꿀 수 있음
    var ok = !USE_V2 || isHost();
    $("labelEdit").readOnly = !ok; $("labelEdit").classList.toggle("ro", !ok);
    $("labelSave").classList.toggle("hidden", !ok);
  }
  $("labelSave").addEventListener("click", function () {
    if (!room || (USE_V2 && !isHost())) return;
    var v = cleanTitle($("labelEdit").value);
    if (!v) { setRoomMsg("방 이름을 입력해 주세요."); return; }
    room.label = v;
    persistRoom(); renderRoomSwitch();
    $("labelEdit").value = roomLabel(room);
    if (!USE_V2) { setRoomMsg("저장했어요.", false); return; }
    var code = room.code;
    enqueue(function () { return putTitle(code, v); }).then(function (ok) {      // 방 이름은 방 친구들 모두에게 보임
      if (ok) { setRoomMsg("방 이름을 바꿨어요. 방 친구들에게도 보여요.", false); }
      else { setRoomMsg("이 기기에만 저장했어요. (서버 규칙을 업데이트해야 친구들에게도 보여요)"); }
    });
  });
  // ---------- 방 전환 메뉴 (방 이름을 누르면 펼쳐짐) ----------
  var CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function closeRoomMenu() { var m = $("roomMenu"); if (!m) return; m.classList.remove("on"); $("roomSwitch").setAttribute("aria-expanded", "false"); }
  function renderRoomMenu() {
    var m = $("roomMenu"); m.textContent = "";
    rooms.forEach(function (r) {
      var cur = !!room && room.code === r.code, b = el("button", "roomOpt" + (cur ? " cur" : ""));
      b.type = "button"; b.setAttribute("role", "option"); b.setAttribute("aria-selected", cur ? "true" : "false");
      var t = el("span", "roText"), cn = chatCountFor(r.code); t.appendChild(el("span", "roName", roomLabel(r))); t.appendChild(el("span", "roSub", "내 닉네임 " + r.name + (cn ? " · 대화 중 " + cn : "")));
      b.appendChild(t);
      if (cur) { var ck = el("span", "roCheck"); ck.innerHTML = CHECK_SVG; b.appendChild(ck); }
      b.addEventListener("click", function (e) { e.stopPropagation(); closeRoomMenu(); switchRoom(r.code); });
      m.appendChild(b);
    });
  }
  function openRoomMenu() {
    var m = $("roomMenu"), b = $("roomSwitch");
    renderRoomMenu();
    m.classList.add("on");
    var r = b.getBoundingClientRect(), w = m.offsetWidth, x = Math.min(Math.max(8, r.left), window.innerWidth - w - 8);
    m.style.left = Math.round(x) + "px"; m.style.top = Math.round(r.bottom + 6) + "px";
    b.setAttribute("aria-expanded", "true");
  }
  function renderRoomSwitch() {                      // 방이 있으면 제목 자리에 "방 이름 ▾" 버튼, 없으면 기본 제목
    var has = rooms.length > 0;
    $("togetherTitle").classList.toggle("hidden", has);
    $("roomSwitchWrap").classList.toggle("hidden", !has);
    if (has && room) $("roomSwitchLabel").textContent = roomLabel(room);
    if (!has) closeRoomMenu();
    else if ($("roomMenu").classList.contains("on")) renderRoomMenu();
  }
  $("roomSwitch").addEventListener("click", function (e) { e.stopPropagation(); if ($("roomMenu").classList.contains("on")) closeRoomMenu(); else openRoomMenu(); });
  document.addEventListener("click", function (e) { var t = e.target; if (t && t.closest && t.closest("#roomMenu, #roomSwitch")) return; closeRoomMenu(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeRoomMenu(); });
  window.addEventListener("resize", closeRoomMenu);
  home.addEventListener("scroll", closeRoomMenu, { passive: true });
  renderRoomSwitch();
