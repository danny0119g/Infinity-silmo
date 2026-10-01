// [push.js] 채팅 알림(웹푸시) 켜기/끄기와 알림 주소 관리
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // [채팅 알림] 알림 서버(Cloudflare Worker) 주소를 PUSH_URL에 넣으면 켜짐. 비어 있으면 이 기능은 통째로 숨겨짐
  var PUSH_URL = "https://silmo-push.danny0119n.workers.dev", PUSH_PUB = "BJLJ-_VzE5N-C0Sf-XdDQMuy-oYOCTV0AXJuwS8UTifQ36P43TT9i_MolHWsmsautZcNqPZlENfdrTEkPapPgeA", PUSH_KEY = "examTimer.push.v1";
  function loadPushSub() { try { var o = JSON.parse(localStorage.getItem(PUSH_KEY)); if (o && o.on && typeof o.sub === "string" && o.sub.length > 20 && o.sub.length < 600) return o.sub; } catch (e) {} return ""; }
  var pushSub = loadPushSub();                       // 내 알림 주소 (친구 목록 칸 안에 숨겨서 올림 → 서버 규칙을 안 바꿔도 됨)
  function savePushSub(v) { pushSub = v || ""; try { localStorage.setItem(PUSH_KEY, JSON.stringify({ on: !!v, sub: v || "" })); } catch (e) {} lastSentBy = {}; scheduleSync(); }
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
  function notifyPush(peer, text) {                  // 상대에게 채팅 알림 요청 (실패해도 대화에는 영향 없음)
    if (!PUSH_URL || !room) return;
    try { fetch(PUSH_URL + "/notify", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ room: room.code, from: getDeviceId(), to: peer, text: text }), keepalive: true }).catch(function () {}); } catch (e) {}
  }
  function pushLabel() { return !pushSupported() ? "앱에서만" : (pushSub ? "켜짐" : "꺼짐"); }
  function refreshRoomPhoto() {                      // 방 설정 창의 프로필 사진 영역
    if (!room || !$("roomAv")) return;
    var av = $("roomAv"); av.textContent = "";
    if (photo && photoUsable() && validPhoto(photo)) { var im = el("img"); im.src = photo; im.alt = ""; av.appendChild(im); av.style.background = "#111214"; }
    else { av.textContent = room.name.charAt(0); av.style.background = avatarColor(room.name); }
    $("photoChange").innerHTML = PEN_ICON;           // 프로필 카드와 같은 펜 아이콘
    $("photoDel").classList.toggle("hidden", !photo);
    $("photoUseLine").classList.toggle("hidden", !photo);
    var u = photoUsable(); setSw($("photoUseToggle"), u, u ? "켜짐" : "꺼짐");
  }
  function setSw(btn, on, text) {                    // 아이폰 스위치처럼: 글자 없이 켜짐/꺼짐 상태만 표시
    btn.classList.toggle("on", !!on); btn.setAttribute("aria-checked", on ? "true" : "false");
    var na = text === "앱에서만"; btn.classList.toggle("na", na);
    var note = btn.parentNode && btn.parentNode.querySelector(".swNote"); if (note) note.textContent = na ? "앱에서만 가능" : "";
  }
  // [/채팅 알림]
