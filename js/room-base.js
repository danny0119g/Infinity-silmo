// [room-base.js] 함께 응시(방) 기본: 방 저장, 기기 ID, 내 상태 만들기
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 함께 응시 (초대 코드 방) ----------
  // 서버(Firebase Realtime Database)에는 닉네임·오늘 날짜·과목별 응시 횟수만 올라간다. 점수와 시간은 이 기기에만 남는다.
  var DB_URL = "https://infinitesilmo-default-rtdb.asia-southeast1.firebasedatabase.app";
  var ROOM_KEY = "examTimer.room.v1", DEV_KEY = "examTimer.device.v1";
  var ROOMS_ROOT = USE_V2 ? "/v2/rooms/" : "/rooms/";        // 서버에서 방 데이터가 있는 자리 (새 구조는 v2 아래)
  var CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
  var liveBlocked = false, photoSentBy = {}, photoBlocked = false, photoCache = {}, profileM = null;
  var hostId = "", hostBlocked = false, metaBlocked = false, penMenuOpen = false, crop = null, JSONH = { "Content-Type": "application/json" };
  var inbox = [], asked = {}, bubbles = {}, msgBlocked = false, dismissedMsg = {}, prevLive = {}, doneInfer = {}, chats = {}, lastLis = {}, invites = [], chatBlocked = false, chatClosedAt = {}, askMeta = {};
  // 방금 끝낸 시험 (끝난 뒤 5분 동안 친구들이 "점수 물어보기"를 할 수 있게, 응시 상태에 e:2 로 함께 올림)
  var DONE_KEY = "examTimer.done.v1";
  function loadDone() { try { var d = JSON.parse(localStorage.getItem(DONE_KEY)); if (d && typeof d.s === "string" && typeof d.t === "number") return d; } catch (e) {} return null; }
  var lastDone = loadDone();
  // 질문이 마무리된 기록 (상대가 거절했거나 이미 답했음): 그 사람이 다음 시험을 끝내기 전까지 점수 물어보기를 막음
  var RES_KEY = "examTimer.resolved.v1";
  var DECLINE_X = "__decline__";                      // 거절은 "답장"의 특별한 글자로 보냄 → 서버 규칙을 새로 바꾸지 않아도 동작
  function loadResolved() {
    var r = {};
    try {
      var o = JSON.parse(localStorage.getItem(RES_KEY));
      if (o && typeof o === "object") Object.keys(o).forEach(function (k) {
        var v = o[k];
        if (v && typeof v.t === "number" && (v.k === "decline" || v.k === "reply") && Date.now() / 1000 - v.t < 86400) r[k] = v;
      });
    } catch (e) {}
    return r;
  }
  var resolved = loadResolved();
  function markResolved(peer, t, k) {
    var o = resolved[peer];
    if (o && o.t >= t) return;
    resolved[peer] = { t: t, k: k };
    try { localStorage.setItem(RES_KEY, JSON.stringify(resolved)); } catch (e) {}
  }
  function askBlocked(m) { var r = resolved[m.id]; return !!(r && m.live && m.live.t <= r.t); }
  function markDone() {
    if (!current) return;
    lastDone = { s: String(current.subject).slice(0, 30), t: Math.floor(Date.now() / 1000) };
    try { localStorage.setItem(DONE_KEY, JSON.stringify(lastDone)); } catch (e) {}
  }
  var memRoom = null, deviceId = "", others = [], netErr = false, lastSentBy = {}, syncTimer = 0, netChain = Promise.resolve(), roomBusy = false;
  function rnd(n, chars) {
    var a = new Uint32Array(n), out = "", i;
    try { crypto.getRandomValues(a); } catch (e) { for (i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 4294967296); }
    for (i = 0; i < n; i++) out += chars.charAt(a[i] % chars.length);
    return out;
  }
  function getDeviceId() { return USE_V2 ? (fbAuth ? fbAuth.uid : "") : getLegacyDeviceId(); }     // 새 구조에서는 로그인한 계정 ID가 내 ID
  function getLegacyDeviceId() {                     // 예전 기기 ID (옛 방의 방장 확인에만 씀)
    if (deviceId) return deviceId;
    try { deviceId = localStorage.getItem(DEV_KEY) || ""; } catch (e) {}
    if (!/^[a-z0-9]{10,20}$/.test(deviceId)) {
      deviceId = rnd(16, "abcdefghijklmnopqrstuvwxyz0123456789");
      try { localStorage.setItem(DEV_KEY, deviceId); } catch (e) {}
    }
    return deviceId;
  }
  // ---------- 여러 방 ----------
  // rooms: 들어간 방 목록 [{code, name(이 방에서의 내 닉네임), label(방 이름: 이 기기에서만 보임)}]
  // room : 지금 보고 있는 방 (rooms 안의 한 항목). 화면·15초 확인·채팅은 이 방 하나만 보고, 내 상태와 알림 주소는 모든 방에 올림.
  var CHATS_KEY_NAME = "examTimer.chats.v1";
  var ROOMS_KEY = "examTimer.rooms.v1", SHAREROOMS_KEY = "examTimer.shareRooms.v1", MAX_ROOMS = 8, DEFAULT_LABEL = "무수한 실모단";
  function validRoomObj(r) { return !!r && typeof r.code === "string" && /^[a-z0-9]{6,12}$/.test(r.code) && typeof r.name === "string" && !!r.name; }
  function cleanRoomObj(r) { var o = { code: r.code, name: r.name.slice(0, 12) }; if (typeof r.label === "string" && r.label.trim()) o.label = r.label.trim().slice(0, 14); return o; }
  function loadRooms() {
    var list = [], seen = {}, o = null, legacy = false;
    try { o = JSON.parse(localStorage.getItem(ROOMS_KEY)); } catch (e) {}
    if (o && typeof o.forEach === "function") o.forEach(function (r) { if (validRoomObj(r) && !seen[r.code] && list.length < MAX_ROOMS) { seen[r.code] = 1; list.push(cleanRoomObj(r)); } });
    if (USE_V2 && fbAuth) {                           // 다른 계정이 쓰던 기기면 그 계정의 방 목록을 이어받지 않음
      var owner = ""; try { owner = localStorage.getItem("examTimer.roomsOwner.v1") || ""; } catch (e) {}
      if (owner && owner !== fbAuth.uid) { try { localStorage.removeItem(ROOMS_KEY); localStorage.removeItem(ROOM_KEY); localStorage.removeItem(CHATS_KEY_NAME); localStorage.removeItem("examTimer.roomsSynced.v1"); } catch (e) {} return []; }
      if (!owner) { try { localStorage.setItem("examTimer.roomsOwner.v1", fbAuth.uid); } catch (e) {} }
    }
    if (!list.length) {                               // 방 하나만 쓰던 예전 저장 형식에서 이어받기 (그때의 점수 공개 설정도 그 방으로 옮김)
      var old = null; try { old = JSON.parse(localStorage.getItem(ROOM_KEY)); } catch (e) {}
      if (validRoomObj(old)) {
        list.push(cleanRoomObj(old));
        try { if (localStorage.getItem("examTimer.share.v1") === "0") { var m = {}; m[old.code] = false; localStorage.setItem(SHAREROOMS_KEY, JSON.stringify(m)); } } catch (e) {}
      }
    }
    return list;
  }
  var rooms = loadRooms();
  function saveRooms() { try { localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms)); } catch (e) {} if (USE_V2 && typeof scheduleRoomListPush === "function") scheduleRoomListPush(); }
  function roomByCode(code) { for (var i = 0; i < rooms.length; i++) if (rooms[i].code === code) return rooms[i]; return null; }
  function roomLabel(r) { return (r && r.label) || DEFAULT_LABEL; }
  function loadRoom() {                              // 마지막으로 보던 방 (예전 버전과 호환되게 ROOM_KEY에는 보던 방의 코드·닉네임을 계속 저장)
    var o = null; try { o = JSON.parse(localStorage.getItem(ROOM_KEY)); } catch (e) {}
    return (o && roomByCode(o.code)) || rooms[0] || null;
  }
  var room = loadRoom();
  function persistRoom() {
    saveRooms();
    try { if (room) localStorage.setItem(ROOM_KEY, JSON.stringify({ code: room.code, name: room.name })); else localStorage.removeItem(ROOM_KEY); } catch (e) {}
  }
  function defaultLabel() {                          // 새 방의 기본 이름: 무수한 실모단, 방 2, 방 3 …
    var used = {}; rooms.forEach(function (r) { used[roomLabel(r)] = 1; });
    if (!used[DEFAULT_LABEL]) return DEFAULT_LABEL;
    for (var n = 2; n <= MAX_ROOMS + 1; n++) if (!used["방 " + n]) return "방 " + n;
    return "방";
  }
  function addRoom(code, name) {                     // 목록에 넣고(이미 있으면 닉네임만 바꾸고) 그 항목을 돌려줌
    var r = roomByCode(code);
    if (r) r.name = name; else { r = { code: code, name: name, label: defaultLabel() }; rooms.push(r); }
    saveRooms();
    return r;
  }
  function resetRoomState() {                        // 방을 바꿀 때 이전 방의 흔적을 전부 비움 (다른 방 친구·사진·대화가 섞이지 않게)
    destroyAllChats(); closeProfile(); closePenMenu(); syncBubbles({});
    others = []; hostId = ""; netErr = false; liveBlocked = false; photoBlocked = false; photoCache = {}; photoBusy = {};
    hostBlocked = false; metaBlocked = false; msgBlocked = false; chatBlocked = false;
    prevLive = {}; doneInfer = {}; inbox = []; invites = []; asked = {}; dismissedMsg = {}; chatClosedAt = {}; askMeta = {}; lastLis = {};
    pulled = false; pendingRestore = {};
  }
  function activateRoom(r) {                         // 보는 방을 바꿈 (r이 null이면 방 없음)
    if ((room && r && room.code === r.code) || (!room && !r)) return;
    resetRoomState();                                // 이전 방이 아직 설정된 상태에서 정리해야 채팅 저장 등이 이전 방 기준으로 끝남
    room = r || null;
    persistRoom();
    saveChats();
  }
  // 점수 공개 여부는 방마다 따로 (기본: 켜짐)
  function shareOn(code) {
    code = code || (room && room.code);
    try { var m = JSON.parse(localStorage.getItem(SHAREROOMS_KEY)); if (code && m && typeof m === "object" && typeof m[code] === "boolean") return m[code]; } catch (e) {}
    return true;
  }
  function setShareOn(code, on) {
    var m = {}; try { m = JSON.parse(localStorage.getItem(SHAREROOMS_KEY)) || {}; } catch (e) {}
    m[code] = !!on; try { localStorage.setItem(SHAREROOMS_KEY, JSON.stringify(m)); } catch (e) {}
  }
  function countsOf(all) {
    var m = {}, order = [];
    all.forEach(function (r) {
      var sname = recSubject(r);
      if (m[sname] == null) { m[sname] = 0; order.push(sname); }
      m[sname]++;
    });
    return order.map(function (k) { return { name: k, count: m[k] }; });
  }
  // 과목별 점수 목록을 "~과목|38,44:46,-,40" 꼴의 이름으로 만듦 (본점수[:호머식], 미입력은 -)
  function scoreMap() {                              // 새 구조: { 과목: "38,44:46,-" }
    var by = {}, out = {};
    loadAll().forEach(function (r) {
      var sj = recSubject(r).replace(/[.$#\[\]\/|~,]/g, "").slice(0, 30);
      if (!sj) return;
      if (!by[sj]) by[sj] = [];
      var a = (r.score1 != null) ? String(r.score1) : "-";
      if (r.usedExtra && r.score2 != null) a += ":" + r.score2;
      by[sj].push(a);
    });
    Object.keys(by).forEach(function (sj) { out[sj] = by[sj].slice(-30).join(","); });
    return out;
  }
  function scoreKeys() {
    var by = {}, order = [];
    loadAll().forEach(function (r) {
      var sj = recSubject(r).replace(/[.$#\[\]\/|~,]/g, "").slice(0, 30);
      if (!sj) return;
      if (!by[sj]) { by[sj] = []; order.push(sj); }
      var a = (r.score1 != null) ? String(r.score1) : "-";
      if (r.usedExtra && r.score2 != null) a += ":" + r.score2;
      by[sj].push(a);
    });
    return order.map(function (sj) { return "~" + sj + "|" + by[sj].slice(-30).join(","); });
  }
