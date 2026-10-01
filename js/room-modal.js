// [room-modal.js] 방 설정 창 (초대 코드, 프로필, 기타, 방 나가기)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 방 창
  var roomModal = $("roomModal"), nickInput = $("nickInput"), codeInput = $("codeInput"), nickEdit = $("nickEdit"), roomMsg = $("roomErrMsg");
  function setRoomMsg(text, bad) { roomMsg.textContent = text || ""; roomMsg.style.color = bad === false ? "#9aa0aa" : ""; }
  function openRoom() {
    setRoomMsg("");
    codeInput.value = ""; nickInput.value = "";
    $("roomJoinView").classList.toggle("hidden", !!room);
    $("roomInView").classList.toggle("hidden", !room);
    $("roomLeaveSec").classList.toggle("hidden", !room);
    if (room) { $("roomCodeShow").value = room.code; nickEdit.value = room.name; }
    refreshRoomPhoto();
    setSw($("shareToggle"), shareOn(), shareOn() ? "켜짐" : "꺼짐");
    $("pushLine").classList.toggle("hidden", !PUSH_URL); setSw($("pushToggle"), !!pushSub, pushLabel());
    roomModal.classList.add("on");
  }
  function closeRoomModal() { roomModal.classList.remove("on"); nickInput.blur(); codeInput.blur(); nickEdit.blur(); }
  function enterRoom(code, name, joining) {
    if (roomBusy) return;
    roomBusy = true;
    setRoomMsg(joining ? "입장하는 중…" : "방을 만드는 중…", false);
    var check = joining
      ? dbFetch("/rooms/" + code + "/members", { cache: "no-store" }).then(function (d) { if (!d || typeof d !== "object") throw new Error("noroom"); }).then(function () {
          return dbFetch("/rooms/" + code + "/meta/kicked/" + getDeviceId(), { cache: "no-store" }).then(function (v) { if (v === true) throw new Error("kicked"); }, function () {});
        })
      : Promise.resolve();
    check.then(function () {
      saveRoom({ code: code, name: name });
      lastSent = ""; others = []; netErr = false; liveBlocked = false; photoSent = ""; photoBlocked = false; photoCache = {}; photoBusy = {};
      hostId = ""; hostBlocked = false; metaBlocked = false; prevLive = {}; doneInfer = {}; closePenMenu();
      try { localStorage.setItem("examTimer.shareNotice.v1", "1"); } catch (e) {}
      return enqueue(function () { return pushMe(true); });
    }).then(function () {
      if (netErr) { saveRoom(null); throw new Error("net"); }
      roomBusy = false;
      closeRoomModal();
      setPhotoUse(code, photo ? "ask" : true);
      var hp = joining ? Promise.resolve() : enqueue(function () { return putHost(getDeviceId()); });     // 방을 만든 사람이 방장
      hp.then(pullOthers).then(function () { keepPageScroll(renderTogether); });
      keepPageScroll(renderTogether);
      askPhotoUse();
    }).catch(function (err) {
      roomBusy = false;
      var em = err && err.message;
      setRoomMsg(em === "noroom" ? "없는 방이에요. 코드를 다시 확인해 주세요." : em === "kicked" ? "방장이 내보낸 방이라 다시 들어갈 수 없어요." : "서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.");
    });
  }
  function cleanName(v) { return v.replace(/\s+/g, " ").trim().slice(0, 12); }
  $("roomBtn").addEventListener("click", openRoom);
  $("roomClose").addEventListener("click", closeRoomModal);
  roomModal.addEventListener("click", function (e) { if (e.target === roomModal) closeRoomModal(); });
  $("roomCreate").addEventListener("click", function () {
    var name = cleanName(nickInput.value);
    if (!name) { setRoomMsg("닉네임을 입력해 주세요."); nickInput.focus(); return; }
    enterRoom(rnd(8, CODE_CHARS), name, false);
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
  $("shareToggle").addEventListener("click", function () {
    var on = !shareOn();
    try { localStorage.setItem(SHARE_KEY, on ? "1" : "0"); } catch (e) {}
    setSw(this, on, on ? "켜짐" : "꺼짐");
    lastSent = ""; scheduleSync();
    setRoomMsg(on ? "친구들이 내 점수를 볼 수 있어요." : "친구들에게 내 점수가 보이지 않아요.", false);
  });
  $("photoChange").addEventListener("click", function () { $("photoInput").click(); });
  $("photoDel").addEventListener("click", function () { removePhoto(); });
  $("photoUseToggle").addEventListener("click", function () {
    if (!room) return;
    var code = room.code;
    if (photoUsable()) {                             // 이 방에서는 사진을 안 쓰기: 올려 둔 사진도 서버에서 지움
      setPhotoUse(code, false); photoSent = "";
      enqueue(function () { return dbFetch("/rooms/" + code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
      setRoomMsg("이 방에서는 사진이 보이지 않아요.", false);
    } else {
      setPhotoUse(code, true); photoSent = ""; photoBlocked = false;
      enqueue(function () { return pushPhoto(true); }).then(function () { keepPageScroll(renderTogether); });
      setRoomMsg("이 방에서 사진을 쓰기로 했어요.", false);
    }
    keepPageScroll(renderTogether);
  });
  var pushBusy = false;
  $("pushToggle").addEventListener("click", function () {
    var btn = this;
    if (!pushSupported()) { setRoomMsg("아이패드 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요.", false); return; }
    if (pushBusy) return;
    pushBusy = true;
    function done() { pushBusy = false; setSw(btn, !!pushSub, pushLabel()); }
    if (pushSub) {                                   // 스위치는 먼저 움직이고, 실제 처리는 뒤에서
      setSw(btn, false, "꺼짐");
      disablePush().then(function () { setRoomMsg("채팅 알림을 껐어요.", false); }).catch(function () {}).then(done);
      return;
    }
    setSw(btn, true, "켜짐");
    enablePush().then(function () { setRoomMsg("이제 앱이 닫혀 있어도 채팅 알림이 와요.", false); })
      .catch(function (err) { setRoomMsg(err && err.message === "denied" ? "알림이 허용되지 않았어요. 아이패드 설정 > 알림에서 허용해 주세요." : "알림을 켜지 못했어요. 잠시 뒤 다시 시도해 주세요."); })
      .then(done);
  });
  $("nickSave").addEventListener("click", function () {
    var name = cleanName(nickEdit.value);
    if (!name) { setRoomMsg("닉네임을 입력해 주세요."); return; }
    if (!room) return;
    saveRoom({ code: room.code, name: name });
    lastSent = "";
    scheduleSync();
    keepPageScroll(renderTogether);
    setRoomMsg("저장했어요.", false);
  });
  $("roomCopy").addEventListener("click", function () {
    var b = this, txt = room ? room.code.toUpperCase() : "";
    function done(ok) { b.textContent = ok ? "복사했어요" : "코드를 길게 눌러 복사하세요"; setTimeout(function () { b.textContent = "코드 복사"; }, 1800); }
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
      var code = room ? room.code : "", wasHost = isHost(), succ = others.length ? others[0] : null;
      closeAllChats("gone");
      saveRoom(null); others = []; hostId = ""; lastSent = ""; netErr = false;
      photoSent = ""; photoCache = {}; photoBusy = {};
      if (code && wasHost) {                         // 방장이 나가면 다음 사람에게 넘기고, 혼자였다면 방 정보를 정리
        if (succ) enqueue(function () { return dbFetch("/rooms/" + code + "/meta/host", { method: "PUT", headers: JSONH, body: JSON.stringify(succ.id) }).catch(function () {}); });
        else enqueue(function () { return dbFetch("/rooms/" + code + "/meta", { method: "DELETE" }).catch(function () {}); });
      }
      if (code) enqueue(function () { return dbFetch("/rooms/" + code + "/members/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
      if (code) enqueue(function () { return dbFetch("/rooms/" + code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
      if (code) enqueue(function () { return dbFetch("/rooms/" + code + "/msgs/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
      closeRoomModal();
      keepPageScroll(renderTogether);
    });
  });

