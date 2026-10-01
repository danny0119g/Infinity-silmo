// [room-base.js] 함께 응시(방) 기본: 방 저장, 기기 ID, 내 상태 만들기
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 함께 응시 (초대 코드 방) ----------
  // 서버(Firebase Realtime Database)에는 닉네임·오늘 날짜·과목별 응시 횟수만 올라간다. 점수와 시간은 이 기기에만 남는다.
  var DB_URL = "https://infinitesilmo-default-rtdb.asia-southeast1.firebasedatabase.app";
  var ROOM_KEY = "examTimer.room.v1", DEV_KEY = "examTimer.device.v1";
  var CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
  var liveBlocked = false, photoSent = "", photoBlocked = false, photoCache = {}, profileM = null;
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
  var memRoom = null, deviceId = "", others = [], netErr = false, lastSent = "", syncTimer = 0, netChain = Promise.resolve(), roomBusy = false;
  function rnd(n, chars) {
    var a = new Uint32Array(n), out = "", i;
    try { crypto.getRandomValues(a); } catch (e) { for (i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 4294967296); }
    for (i = 0; i < n; i++) out += chars.charAt(a[i] % chars.length);
    return out;
  }
  function getDeviceId() {
    if (deviceId) return deviceId;
    try { deviceId = localStorage.getItem(DEV_KEY) || ""; } catch (e) {}
    if (!/^[a-z0-9]{10,20}$/.test(deviceId)) {
      deviceId = rnd(16, "abcdefghijklmnopqrstuvwxyz0123456789");
      try { localStorage.setItem(DEV_KEY, deviceId); } catch (e) {}
    }
    return deviceId;
  }
  function loadRoom() {
    var r = null;
    try { r = JSON.parse(localStorage.getItem(ROOM_KEY)); } catch (e) {}
    if (r && typeof r.code === "string" && /^[a-z0-9]{6,12}$/.test(r.code) && typeof r.name === "string" && r.name) return { code: r.code, name: r.name.slice(0, 12) };
    return memRoom;
  }
  var room = loadRoom();
  function saveRoom(r) {
    memRoom = r; room = r;
    try { if (r) localStorage.setItem(ROOM_KEY, JSON.stringify(r)); else localStorage.removeItem(ROOM_KEY); } catch (e) {}
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
  // 내 점수 공개 여부 (기본: 켜짐)
  var SHARE_KEY = "examTimer.share.v1";
  function shareOn() { try { return localStorage.getItem(SHARE_KEY) !== "0"; } catch (e) { return true; } }
  // 과목별 점수 목록을 "~과목|38,44:46,-,40" 꼴의 이름으로 만듦 (본점수[:호머식], 미입력은 -)
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
