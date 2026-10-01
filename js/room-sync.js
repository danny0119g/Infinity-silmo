// [room-sync.js] 방 서버 통신: 내 상태 올리기, 15초 폴링, 멤버 목록 그리기
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 새 구조(v2)의 내 칸: 암호 칸 없이 제대로 된 이름의 칸으로 나눔
  function myStateV2(r, active) {
    var counts = {}, any = false;
    countsOf(loadAll()).forEach(function (c) {
      var key = c.name.replace(/[.$#\[\]\/]/g, "").slice(0, 30);
      if (key) { counts[key] = Math.min(99, (counts[key] || 0) + c.count); any = true; }
    });
    var st = { name: r.name, day: todayStr(), share: shareOn(r.code) };
    if (any) st.counts = counts;
    if (st.share) { var sm = scoreMap(); if (Object.keys(sm).length) st.scores = sm; }
    var lv = liveBlocked ? null : liveInfo();
    if (lv) st.live = lv;
    if (active && document.visibilityState === "visible") st.on = Math.floor(Date.now() / 1000);       // 앱이 화면에 보이는 동안 남기는 신호: 알림 서버가 이걸 보고 알림을 건너뜀
    return st;
  }
  function myState(r, active) {                      // r: 올릴 방, active: 지금 보고 있는 방인지 (보는 방에만 "보는 중" 신호를 남김)
    var subs = { "_": 0 };                          // 빈 값은 서버가 지워 버리므로 자리 표시용 항목을 항상 넣음
    countsOf(loadAll()).forEach(function (c) {
      var key = c.name.replace(/[.$#\[\]\/]/g, "").slice(0, 30);
      if (key) subs[key] = Math.min(99, (subs[key] || 0) + c.count);
    });
    if (pushSub) subs["~푸시|" + pushSub] = 1;
    if (active && document.visibilityState === "visible") subs["~온|" + Math.floor(Date.now() / 1000)] = 1;     // 앱이 화면에 보이는 동안 남기는 신호: 서버가 이걸 보고 알림을 건너뜀
    if (shareOn(r.code)) { subs["~공개"] = 1; scoreKeys().forEach(function (k) { subs[k] = 1; }); }
    var st = { name: r.name, day: todayStr(), subjects: subs }, lv = liveBlocked ? null : liveInfo();
    if (lv) st.live = lv;
    return st;
  }
  // 지금 응시 중이면 {과목, 시작 시각(초), 추가 시간 여부}
  function liveInfo() {
    if (current && liveStart && (phase === "running" || phase === "extra")) return { s: String(current.subject).slice(0, 30), t: Math.floor(liveStart / 1000), e: phase === "extra" ? 1 : 0 };
    if (lastDone && Date.now() / 1000 - lastDone.t <= 300) return { s: lastDone.s, t: lastDone.t, e: 2 };         // 방금 끝남
    return null;
  }
  function dbFetch(path, opts) {
    opts = opts || {};
    function go(tok) {
      var ctl = (typeof AbortController !== "undefined") ? new AbortController() : null, to = 0;
      if (ctl) { opts.signal = ctl.signal; to = setTimeout(function () { ctl.abort(); }, 10000); }
      return fetch(DB_URL + path + ".json" + (tok ? "?auth=" + encodeURIComponent(tok) : ""), opts).then(function (res) {
        clearTimeout(to);
        if (!res.ok) throw new Error("http " + res.status);
        return res.json();
      }, function (err) { clearTimeout(to); throw err; });
    }
    if (!USE_V2) return go("");
    if (!fbAuth) return Promise.reject(new Error("NO_AUTH"));
    return authToken().then(go);                     // 새 구조: 모든 요청에 내 로그인 토큰(1시간짜리, 자동 갱신)을 붙임
  }
  function enqueue(fn) { netChain = netChain.then(fn, fn); return netChain; }      // 요청을 한 줄로 세워서 순서가 뒤바뀌지 않게
  var lastPushBy = {}, roomPending = {}, accountReady = !USE_V2;      // accountReady: 새 구조에서 방 목록·옛 방 이전 확인이 끝났는지
  var lastPushAt = {}, PUSH_REASSERT_MS = 300000;
  function pushFresh(code) { return !pushSub || Date.now() - (lastPushAt[code] || 0) < PUSH_REASSERT_MS; }
  function syncPushRecord(r) {                       // 새 구조: 내 알림 주소는 따로 저장 (방 멤버만 읽을 수 있음)
    var code = r.code, want = pushSub || "";
    if (!want) { lastPushBy[code] = ""; return Promise.resolve(); }      // 알림을 안 켠 기기는 서버의 알림 주소를 건드리지 않음 (같은 계정의 다른 기기가 올린 것일 수 있음)
    if (lastPushBy[code] === want && pushFresh(code)) return Promise.resolve();         // 5분마다 다시 올려서, 누가 지웠어도 저절로 복구됨
    var path = ROOMS_ROOT + code + "/push/" + getDeviceId();
    return dbFetch(path, { method: "PUT", headers: JSONH, body: JSON.stringify(want) }).then(function () { lastPushBy[code] = want; lastPushAt[code] = Date.now(); });
  }
  function pushMe(force, r) {                        // 내 상태를 방에 올림 (r을 안 주면 지금 보는 방)
    r = r || room;
    if (!r) return Promise.resolve();
    if (USE_V2 && (!fbAuth || !accountReady || roomPending[r.code])) return Promise.resolve();      // 로그인 전이거나 아직 새 구조로 옮겨지지 않은 방
    var code = r.code, isActive = !!room && room.code === code, st = USE_V2 ? myStateV2(r, isActive) : myState(r, isActive), body = JSON.stringify(st);
    if (!force && body === lastSentBy[code] && (!USE_V2 || (lastPushBy[code] === (pushSub || "") && pushFresh(code)))) return Promise.resolve();
    function put(b) {
      return dbFetch(ROOMS_ROOT + code + "/members/" + getDeviceId(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: b })
        .then(function () { lastSentBy[code] = b; if (isActive) netErr = false; });
    }
    return put(body).catch(function (err) {
      if (st.live && err && err.message === "http 401") {          // 서버 규칙이 live 칸을 막고 있으면 그것만 빼고 다시 올림
        if (!USE_V2) liveBlocked = true; delete st.live;
        return put(JSON.stringify(st));
      }
      throw err;
    }).then(function () { return USE_V2 ? syncPushRecord(r) : null; }).catch(function () { if (isActive) netErr = true; delete lastSentBy[code]; });
  }
  // 프로필 사진은 별도 칸(photos)에 올려서, 실패해도 기록 동기화에는 영향이 없게 함
  var PHOTOUSE_KEY = "examTimer.photoUse.v1";
  function loadPhotoUse() { try { var o = JSON.parse(localStorage.getItem(PHOTOUSE_KEY)); if (o && typeof o === "object") return o; } catch (e) {} return {}; }
  var photoUse = loadPhotoUse();
  function setPhotoUse(code, v) { photoUse[code] = v; try { localStorage.setItem(PHOTOUSE_KEY, JSON.stringify(photoUse)); } catch (e) {} }
  function photoUsable(code) { code = code || (room && room.code); if (!code) return true; var v = photoUse[code]; return v !== false && v !== "ask"; }
  function askPhotoUse() {                           // 방에 들어올 때마다: 이 방에서 지금 사진을 쓸지 물어봄
    if (!room || !photo || photoUse[room.code] !== "ask" || $("modal").classList.contains("on")) return;
    var code = room.code;
    ask("이 방에서 프로필 사진을 쓰겠습니까?", "사용", false, function () {
      setPhotoUse(code, true); photoSentBy = {}; photoBlocked = false;
      keepPageScroll(renderTogether);
      enqueue(function () { return pushPhoto(true); }).then(function () { keepPageScroll(renderTogether); });
    }, function () { setPhotoUse(code, false); keepPageScroll(renderTogether); });
  }
  function pushPhoto(force, r) {                     // 프로필 사진을 방에 올림 (r을 안 주면 지금 보는 방)
    r = r || room;
    if (!r || !photo || !photoUsable(r.code)) return Promise.resolve();
    var code = r.code, mine = photo;
    if (!force && (photoSentBy[code] === mine || photoBlocked)) return Promise.resolve();
    return dbFetch(ROOMS_ROOT + code + "/photos/" + getDeviceId(), { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mine) })
      .then(function () { photoSentBy[code] = mine; photoBlocked = false; })
      .catch(function (err) { if (err && err.message === "http 401") if (!USE_V2) photoBlocked = true; });
  }
  function scheduleSync() {
    if (!room) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { enqueue(function () { return pushMe(false); }).then(function () { keepPageScroll(renderTogether); }); syncOtherRooms(false); }, 700);
  }
  // 방장 지정 (서버의 meta/host)
  function putHost(id) {
    if (!room) return Promise.resolve(false);
    var code = room.code;
    return dbFetch(ROOMS_ROOT + code + "/meta/host", { method: "PUT", headers: JSONH, body: JSON.stringify(id) })
      .then(function () { hostId = id; hostBlocked = false; return true; })
      .catch(function (err) { if (err && err.message === "http 401") hostBlocked = true; return false; });
  }
  function dropRoom(code) {                          // 이 기기의 방 목록에서 빼고, 서버에 남은 내 흔적(상태·사진·받은 편지)도 지움
    var wasActive = !!room && room.code === code, label = roomLabel(roomByCode(code));
    rooms = rooms.filter(function (r) { return r.code !== code; });
    delete lastSentBy[code]; delete photoSentBy[code];
    var me = getDeviceId();
    delete lastPushBy[code]; delete lastPushAt[code];
    (USE_V2 ? ["members", "photos", "msgs", "push"] : ["members", "photos", "msgs"]).forEach(function (k) {
      enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/" + k + "/" + me, { method: "DELETE" }).catch(function () {}); });
    });
    if (wasActive) { activateRoom(rooms[0] || null); afterSwitch(); } else { saveRooms(); renderRoomSwitch(); }
    return label;
  }
  function handleKicked() {                          // 방장이 나를 내보냈을 때 (지금 보던 방)
    if (!room) return;
    var label = dropRoom(room.code);
    notice((rooms.length ? "\"" + label + "\"" : "") + " 방장이 방에서 내보냈어요.");
  }
  function afterSwitch() {                           // 보는 방이 바뀐 뒤: 새 방에 내 상태를 올리고 친구 목록을 새로 받아 옴
    renderRoomSwitch();
    keepPageScroll(renderTogether);
    if (!room) return;
    enqueue(function () { return pushMe(true).then(function () { return pushPhoto(true); }); }).then(pullOthers).then(function () { keepPageScroll(renderTogether); });
    syncOtherRooms(true);                            // 방금까지 보던 방에서는 "보는 중" 신호를 지움
    askPhotoUse();
  }
  function switchRoom(code) {
    var r = roomByCode(code);
    if (!r || (room && room.code === code)) return;
    activateRoom(r);
    afterSwitch();
  }
  // 보고 있지 않은 방들: 내 상태·알림 주소는 계속 맞춰 올리고(바뀔 때만), 방장이 내보냈는지는 1분에 한 번만 확인
  var kickCheckAt = {};
  function syncOtherRooms(force) {
    if (USE_V2 && (!fbAuth || !accountReady)) return;
    rooms.slice().forEach(function (r) {
      if (room && r.code === room.code) return;
      enqueue(function () {
        if (!roomByCode(r.code)) return;
        var now = Date.now(), chk = Promise.resolve(null);
        if (force || !kickCheckAt[r.code] || now - kickCheckAt[r.code] > 60000) {
          kickCheckAt[r.code] = now;
          chk = USE_V2
            ? dbFetch(ROOMS_ROOT + r.code + "/meta", { cache: "no-store" }).then(function (m) { return { exists: !!m, kicked: !!(m && m.kicked && m.kicked[getDeviceId()] === true) }; }, function () { return null; })
            : dbFetch(ROOMS_ROOT + r.code + "/meta/kicked/" + getDeviceId(), { cache: "no-store" }).then(function (v) { return { exists: true, kicked: v === true }; }, function () { return null; });
        }
        return chk.then(function (info) {
          if (info && info.kicked) { var label = dropRoom(r.code); notice("\"" + label + "\" 방에서 내보내졌어요."); return; }
          if (USE_V2 && info) roomPending[r.code] = !info.exists;
          return pushMe(force, r);
        });
      });
    });
  }
  function pullOthers() {
    if (!room) return Promise.resolve();
    var code = room.code, me = getDeviceId();
    var pm401 = false;
    var pm = dbFetch(ROOMS_ROOT + code + "/members", { cache: "no-store" });
    if (USE_V2) pm = pm.catch(function (err) { if (err && err.message === "http 401") { pm401 = true; return null; } throw err; });      // 새 구조: 멤버가 아니면(아직 옮겨지지 않은 방, 내보내진 방) 읽기가 막힘
    var pmeta = metaBlocked ? Promise.resolve(undefined)
      : dbFetch(ROOMS_ROOT + code + "/meta", { cache: "no-store" }).catch(function (err) { if (err && err.message === "http 401") if (!USE_V2) metaBlocked = true; return undefined; });
    var pin = msgBlocked ? Promise.resolve(undefined)
      : dbFetch(ROOMS_ROOT + code + "/msgs/" + me, { cache: "no-store" }).catch(function (err) { if (err && err.message === "http 401") if (!USE_V2) msgBlocked = true; return undefined; });
    return Promise.all([pm, pmeta, pin]).then(function (res) {
      var data = res[0], meta = res[1], mbox = res[2];
      if (!room || room.code !== code) return;
      if (USE_V2) {                                   // 새 구조: 방 정보(meta)가 아직 없으면 옛 방이 옮겨지길 기다리는 중
        if (meta === null) { roomPending[code] = true; others = []; hostId = ""; netErr = false; return; }
        roomPending[code] = false;
        if (pm401 && meta && !(meta.kicked && meta.kicked[me] === true)) { netErr = true; return; }
      }
      var t = todayStr(), list = [];
      if (data && typeof data === "object") Object.keys(data).forEach(function (uid) {
        var m = data[uid];
        if (uid === me || !m || typeof m !== "object" || m.day !== t || typeof m.name !== "string") return;
        var ss = (m.subjects && typeof m.subjects === "object") ? m.subjects : {}, subs = [], total = 0, shared = false, series = [];
        if (USE_V2) {                                 // 새 구조의 칸: counts(과목별 횟수), share(점수 공개), scores(과목별 점수 목록)
          var cs = (m.counts && typeof m.counts === "object") ? m.counts : {};
          Object.keys(cs).forEach(function (k) { var c = cs[k]; if (typeof c === "number" && c > 0) { subs.push({ name: k, count: c }); total += c; } });
          shared = m.share === true;
          if (shared && m.scores && typeof m.scores === "object") Object.keys(m.scores).forEach(function (k) { if (typeof m.scores[k] === "string") series.push({ s: k, v: parseSeries(m.scores[k]) }); });
          ss = {};
        }
        Object.keys(ss).forEach(function (k) {
          var c = ss[k];
          if (k === "_" || k.indexOf("~푸시|") === 0 || k.indexOf("~온|") === 0) return;
          if (k.charAt(0) === "~") {                       // 점수 공개 표시와 과목별 점수 목록
            if (k === "~공개") { shared = true; return; }
            var bar = k.indexOf("|");
            if (bar > 1) series.push({ s: k.slice(1, bar), v: parseSeries(k.slice(bar + 1)) });
            return;
          }
          if (typeof c === "number" && c > 0) { subs.push({ name: k, count: c }); total += c; }
        });
        var lv = null;
        if (m.live && typeof m.live === "object" && typeof m.live.s === "string" && typeof m.live.t === "number") lv = { s: m.live.s.slice(0, 30), t: m.live.t, e: (typeof m.live.e === "number") ? m.live.e : 0 };
        list.push({ uid: uid, id: uid, name: m.name.slice(0, 12), subs: subs, total: total, me: false, live: lv, shared: shared, series: series });
      });
      list.sort(function (a, b) { return (b.total - a.total) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });   // 실모를 많이 친 사람이 위로
      list.forEach(function (x) {                       // 응시 중이던 사람이 응시 중이 아니게 됐고 횟수가 줄지 않았으면(=탈주가 아니면) 방금 끝낸 것으로 봄
        var pv = prevLive[x.id];
        if (isLive(x)) { prevLive[x.id] = { s: x.live.s, total: x.total }; delete doneInfer[x.id]; return; }
        if (pv) {
          if (!justDone(x) && x.total >= pv.total) doneInfer[x.id] = { s: pv.s, t: Math.floor(Date.now() / 1000) };
          delete prevLive[x.id];
        }
        if (!x.live && doneInfer[x.id]) x.live = { s: doneInfer[x.id].s, t: doneInfer[x.id].t, e: 2 };
      });
      others = list; pulled = true;
      var nowS = Date.now() / 1000, inb = [];
      if (mbox && typeof mbox === "object") Object.keys(mbox).forEach(function (from) {      // 나에게 온 점수 질문 / 답장
        var it = mbox[from];
        if (!it || typeof it !== "object" || (it.k !== "ask" && it.k !== "reply" && it.k !== "chat" && it.k !== "decline") || typeof it.t !== "number" || nowS - it.t > 1800) return;
        var kind = (it.k === "reply" && it.x === DECLINE_X) ? "decline" : it.k;
        if (dismissedMsg[from + ":" + kind + ":" + it.t]) return;
        inb.push({ from: from, k: kind, s: typeof it.s === "string" ? it.s.slice(0, 30) : "", x: kind === "decline" ? "" : (typeof it.x === "string" ? it.x.slice(0, 80) : ""), t: it.t });
        if (kind === "reply" || kind === "decline") { delete asked[from]; markResolved(from, it.t, kind); }
      });
      inbox = inb.filter(function (x) { return x.k !== "chat"; });
      invites = inb.filter(function (x) { return x.k === "chat"; });
      if (meta !== undefined) {
        hostId = (meta && typeof meta.host === "string") ? meta.host : "";
        if (meta && meta.kicked && meta.kicked[me] === true) { handleKicked(); return; }
        if (!hostBlocked) {                           // 방장이 비었거나 방에 없으면, 남은 사람 중 한 명(아이디가 가장 앞선 사람)이 자동으로 이어받음
          var ids = [me];
          list.forEach(function (x) { ids.push(x.id); });
          if (!hostId || ids.indexOf(hostId) < 0) { ids.sort(); if (ids[0] === me) enqueue(function () { return putHost(me); }); }
        }
      }
      netErr = false;
    }).catch(function () { netErr = true; });
  }
  function parseSeries(str) {
    return String(str).split(",").slice(0, 40).map(function (p) {
      var m = /^(-|\d{1,2})(?::(\d{1,2}))?$/.exec(p);
      if (!m) return { a: null, b: null };
      var a = m[1] === "-" ? null : Number(m[1]), b = m[2] != null ? Number(m[2]) : null;
      return { a: (a != null && a <= 50) ? a : null, b: (b != null && b <= 50) ? b : null };
    });
  }
  function pollTick() {
    if (!room || (USE_V2 && (!fbAuth || !accountReady)) || document.visibilityState !== "visible" || home.style.display === "none") return;
    try {                                              // 점수 공유가 새로 생긴 걸 이미 방에 있던 사람에게 한 번만 알림
      if (!localStorage.getItem("examTimer.shareNotice.v1")) {
        localStorage.setItem("examTimer.shareNotice.v1", "1");
        notice("이제 방 친구들이 내 점수를 볼 수 있어요.\n방 설정에서 \"내 점수 공개\"를 끌 수 있어요.");
      }
    } catch (e) {}
    askPhotoUse();
    if (typeof refreshRoomList === "function") refreshRoomList(false);
    syncOtherRooms(false);
    enqueue(function () { return pushMe(false).then(function () { return pushPhoto(false); }); }).then(pullOthers).then(function () { keepPageScroll(renderTogether); });
  }
  function renderTogether() {
    var box = $("togetherBody"), btn = $("roomBtn");
    renderRoomSwitch();
    var rmEl = $("roomModal"); if (rmEl && rmEl.classList.contains("on") && room) refreshRoomPhoto();      // 설정 창이 열려 있으면 사진 상태도 같이 갱신
    box.textContent = "";
    if (!room) {
      closeProfile(); inbox = []; invites = []; syncBubbles({}); destroyAllChats();
      btn.classList.remove("gear"); btn.removeAttribute("aria-label"); btn.textContent = "방 만들기 · 입장";
      box.appendChild(el("p", "hint", "방을 만들어 친구들을 초대하면\n서로 오늘 어떤 과목을 몇 번 응시했는지 볼 수 있어요."));
      return;
    }
    btn.classList.add("gear"); btn.setAttribute("aria-label", "방 설정"); btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
    var mine = countsOf(loadAll()), mt = 0;
    mine.forEach(function (c) { mt += c.count; });
    var meItem = { uid: "me", id: getDeviceId(), name: room.name, subs: mine, total: mt, me: true };
    var rest = others.slice().sort(function (a, b) { return (b.total - a.total) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
    var list = [meItem].concat(rest);                 // 나는 맨 위에 고정, 나머지는 응시 많은 순
    var ul = el("ul", "members"), lis = {};
    list.forEach(function (m) {
      var li = el("li", "mem" + (m.me ? " me" : "")), info = el("div", "info"), head = el("div", "head");
      lis[m.id] = li;
      function toggleProfile(e) { e.stopPropagation(); if (profileKey === m.uid) closeProfile(); else openProfile(m, li); }
      li.setAttribute("role", "button"); li.tabIndex = 0;
      li.addEventListener("click", toggleProfile);
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleProfile(e); } });
      head.appendChild(el("span", "nm", m.name));
      if (hostId && m.id === hostId) { var cr = el("span", "crown"); cr.innerHTML = CROWN_SVG; cr.setAttribute("title", "방장"); head.appendChild(cr); }
      if (m.me) head.appendChild(el("span", "metag", "나"));
      info.appendChild(head);
      var lt = liveText(m);
      if (lt) { var stl = el("div", "st"); stl.appendChild(el("span", "ldot")); stl.appendChild(document.createTextNode(lt)); info.appendChild(stl); }
      info.appendChild(el("div", "dt", m.subs.length ? m.subs.map(function (c) { return c.name + " " + c.count + "회"; }).join(", ") : "아직 응시 전"));
      var mav = el("div", "avatar memAv"); mav.setAttribute("data-uid", m.uid); mav.setAttribute("data-name", m.name);       // 카톡처럼 닉네임 왼쪽에 프로필 사진
      fillAvatar(mav, m);
      li.appendChild(mav);
      li.appendChild(info);
      li.appendChild(el("div", "cnt", m.total + "개"));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    rest.forEach(function (m) { var pc = photoCache[m.uid]; if (!pc || Date.now() - pc.t >= 300000) loadFriendPhoto(m); });      // 친구 사진은 처음 한 번, 이후 5분마다 확인
    syncBubbles(lis);
    syncChats(lis, list);
    if (list.length === 1) box.appendChild(el("p", "hint", "친구가 초대 코드로 입장하면 여기에 나타나요."));
    if (USE_V2 && roomPending[room.code]) box.appendChild(el("p", "hint", "아직 새 버전으로 옮겨지지 않은 방이에요.\n방장이 앱을 열면 이어져요."));
    if (netErr) box.appendChild(el("p", "hint", "서버에 연결하지 못했어요. 잠시 후 다시 시도할게요."));
    if (profileKey) {                                 // 갱신된 내용으로 열려 있는 프로필도 함께 새로 그림
      var pm = null, pl = null;
      list.forEach(function (m, i) { if (m.uid === profileKey) { pm = m; pl = ul.children[i]; } });
      if (pm) openProfile(pm, pl); else closeProfile();
    }
  }

