// [account.js] 로그인 계정: 방 목록을 계정에 저장·불러오기, 옛 방을 새 구조로 옮기기, 설정의 계정 칸
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var ROOMSYNC_KEY = "examTimer.roomsSynced.v1", roomListReady = false, roomListDirty = false, roomListBusy = false, roomListTimer = 0;
  function roomListPath() { return "/v2/users/" + getDeviceId() + "/rooms"; }
  function pushRoomList() {                          // 내 방 목록을 계정에 저장 (기기를 바꿔도 이어지게)
    return enqueue(function () {
      if (!fbAuth) return null;
      var map = {};
      rooms.forEach(function (r) { map[r.code] = { name: r.name }; if (r.label) map[r.code].label = r.label; });
      var req = rooms.length ? dbFetch(roomListPath(), { method: "PUT", headers: JSONH, body: JSON.stringify(map) }) : dbFetch(roomListPath(), { method: "DELETE" });
      return req.catch(function () {});
    });
  }
  function scheduleRoomListPush() {
    if (!USE_V2 || !fbAuth) return;
    if (!roomListReady) { roomListDirty = true; return; }       // 서버 목록을 먼저 받기 전에는 올리지 않음 (옛 목록으로 덮어쓰지 않게)
    clearTimeout(roomListTimer); roomListTimer = setTimeout(pushRoomList, 800);
  }
  function validSrvRoom(code, v) { return /^[a-z0-9]{6,12}$/.test(code) && !!v && typeof v === "object" && typeof v.name === "string" && !!v.name; }
  function pullRoomList() {
    return dbFetch(roomListPath(), { cache: "no-store" }).then(function (srv) {
      var me = getDeviceId(), synced = ""; try { synced = localStorage.getItem(ROOMSYNC_KEY) || ""; } catch (e) {}
      var map = (srv && typeof srv === "object") ? srv : {}, changed = false, activeGone = false, wasCode = room ? room.code : "";
      if (synced === me) {                           // 이 계정으로 이미 맞춘 적이 있으면 서버 목록이 기준 (다른 기기에서 나간 방은 여기서도 빠짐)
        for (var i = rooms.length - 1; i >= 0; i--) {
          var s = map[rooms[i].code];
          if (validSrvRoom(rooms[i].code, s)) {
            var nm = s.name.slice(0, 12), lb = (typeof s.label === "string" && s.label.trim()) ? s.label.trim().slice(0, 14) : undefined;
            if (rooms[i].name !== nm) { rooms[i].name = nm; changed = true; }
            if (rooms[i].label !== lb) { if (lb) rooms[i].label = lb; else delete rooms[i].label; changed = true; }
          } else { if (wasCode === rooms[i].code) activeGone = true; rooms.splice(i, 1); changed = true; }
        }
        Object.keys(map).forEach(function (code) {
          if (!roomByCode(code) && validSrvRoom(code, map[code]) && rooms.length < MAX_ROOMS) { var o = { code: code, name: map[code].name.slice(0, 12) }; if (typeof map[code].label === "string" && map[code].label.trim()) o.label = map[code].label.trim().slice(0, 14); rooms.push(o); changed = true; }
        });
      } else {                                       // 처음 연결: 이 기기의 방과 서버의 방을 합치고(이 기기 값 우선) 서버에 올림
        Object.keys(map).forEach(function (code) {
          if (!roomByCode(code) && validSrvRoom(code, map[code]) && rooms.length < MAX_ROOMS) { var o = { code: code, name: map[code].name.slice(0, 12) }; if (typeof map[code].label === "string" && map[code].label.trim()) o.label = map[code].label.trim().slice(0, 14); rooms.push(o); changed = true; }
        });
        roomListDirty = true;
        try { localStorage.setItem(ROOMSYNC_KEY, me); } catch (e) {}
      }
      if (changed) {
        saveRooms();
        if (activeGone || (!room && rooms.length)) activateRoom(rooms[0] || null);
        else persistRoom();
      }
    });
  }
  function ensureV2Rooms() {                         // 옛 구조의 방을 새 구조로 옮김: 옛 방장이 이 기기라면 새 방을 만들어 방장을 이어받음
    var me = getDeviceId(), jobs = [];
    rooms.slice().forEach(function (r) {
      jobs.push(enqueue(function () {
        return dbFetch(ROOMS_ROOT + r.code + "/meta", { cache: "no-store" }).then(function (m) {
          if (m) { roomPending[r.code] = false; return; }
          return dbFetch("/rooms/" + r.code + "/meta/host", { cache: "no-store" }).then(function (oldHost) {
            if (typeof oldHost === "string" && oldHost && oldHost === getLegacyDeviceId()) {
              return dbFetch(ROOMS_ROOT + r.code + "/meta", { method: "PUT", headers: JSONH, body: JSON.stringify({ host: me }) }).then(function () { roomPending[r.code] = false; });
            }
            roomPending[r.code] = true;
          }, function () { roomPending[r.code] = true; });
        }, function () {}).catch(function () {});
      }));
    });
    return Promise.all(jobs);
  }
  function startAccountSync() {
    if (!USE_V2 || !fbAuth || roomListBusy) return;
    roomListBusy = true;
    pullRoomList().then(function () {
      roomListReady = true;
      if (roomListDirty) { roomListDirty = false; return pushRoomList(); }
    }, function () { roomListReady = false; })
      .then(function () { return roomListReady ? ensureV2Rooms() : null; })
      .then(function () {
        roomListBusy = false;
        if (!roomListReady) return;
        accountReady = true;
        renderRoomSwitch(); keepPageScroll(renderTogether);
        if (room) afterSwitch(); else syncOtherRooms(true);
      }, function () { roomListBusy = false; });
  }
  // ---- 설정 창의 계정 칸 ----
  var accountLinkDrawn = false, accountLinkFrom = "";
  function renderAccount() {
    var sec = $("accountSec"); if (!sec) return;
    sec.classList.toggle("hidden", !(USE_V2 && fbAuth));
    if (!(USE_V2 && fbAuth)) return;
    var anon = fbAuth.kind === "anon";
    $("accountKind").textContent = anon ? "이 기기에서만 쓰는 중" : "구글 계정으로 로그인됨";
    $("accountLink").classList.toggle("hidden", !anon);
    if (anon && !accountLinkDrawn) {                 // 이 기기에서만 쓰던 계정에 구글을 연결 (방과 방장 권한은 그대로 이어짐)
      accountLinkDrawn = true; accountLinkFrom = fbAuth.uid;
      authRenderGoogleButton($("accountGoogle"), function () {
        accountLinkDrawn = false;
        if (fbAuth.uid !== accountLinkFrom) {          // 이미 쓰던 구글 계정이라 그 계정으로 전환됨 → 새 계정 기준으로 다시 시작
          try { sessionStorage.setItem("examTimer.acctSwitched", "1"); } catch (e) {}
          location.reload(); return;
        }
        renderAccount(); setRoomMsg("구글 계정에 연결했어요.", false);
      }, function (e) { setRoomMsg(authErrorText(e)); });
    }
  }
  $("accountOut").addEventListener("click", function () {
    var anon = fbAuth && fbAuth.kind === "anon";
    ask(anon ? "로그아웃하면 이 계정의 방을 다시 찾을 수 없어요.\n구글 계정에 먼저 연결해 두는 걸 추천해요.\n그래도 로그아웃할까요?" : "로그아웃할까요?\n다시 구글로 로그인하면 방 목록이 돌아와요.", "로그아웃", true, function () {
      authSignOut();
      location.reload();
    });
  });
  try {
    if (sessionStorage.getItem("examTimer.acctSwitched")) {
      sessionStorage.removeItem("examTimer.acctSwitched");
      setTimeout(function () { notice("이미 쓰던 구글 계정이라 그 계정으로 전환했어요.\n이 기기에서만 쓰던 계정의 방은 옮겨지지 않아요."); }, 900);
    }
  } catch (e) {}
  if (USE_V2 && fbAuth) startAccountSync();
