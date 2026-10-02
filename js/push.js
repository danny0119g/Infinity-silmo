// [push.js] 채팅 알림(웹푸시) 켜기/끄기와 알림 주소 관리
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // [채팅 알림] 알림 서버(Cloudflare Worker) 주소를 PUSH_URL에 넣으면 켜짐. 비어 있으면 이 기능은 통째로 숨겨짐
  var PUSH_URL = "https://silmo-push.danny0119n.workers.dev", PUSH_PUB = "BJLJ-_VzE5N-C0Sf-XdDQMuy-oYOCTV0AXJuwS8UTifQ36P43TT9i_MolHWsmsautZcNqPZlENfdrTEkPapPgeA", PUSH_KEY = "examTimer.push.v1";
  function loadPushSub() { try { var o = JSON.parse(localStorage.getItem(PUSH_KEY)); if (o && o.on && typeof o.sub === "string" && o.sub.length > 20 && o.sub.length < 600) return o.sub; } catch (e) {} return ""; }
  var pushSub = loadPushSub();                       // 내 알림 주소 (친구 목록 칸 안에 숨겨서 올림 → 서버 규칙을 안 바꿔도 됨)
  function savePushSub(v) {
    var had = !!pushSub;
    pushSub = v || ""; try { localStorage.setItem(PUSH_KEY, JSON.stringify({ on: !!v, sub: v || "" })); } catch (e) {} lastSentBy = {}; lastPushBy = {}; lastPushAt = {};
    if (had && !pushSub) clearPushRecords();         // 이 기기가 알림을 끈(또는 허용이 취소된) 경우에만 서버의 내 알림 주소를 지움
    scheduleSync();
  }
  function clearPushRecords() {                      // 새 구조: 모든 방에서 내 알림 주소 삭제 (알림을 안 켠 다른 기기는 절대 지우지 않음: 같은 계정의 다른 기기 것일 수 있어서)
    if (!USE_V2 || !fbAuth) return;
    rooms.slice().forEach(function (r) { enqueue(function () { return dbFetch(ROOMS_ROOT + r.code + "/push/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); }); });
  }
  function pushSupported() { return !!PUSH_URL && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; }
  function b64uBytes(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
  function pushKeyOf(sub) { var j = sub.toJSON(); return btoa(JSON.stringify({ e: j.endpoint, p: j.keys.p256dh, a: j.keys.auth })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function enablePush() {                            // 반드시 버튼을 누른 직후에 호출 (아이패드 규칙)
    return Notification.requestPermission().then(function (perm) {
      if (perm !== "granted") throw new Error("denied");
      return navigator.serviceWorker.register("sw.js");
    }).then(function () { return navigator.serviceWorker.ready; }).then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) { return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(PUSH_PUB) }); });
    }).then(function (sub) { savePushSub(pushKeyOf(sub)); });
  }
  function disablePush() {
    savePushSub("");
    return (navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : Promise.resolve(null)).then(function (reg) { return reg && reg.pushManager.getSubscription(); }).then(function (sub) { return sub && sub.unsubscribe(); }).catch(function () {});
  }
  function refreshPush() {                           // 앱을 열 때: 서비스 워커를 켜 두고, 알림 주소가 바뀌었거나 취소됐으면 맞춰 줌
    if (!pushSupported() || !pushSub) return;
    if (Notification.permission !== "granted") { savePushSub(""); return; }
    navigator.serviceWorker.register("sw.js").then(function () { return navigator.serviceWorker.ready; })
      .then(function (reg) { return reg.pushManager.getSubscription(); })
      .then(function (sub) { if (!sub) savePushSub(""); else { var k = pushKeyOf(sub); if (k !== pushSub) savePushSub(k); } }).catch(function () {});
  }
  // 내가 보낸 채팅의 알림 결과를 기억해 둠 (알림 점검에서 "상대에게 알림이 갔는지/왜 안 갔는지" 보여 줌)
  var PUSHLOG_KEY = "examTimer.pushLog.v1";
  function loadPushLog() { try { var a = JSON.parse(localStorage.getItem(PUSHLOG_KEY)); return Array.isArray(a) ? a.slice(-5) : []; } catch (e) { return []; } }
  function logPushResult(name, status, j) {
    var ok = false, t;
    if (!status) t = "알림 서버에 연결하지 못했어요";
    else if (status !== 200) t = status === 502 ? "알림 서버가 푸시 서비스에 보내지 못했어요 (502)" : "알림 서버가 거절했어요 (" + status + ")";
    else if (j && j.skipped === "viewing") t = "상대가 그때 앱을 보고 있어서 보내지 않았어요";
    else if (j && j.sent === true) { ok = true; t = "푸시 서비스가 받았어요 (" + (j.status || "") + ")"; }
    else if (!j || typeof j !== "object" || (j.sent === undefined && j.skipped === undefined)) t = "알림 서버 응답이 이상해요 (" + status + ")";
    else if (j && j.sent === false && typeof j.status === "number") t = "푸시 서비스가 거절했어요 (" + j.status + ")";
    else t = "상대의 알림 주소가 서버에 없어요 (상대가 알림을 안 켰거나 지워졌어요)";
    try { var a = loadPushLog(); a.push({ t: Date.now(), n: name, ok: ok, r: t }); localStorage.setItem(PUSHLOG_KEY, JSON.stringify(a.slice(-5))); } catch (e) {}
  }
  function notifyPush(peer, text) {                  // 상대에게 채팅 알림 요청 (실패해도 대화에는 영향 없음)
    if (!PUSH_URL || !room) return;
    var rc = room.code;
    if (USE_V2) {                                    // 새 구조: 내 로그인 토큰을 같이 보내면 알림 서버가 그 토큰으로 서버 규칙을 거쳐 확인함
      var nm = "상대"; others.forEach(function (o) { if (o.id === peer) nm = o.name; });
      authToken().then(function (tok) {
        fetch(PUSH_URL + "/notify", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ room: rc, to: peer, text: text, token: tok }), keepalive: true })
          .then(function (res) { return res.json().catch(function () { return null; }).then(function (j) { logPushResult(nm, res.status, j); }); }, function () { logPushResult(nm, 0, null); });
      }, function () {});
      return;
    }
    try { fetch(PUSH_URL + "/notify", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ room: rc, from: getDeviceId(), to: peer, text: text }), keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function pushLabel() { return !pushSupported() ? "앱에서만" : (pushSub ? "켜짐" : "꺼짐"); }
  function refreshRoomPhoto() {                      // 방 설정 창의 프로필 사진 영역
    if (!room || !$("roomAv")) return;
    var av = $("roomAv"); av.textContent = "";
    if (photo && photoUsable() && validPhoto(photo)) { var im = el("img"); im.src = photo; im.alt = ""; av.appendChild(im); av.style.background = "#111214"; }
    else { av.textContent = room.name.charAt(0); av.style.background = avatarColor(room.name); }
    $("photoChange").innerHTML = PEN_ICON;           // 프로필 카드와 같은 펜 아이콘
    $("photoUseLine").classList.toggle("hidden", !photo);
    var u = photoUsable(); setSw($("photoUseToggle"), u, u ? "켜짐" : "꺼짐");
  }
  function setSw(btn, on, text) {                    // 아이폰 스위치처럼: 글자 없이 켜짐/꺼짐 상태만 표시
    btn.classList.toggle("on", !!on); btn.setAttribute("aria-checked", on ? "true" : "false");
    var na = text === "앱에서만"; btn.classList.toggle("na", na);
    var note = btn.parentNode && btn.parentNode.querySelector(".swNote"); if (note) note.textContent = na ? "앱에서만 가능" : "";
  }
  // [/채팅 알림]
