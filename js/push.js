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
    $("photoDel").classList.toggle("hidden", !photo);
    $("photoUseLine").classList.toggle("hidden", !photo);
    var u = photoUsable(); setSw($("photoUseToggle"), u, u ? "켜짐" : "꺼짐");
  }
  function setSw(btn, on, text) {                    // 아이폰 스위치처럼: 글자 없이 켜짐/꺼짐 상태만 표시
    btn.classList.toggle("on", !!on); btn.setAttribute("aria-checked", on ? "true" : "false");
    var na = text === "앱에서만"; btn.classList.toggle("na", na);
    var note = btn.parentNode && btn.parentNode.querySelector(".swNote"); if (note) note.textContent = na ? "앱에서만 가능" : "";
  }
  // ---------- 알림 점검: 설정 창의 "알림 점검 > 실행" ----------
  // 이 기기·서버·알림 서버가 각 단계에서 정상인지 차례로 보여 주고, 마지막에 알림 서버가 10초 뒤 시험 알림을 보냄 (그 사이 앱을 닫아 보면 됨)
  var checkBusy = false;
  function runPushCheck() {
    if (checkBusy) return;
    checkBusy = true;
    var out = [], btn = $("pushCheck"), stopped = false;
    btn.disabled = true; btn.textContent = "점검 중…";
    function add(ok, t) { out.push((ok === null ? "· " : ok ? "✓ " : "✗ ") + t); }
    function stop() { stopped = true; }
    function finish(tail) {
      checkBusy = false; btn.disabled = false; btn.textContent = "실행";
      if (tail) { out.push(""); out.push(tail); }
      notice(out.join("\n")); $("modalMsg").classList.add("rpt");
    }
    var mv = document.querySelector('meta[name="app-version"]'), mine = (mv && mv.content) || "?";
    fetch(location.pathname + "?v=" + Date.now(), { cache: "no-store" }).then(function (r) { return r.text(); }).then(function (t) {      // 1) 앱 버전
      var x = t.match(/<meta name="app-version" content="([^"]*)"/), latest = x && x[1];
      if (!latest) add(null, "앱 버전 " + mine + " (서버 버전은 확인 못 함)");
      else if (latest === mine) add(true, "최신 버전이에요 (" + mine + ")");
      else add(false, "서버에 더 새 버전이 있어요. 앱을 완전히 닫았다가 다시 열어 주세요 (지금 " + mine + ")");
    }, function () { add(null, "앱 버전 " + mine + " (서버 버전은 확인 못 함)"); })
    .then(function () {                                                                                                                   // 2) 계정·방 목록
      if (!USE_V2 || !fbAuth) return;
      add(true, "로그인: " + (fbAuth.kind === "google" ? "구글 계정" : "이 기기에서만 쓰는 계정") + " (" + fbAuth.uid.slice(0, 6) + "…)");
      return dbFetch(roomListPath(), { cache: "no-store" }).then(function (srv) {
        srv = (srv && typeof srv === "object") ? srv : {};
        var sc = Object.keys(srv), same = sc.length === rooms.length && rooms.every(function (r) { var s = srv[r.code]; return !!s && s.name === r.name && (s.label || "") === (r.label || ""); });
        add(same, "방 목록: 이 기기 " + rooms.length + "개, 서버 " + sc.length + "개" + (same ? " (이름까지 같음)" : " (다름: 앱을 다시 열면 맞춰져요)"));
      }, function () { add(false, "방 목록을 서버에서 읽지 못했어요"); });
    })
    .then(function () {                                                                                                                   // 2-2) 이 기기에서 보낸 채팅의 알림 결과
      var lg = loadPushLog();
      if (!lg.length) { add(null, "이 기기에서 보낸 채팅의 알림 결과: 아직 없음 (채팅을 보낸 뒤 점검하면 상대에게 알림이 갔는지 보여요)"); return; }
      lg.slice(-3).forEach(function (e) {
        var m = Math.max(0, Math.round((Date.now() - e.t) / 60000));
        add(e.ok, (m < 1 ? "방금" : m + "분 전") + " " + e.n + "에게 보낸 채팅: " + e.r);
      });
    })
    .then(function () {                                                                                                                   // 3) 이 기기의 알림 준비
      if (!pushSupported()) { add(false, "이 화면은 알림을 지원하지 않아요 (아이패드는 홈 화면에 추가한 앱에서만)"); stop(); return; }
      add(true, "알림 기능을 쓸 수 있는 화면이에요");
      if (Notification.permission !== "granted") { add(false, "알림이 허용돼 있지 않아요 (" + Notification.permission + "). 아이패드 설정 > 알림 > 무수한 실모"); stop(); return; }
      add(true, "알림 허용됨");
      return navigator.serviceWorker.getRegistration().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; }).then(function (sub) {
        if (!sub) { add(false, "이 기기에 알림 구독이 없어요. 채팅 알림을 껐다가 다시 켜 주세요"); stop(); return; }
        var host = ""; try { host = new URL(sub.endpoint).host; } catch (e) {}
        add(true, "알림 구독 있음 (" + host + ")");
        if (!pushSub) { add(false, "채팅 알림 스위치가 꺼져 있어요. 켜 주세요"); stop(); return; }
        var key = pushKeyOf(sub);
        add(key === pushSub, key === pushSub ? "저장된 알림 주소가 구독과 같아요" : "저장된 알림 주소가 구독과 달랐어요 (지금 고쳤어요)");
        if (key !== pushSub) savePushSub(key);
      }, function () { add(false, "알림 구독을 확인하지 못했어요"); stop(); });
    })
    .then(function () {                                                                                                                   // 4) 서버에 올라간 내 알림 주소
      if (stopped) return;
      if (!room) { add(false, "방이 없어서 더 점검할 수 없어요. 방에 들어간 뒤 다시 해 주세요"); stop(); return; }
      if (!USE_V2) return;
      var path = ROOMS_ROOT + room.code + "/push/" + getDeviceId();
      return dbFetch(path, { cache: "no-store" }).then(function (v) {
        if (v === pushSub) { add(true, "서버(이 방)에 내 알림 주소가 있어요"); return; }
        add(false, v ? "서버의 알림 주소가 이 기기 것과 달랐어요 (다른 기기가 올린 것일 수 있어요). 지금 다시 올려요" : "서버에 내 알림 주소가 없었어요. 지금 다시 올려요");
        lastPushBy = {}; lastPushAt = {}; lastSentBy = {};
        return enqueue(function () { return pushMe(true); }).then(function () { return dbFetch(path, { cache: "no-store" }); }).then(function (v2) {
          add(v2 === pushSub, v2 === pushSub ? "다시 올려서 고쳤어요" : "다시 올렸는데도 서버에 안 보여요 (서버 규칙 문제일 수 있어요)");
          if (v2 !== pushSub) stop();
        });
      }, function (err) { add(false, "서버에서 알림 주소를 읽지 못했어요 (" + (err && err.message) + ")"); stop(); });
    })
    .then(function () {                                                                                                                   // 5) 알림 서버에 시험 알림 요청
      if (stopped) return null;
      if (!USE_V2) { add(null, "옛 구조에서는 알림 서버 시험을 건너뛰어요"); return null; }
      return authToken().then(function (tok) {
        return fetch(PUSH_URL + "/notify", { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ room: room.code, to: getDeviceId(), text: "알림 시험", token: tok, test: true, delay: 10 }) });
      }).then(function (res) { return res.text().then(function (b) { var j = {}; try { j = JSON.parse(b); } catch (e) {} return { s: res.status, j: j }; }); })
      .then(function (x) {
        if (x.s === 200 && x.j && x.j.scheduled) { add(true, "알림 서버가 " + x.j.scheduled + "초 뒤 시험 알림을 보내기로 했어요 (" + (x.j.host || "?") + ")"); return "sent"; }
        if (x.s === 200 && x.j && x.j.reason) add(false, "알림 서버가 서버에서 내 알림 주소를 못 찾았어요");
        else if (x.s === 400) add(false, "알림 서버가 아직 옛 버전이에요 (새 버전 배포에 1~2분 걸려요)");
        else if (x.s === 403) add(false, "알림 서버가 나를 이 방 멤버로 인정하지 않았어요");
        else add(false, "알림 서버 응답이 이상해요 (" + x.s + ")");
        return null;
      }, function () { add(false, "알림 서버에 연결하지 못했어요"); return null; });
    })
    .then(function (sent) {
      finish(sent ? "지금 홈 화면으로 나가서 10초쯤 기다려 보세요.\n'알림 시험' 알림이 오면 정상이에요. 안 오면 아이패드 설정 > 알림 > 무수한 실모와 집중 모드를 확인해 주세요." : "✗가 있는 줄부터 해결해 주세요.");
    }, function () { finish("점검 중 오류가 났어요. 다시 해 주세요."); });
  }
  $("pushCheck").addEventListener("click", runPushCheck);
  // [/채팅 알림]
