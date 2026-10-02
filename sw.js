// 무수한 실모 채팅 알림용 서비스 워커
// 아이패드 규칙: 푸시가 오면 반드시 즉시 알림을 띄워야 함 (안 띄우면 알림 권한이 취소됨)
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) {}
  var title = typeof d.t === "string" && d.t ? d.t : "무수한 실모";
  var body = typeof d.b === "string" && d.b ? d.b : "새 메시지가 왔어요";
  e.waitUntil(self.registration.showNotification(title, {
    body: body,
    tag: (typeof d.k === "string" ? d.k : "chat") + "-" + (typeof d.g === "string" ? d.g : "x"),     // 같은 사람·같은 종류는 알림 하나로 갱신
    renotify: true,
    icon: "icon-192.png"
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) if ("focus" in list[i]) return list[i].focus();
    return self.clients.openWindow("./index.html");
  }));
});
