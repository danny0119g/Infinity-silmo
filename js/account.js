// [account.js] 로그인 계정: 방 목록을 계정에 저장·불러오기, 옛 방을 새 구조로 옮기기, 설정의 계정 칸
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  var ROOMSYNC_KEY = "examTimer.roomsSynced.v1", roomListReady = false, roomListDirty = false, roomListBusy = false, roomListTimer = 0;
  function roomListPath() { return "/v2/users/" + getDeviceId() + "/rooms"; }
  function pushRoomList() {                          // 내 방 목록을 계정에 저장 (기기를 바꿔도 이어지게)
    return enqueue(function () {
      if (!fbAuth) return null;
      function build(withExtra) { var map = {}; rooms.forEach(function (r) { map[r.code] = { name: r.name }; if (r.label) map[r.code].label = r.label; if (withExtra && typeof photoUse[r.code] === "boolean") map[r.code].photo = photoUse[r.code]; if (withExtra && hasShareSetting(r.code)) map[r.code].share = shareOn(r.code); }); return map; }
      var req = rooms.length ? dbFetch(roomListPath(), { method: "PUT", headers: JSONH, body: JSON.stringify(build(!roomPhotoFlagBlocked)) }) : dbFetch(roomListPath(), { method: "DELETE" });
      return req.catch(function (err) {
        if (rooms.length && !roomPhotoFlagBlocked && err && err.message === "http 401") {            // 서버 규칙이 "방별 사진 사용" 칸을 아직 모르면 그 칸을 빼고 다시 저장 (방 목록 저장이 막히지 않게)
          roomPhotoFlagBlocked = true;
          return dbFetch(roomListPath(), { method: "PUT", headers: JSONH, body: JSON.stringify(build(false)) }).catch(function () {});
        }
      });
    });
  }
  var roomListPending = false, roomListPulledAt = 0, roomPhotoFlagBlocked = false, acctPhotoBlocked = false;
  function scheduleRoomListPush() {
    if (!USE_V2 || !fbAuth) return;
    if (!roomListReady) { roomListDirty = true; return; }       // 서버 목록을 먼저 받기 전에는 올리지 않음 (옛 목록으로 덮어쓰지 않게)
    roomListPending = true;                                     // 아직 서버에 못 올린 변경이 있는 동안에는 서버 목록을 새로 받지 않음
    clearTimeout(roomListTimer); roomListTimer = setTimeout(function () { pushRoomList().then(function () { roomListPending = false; }, function () { roomListPending = false; }); }, 800);
  }
  function refreshRoomList(force) {                  // 앱을 켜 둔 채로도 다른 기기에서 바꾼 방 목록·닉네임·방 이름·방별 설정을 20초마다 받아 옴
    if (!USE_V2 || !fbAuth || !roomListReady || !accountReady || roomListBusy || roomListDirty || roomListPending || roomBusy) return;
    if (!force && Date.now() - roomListPulledAt < 20000) return;
    roomListPulledAt = Date.now(); roomListBusy = true;
    var before = room ? room.code : "", beforeSig = JSON.stringify(rooms);
    pullRoomList().then(function () {
      roomListBusy = false;
      if ((room ? room.code : "") !== before) { afterSwitch(); return; }
      if (JSON.stringify(rooms) !== beforeSig) { renderRoomSwitch(); keepPageScroll(renderTogether); syncOtherRooms(true); }
    }, function () { roomListBusy = false; });
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
      } else {                                       // 처음 연결: 이 기기의 방과 서버의 방을 합침. 같은 방이면 서버(같은 계정의 다른 기기가 먼저 올린) 값을 따르고, 이 기기에만 있는 방은 서버에 올림
        Object.keys(map).forEach(function (code) {
          var s = map[code], cur = roomByCode(code);
          if (!validSrvRoom(code, s)) return;
          var nm = s.name.slice(0, 12), lb = (typeof s.label === "string" && s.label.trim()) ? s.label.trim().slice(0, 14) : undefined;
          if (cur) {
            if (cur.name !== nm) { cur.name = nm; changed = true; }
            if (cur.label !== lb) { if (lb) cur.label = lb; else delete cur.label; changed = true; }
          } else if (rooms.length < MAX_ROOMS) { var o = { code: code, name: nm }; if (lb) o.label = lb; rooms.push(o); changed = true; }
        });
        roomListDirty = true;
        try { localStorage.setItem(ROOMSYNC_KEY, me); } catch (e) {}
      }
      var setChanged = false;
      Object.keys(map).forEach(function (code) {       // 다른 기기에서 바꾼 "이 방에서 사진 사용"·"내 점수 공개" 설정
        var s = map[code]; if (!validSrvRoom(code, s) || !roomByCode(code)) return;
        if (typeof s.photo === "boolean" && adoptPhotoUse(code, s.photo)) setChanged = true;
        if (typeof s.share === "boolean" && adoptShareOn(code, s.share)) setChanged = true;
      });
      if (setChanged) settingsApplied();
      if (changed) {
        saveRooms();
        if (activeGone || (!room && rooms.length)) activateRoom(rooms[0] || null);
        else persistRoom();
      }
    });
  }
  // ---- 프로필 사진 계정 동기화 ----
  function adoptPhotoUse(code, v) {                  // 다른 기기에서 정한 "이 방에서 사진 사용" 여부를 이 기기에 반영
    var cur = photoUse[code];
    if (cur === v || cur === "ask") return false;      // "ask"는 이 기기에서 아직 대답 안 한 상태
    photoUse[code] = v; try { localStorage.setItem(PHOTOUSE_KEY, JSON.stringify(photoUse)); } catch (e) {}
    photoSentBy = {};
    var r = roomByCode(code);
    if (v === false) enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
    else if (photo && r) enqueue(function () { return pushPhoto(true, r); });
    return true;
  }
  function adoptShareOn(code, v) {
    if (hasShareSetting(code) && shareOn(code) === v) return false;
    var m = {}; try { m = JSON.parse(localStorage.getItem(SHAREROOMS_KEY)) || {}; } catch (e) {}
    m[code] = v; try { localStorage.setItem(SHAREROOMS_KEY, JSON.stringify(m)); } catch (e) {}      // 다시 서버에 올리지 않고 이 기기에만 반영
    delete lastSentBy[code]; if (room && room.code === code) scheduleSync();
    return true;
  }
  function settingsApplied() {                       // 다른 기기에서 바뀐 설정을 화면에 바로 반영 (스위치·사진·점수)
    keepPageScroll(renderTogether);
    if (roomModal.classList.contains("on") && room) {
      setSw($("shareToggle"), shareOn(), shareOn() ? "켜짐" : "꺼짐");
      refreshRoomPhoto();
    }
  }
  function pushAccountPhoto() {                      // 내 사진(없으면 빈 글자)과 바뀐 시각을 계정에 저장
    if (!USE_V2 || !fbAuth) return Promise.resolve(false);
    var body = JSON.stringify({ photo: photo || "", photoAt: photoAt || Date.now() });
    return enqueue(function () { return dbFetch("/v2/users/" + getDeviceId(), { method: "PATCH", headers: JSONH, body: body }).then(function () { return true; }, function (err) { if (err && err.message === "http 401") acctPhotoBlocked = true; return false; }); });      // 서버 규칙이 아직 모르면 이번 접속 동안은 다시 시도하지 않음
  }
  function adoptAccountPhoto(p, at) {                // 다른 기기에서 바꾼 사진을 이 기기와 이 기기가 올린 방들에 반영 (p가 빈 글자면 사진을 지운 것)
    if (p) savePhoto(p); else { photo = ""; memPhoto = ""; try { localStorage.removeItem(PHOTO_KEY); } catch (e) {} }
    savePhotoAt(at); photoSentBy = {}; photoBlocked = false;
    rooms.forEach(function (r) {
      if (p) enqueue(function () { return pushPhoto(true, r); });
      else enqueue(function () { return dbFetch(ROOMS_ROOT + r.code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); });
    });
    keepPageScroll(renderTogether);
    if (roomModal.classList.contains("on") && room) refreshRoomPhoto();
  }
  // ---- 선택한 과목 계정 동기화 (users/{uid}/subjects = {s1,s2}, subjAt) ----
  var SUBJAT_KEY = "examTimer.subjectsAt.v1", subjBlocked = false, subjBusy = false, subjPushTimer = 0;
  function loadSubjAt() { try { return Number(localStorage.getItem(SUBJAT_KEY)) || 0; } catch (e) { return 0; } }
  function saveSubjAt(t) { try { localStorage.setItem(SUBJAT_KEY, String(t)); } catch (e) {} }
  function onSubjectsChanged() {
    if (!USE_V2 || !fbAuth) return;
    saveSubjAt(Date.now());
    clearTimeout(subjPushTimer); subjPushTimer = setTimeout(pushSubjects, 800);
  }
  function pushSubjects() {
    if (!USE_V2 || !fbAuth || !accountReady || subjBlocked) return Promise.resolve();
    var s = loadSubjects(), body = JSON.stringify({ subjects: { s1: s[1] || "", s2: s[2] || "" }, subjAt: loadSubjAt() || Date.now() });
    return enqueue(function () { return dbFetch("/v2/users/" + getDeviceId(), { method: "PATCH", headers: JSONH, body: body }).catch(function (err) { if (err && err.message === "http 401") subjBlocked = true; }); });
  }
  function syncSubjects() {
    if (!USE_V2 || !fbAuth || !accountReady || subjBlocked || subjBusy) return Promise.resolve();
    subjBusy = true;
    var base = "/v2/users/" + getDeviceId();
    return dbFetch(base + "/subjAt", { cache: "no-store" }).then(function (srvAt) {
      srvAt = (typeof srvAt === "number") ? srvAt : 0;
      var mine = loadSubjAt();
      if (srvAt > mine) {
        if (sessionPending()) return;                // 시험 중에는 과목을 바꾸지 않음(끝난 뒤 다음 확인 때 반영)
        return dbFetch(base + "/subjects", { cache: "no-store" }).then(function (o) {
          if (!o || typeof o !== "object") return;
          var a = ALL_SUBJECTS.indexOf(o.s1) >= 0 ? o.s1 : null, b = ALL_SUBJECTS.indexOf(o.s2) >= 0 ? o.s2 : null, cur = loadSubjects();
          saveSubjAt(srvAt);
          if (cur[1] === a && cur[2] === b) return;
          var keep = onSubjectsChanged; onSubjectsChanged = function () {};      // 받은 값은 다시 올리지 않음
          try { setSubject(1, a); setSubject(2, b); } finally { onSubjectsChanged = keep; }
          saveSubjAt(srvAt);
          keepPageScroll(renderTogether); if (typeof renderSlots === "function") renderSlots();
        });
      }
      if (mine > srvAt || (!srvAt && (loadSubjects()[1] || loadSubjects()[2]))) { if (!mine) saveSubjAt(Date.now()); return pushSubjects(); }
    }).then(function () { subjBusy = false; }, function () { subjBusy = false; });
  }
  // ---- 응시 기록 계정 동기화: 날짜별로 users/{uid}/recs/{날짜} = {v, at, list(JSON 글자), gone(지운 ID 목록)}, 날짜 목록 users/{uid}/recIdx/{날짜} = at ----
  // 평소(15초)에는 오늘 것만 확인하고, 1분마다 날짜 목록(recIdx)을 받아 새로 생긴·바뀐 날짜만 가져옴 (기록이 몇 달 쌓여도 요청 수가 늘지 않음)
  var RECDIRTY_KEY = "examTimer.recDirty.v2", RECSYNC_KEY = "examTimer.recSynced.v2", REC_RETAIN_DAYS = 400, REC_MAX_PER_CYCLE = 12, REC_MAX_LIST = 30000;
  var recBlocked = false, recBusy = false, recAgain = false, recTimer = 0, recCheckAt = 0, recIdxAt = 0;
  function recGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function recSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function recMap(k) { try { var o = JSON.parse(localStorage.getItem(k)); return (o && typeof o === "object") ? o : {}; } catch (e) { return {}; } }
  function recMapSet(k, d, v) { var o = recMap(k); if (v == null) delete o[d]; else o[d] = v; recSet(k, JSON.stringify(o)); }
  function recSyncedAt(d) { return Number(recMap(RECSYNC_KEY)[d]) || 0; }
  function recIsDirty(d) { return recMap(RECDIRTY_KEY)[d] === 1; }
  function onRecordsChanged(d) {
    if (!USE_V2 || !fbAuth || !validDay(d)) return;
    recMapSet(RECDIRTY_KEY, d, 1);
    clearTimeout(recTimer); recTimer = setTimeout(function () { syncRecords(true); }, 800);
  }
  function unionIds(a, b) { var seen = {}, out = []; a.concat(b).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out.slice(-100); }
  function mergeRecs(local, remote, gone) {        // 두 기기에서 따로 쌓인 기록을 합침 (같은 기록이면 값이 있는 칸을 채움, 시작 시각 순서, 지운 기록은 뺌)
    var byId = {}, order = [], dead = {};
    gone.forEach(function (id) { dead[id] = 1; });
    remote.forEach(function (r) { if (!byId[r.id]) order.push(r.id); byId[r.id] = r; });
    local.forEach(function (r) {
      if (byId[r.id]) { var c = {}, k; for (k in byId[r.id]) c[k] = byId[r.id][k]; for (k in r) if (r[k] != null) c[k] = r[k]; byId[r.id] = c; }
      else { byId[r.id] = r; order.push(r.id); }
    });
    return order.filter(function (id) { return !dead[id]; }).map(function (id, i) { return { r: byId[id], i: i }; })
      .sort(function (a, b) { return (idTime(a.r.id) - idTime(b.r.id)) || (a.i - b.i); }).map(function (x) { return x.r; });
  }
  function sameIds(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }
  function syncDay(d, srvAt) {                     // 하루치 기록을 서버와 맞춤 (srvAt: 서버 날짜 목록에 적힌 시각, 없으면 0)
    var base = "/v2/users/" + getDeviceId(), isToday = d === todayStr();
    var dirty = recIsDirty(d) || recMap(RECSYNC_KEY)[d] === undefined;                    // 한 번도 맞춘 적 없으면 이 기기 기록도 살림
    var need = srvAt > recSyncedAt(d);
    var p = need ? dbFetch(base + "/recs/" + d, { cache: "no-store" }) : Promise.resolve(null);
    return p.then(function (o) {
      var srv = (o && typeof o === "object" && typeof o.at === "number" && typeof o.list === "string") ? o : null;
      if (srv && srv.at > recSyncedAt(d)) {
        if (isToday && sessionPending()) return;   // 시험 중에는 오늘 기록을 바꾸지 않음 (끝난 뒤 다음 확인 때 반영)
        var remote = null; try { remote = JSON.parse(srv.list); } catch (e) {}
        if (!Array.isArray(remote)) return;
        remote = sanitize(remote);
        var rg = []; try { var g = JSON.parse(srv.gone || "[]"); if (Array.isArray(g)) rg = g.filter(function (x) { return typeof x === "string"; }); } catch (e) {}
        var local = loadDay(d), lg = dayGone(d), allGone = unionIds(lg, rg);
        var next = dirty ? mergeRecs(local, remote, allGone) : remote, gnext = dirty ? allGone : rg;
        if (JSON.stringify(next) !== JSON.stringify(local) || !sameIds(gnext, lg)) {
          saveDay(d, next, gnext, true);
          if (isToday) { recSet(DAY_KEY, todayStr()); keepPageScroll(function () { renderSlots(); renderToday(); }); }
        }
        recMapSet(RECSYNC_KEY, d, srv.at);
        if (!dirty || (JSON.stringify(next) === JSON.stringify(remote) && sameIds(gnext, rg))) { recMapSet(RECDIRTY_KEY, d, null); return; }
      } else if (!dirty && !(!srv && need && loadDay(d).length)) return;
      var list = JSON.stringify(loadDay(d)), gone = dayGone(d);
      if (list.length > REC_MAX_LIST) return;
      if (list === "[]" && !gone.length && !srv) { recMapSet(RECSYNC_KEY, d, 0); recMapSet(RECDIRTY_KEY, d, null); return; }      // 빈 날은 올리지 않음
      var at = Math.max(Date.now(), recSyncedAt(d) + 1, (srv ? srv.at : srvAt) + 1), body = {};
      body["recs/" + d] = { v: 1, at: at, list: list, gone: JSON.stringify(gone) };
      body["recIdx/" + d] = at;                    // 기록과 날짜 목록을 한 번에(둘 다 성공하거나 둘 다 실패)
      return dbFetch(base, { method: "PATCH", headers: JSONH, body: JSON.stringify(body) }).then(function () {
        recMapSet(RECSYNC_KEY, d, at); recMapSet(RECDIRTY_KEY, d, null);
      }, function (err) { if (err && err.message === "http 401") recBlocked = true; });      // 서버 규칙이 아직 모르면 이번 접속 동안은 다시 시도하지 않음
    });
  }
  function pruneOldDays() {                        // 오래된 날짜는 이 기기에서만 지움 (서버에는 남음). 아직 못 올린 날은 지우지 않음
    var limit = dayStrOf(Date.now() - REC_RETAIN_DAYS * 86400000);
    localDays().forEach(function (d) { if (d < limit && !recIsDirty(d) && recMap(RECSYNC_KEY)[d] !== undefined) { removeLocalDay(d); recMapSet(RECSYNC_KEY, d, null); } });
  }
  function syncRecords(force) {
    if (!USE_V2 || !fbAuth || !accountReady || recBlocked) return Promise.resolve();
    if (!force && Date.now() - recCheckAt < 15000) return Promise.resolve();
    if (recBusy) { recAgain = true; return Promise.resolve(); }
    if (typeof checkNewDay === "function") checkNewDay(false);                     // 날짜가 바뀌었으면 화면부터 새 날로
    recBusy = true; recCheckAt = Date.now();
    var base = "/v2/users/" + getDeviceId(), today = todayStr(), full = force || Date.now() - recIdxAt >= 60000;
    var pidx = full ? dbFetch(base + "/recIdx", { cache: "no-store" }).then(function (o) { return (o && typeof o === "object") ? o : {}; })
                    : dbFetch(base + "/recIdx/" + today, { cache: "no-store" }).then(function (v) { var o = {}; if (typeof v === "number") o[today] = v; return o; });
    return pidx.then(function (idx) {
      var todo = [today];
      Object.keys(recMap(RECDIRTY_KEY)).forEach(function (d) { if (validDay(d) && todo.indexOf(d) < 0) todo.push(d); });
      if (full) {
        recIdxAt = Date.now();
        Object.keys(idx).sort().reverse().forEach(function (d) { if (validDay(d) && typeof idx[d] === "number" && idx[d] > recSyncedAt(d) && todo.indexOf(d) < 0) todo.push(d); });
        localDays().forEach(function (d) { if (idx[d] == null && recMap(RECSYNC_KEY)[d] === undefined && todo.indexOf(d) < 0) todo.push(d); });
        pruneOldDays();
      }
      todo = todo.slice(0, REC_MAX_PER_CYCLE);
      return todo.reduce(function (chain, d) { return chain.then(function () { return syncDay(d, typeof idx[d] === "number" ? idx[d] : 0); }); }, Promise.resolve());
    }).then(function () { recBusy = false; if (recAgain) { recAgain = false; syncRecords(true); } }, function () { recBusy = false; });
  }
  // ---- 다크 모드 계정 동기화 (users/{uid}/theme, themeAt) ----
  var themeBlocked = false, themeBusy = false, themeTimer = 0;
  function onThemeChanged() {
    if (!USE_V2 || !fbAuth) return;
    clearTimeout(themeTimer); themeTimer = setTimeout(pushTheme, 800);
  }
  function pushTheme() {
    if (!USE_V2 || !fbAuth || !accountReady || themeBlocked) return Promise.resolve();
    var body = JSON.stringify({ theme: themePref(), themeAt: Number(recGet(THEMEAT_KEY)) || Date.now() });
    return enqueue(function () { return dbFetch("/v2/users/" + getDeviceId(), { method: "PATCH", headers: JSONH, body: body }).catch(function (err) { if (err && err.message === "http 401") themeBlocked = true; }); });
  }
  function syncTheme() {
    if (!USE_V2 || !fbAuth || !accountReady || themeBlocked || themeBusy) return Promise.resolve();
    themeBusy = true;
    var base = "/v2/users/" + getDeviceId();
    return dbFetch(base + "/themeAt", { cache: "no-store" }).then(function (srvAt) {
      srvAt = (typeof srvAt === "number") ? srvAt : 0;
      var mine = Number(recGet(THEMEAT_KEY)) || 0;
      if (srvAt > mine) {
        return dbFetch(base + "/theme", { cache: "no-store" }).then(function (t) {
          if (t !== "dark" && t !== "light" && t !== "system") return;
          recSet(THEMEAT_KEY, String(srvAt));
          if (themePref() === t) return;
          try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
          applyTheme();
          if (typeof themeRedraw === "function") themeRedraw();
        });
      }
      if (mine > srvAt) return pushTheme();
    }).then(function () { themeBusy = false; }, function () { themeBusy = false; });
  }
  // ---- 같은 계정의 다른 기기에서 응시 중인지 (users/{uid}/exam: 응시 중인 기기만 씀) ----
  var INST = (function () { var v = ""; try { v = localStorage.getItem("examTimer.inst.v1") || ""; if (!v) { v = newId(); localStorage.setItem("examTimer.inst.v1", v); } } catch (e) {} return v || newId(); })();
  var acctExam = null, examPushed = false, examBlocked = false, examPullBusy = false;
  function acctExamLive() { return (acctExam && Date.now() - acctExam.at < 180000 && Date.now() / 1000 - acctExam.t < 90 * 60) ? acctExam : null; }
  function acctLiveInfo() { var a = acctExamLive(); return a ? { s: a.s, t: a.t, e: a.e } : null; }      // 방 서버의 내 칸에 이어서 올릴 값 (이 기기가 쉬는 중이어도 응시 표시가 지워지지 않게)
  function pushExamState() {                         // 이 기기의 응시 상태가 바뀔 때·응시 중 20초마다
    if (!USE_V2 || !fbAuth || !accountReady || examBlocked) return Promise.resolve();
    var running = current && liveStart && (phase === "running" || phase === "extra"), base = "/v2/users/" + getDeviceId() + "/exam";
    if (running) {
      var body = JSON.stringify({ s: String(current.subject).slice(0, 30), t: Math.floor(liveStart / 1000), e: phase === "extra" ? 1 : 0, d: INST, at: Date.now() });
      examPushed = true;
      return enqueue(function () { return dbFetch(base, { method: "PUT", headers: JSONH, body: body }).catch(function (err) { if (err && err.message === "http 401") examBlocked = true; }); });
    }
    if (examPushed) { examPushed = false; return enqueue(function () { return dbFetch(base, { method: "DELETE" }).catch(function () {}); }); }
    return Promise.resolve();
  }
  setInterval(function () { if (phase === "running" || phase === "extra") pushExamState(); }, 20000);
  function pullExamState() {
    if (!USE_V2 || !fbAuth || !accountReady || examBlocked || examPullBusy || phase === "running" || phase === "extra") return Promise.resolve();
    examPullBusy = true;
    var before = JSON.stringify(acctExamLive());
    return dbFetch("/v2/users/" + getDeviceId() + "/exam", { cache: "no-store" }).then(function (o) {
      acctExam = (o && typeof o === "object" && typeof o.s === "string" && typeof o.t === "number" && typeof o.at === "number" && o.d !== INST) ? { s: o.s.slice(0, 30), t: o.t, e: o.e === 1 ? 1 : 0, at: o.at } : null;
      if (JSON.stringify(acctExamLive()) !== before) keepPageScroll(renderTogether);
    }).then(function () { examPullBusy = false; }, function () { examPullBusy = false; });
  }
  var photoSyncBusy = false, photoSyncAt = 0;
  function syncAccountPhoto(force) {                 // 서버의 계정 사진과 비교해서, 서버 것이 더 새로우면 받고 이 기기 것이 더 새로우면(또는 서버에 없으면) 올림
    if (!USE_V2 || !fbAuth || !accountReady || photoSyncBusy || acctPhotoBlocked) return Promise.resolve();
    if (!force && Date.now() - photoSyncAt < 20000) return Promise.resolve();
    photoSyncBusy = true; photoSyncAt = Date.now();
    var base = "/v2/users/" + getDeviceId();
    return dbFetch(base + "/photoAt", { cache: "no-store" }).then(function (srvAt) {
      srvAt = (typeof srvAt === "number") ? srvAt : 0;
      if (srvAt > photoAt) {
        return dbFetch(base + "/photo", { cache: "no-store" }).then(function (p) {
          p = (typeof p === "string") ? p : "";
          if (p && !validPhoto(p)) return;
          adoptAccountPhoto(p, srvAt);
        });
      }
      if (photoAt > srvAt || (!srvAt && photo)) {
        if (!photoAt) savePhotoAt(Date.now());           // 예전에 이 기기에만 저장해 둔 사진: 지금 계정에 올림
        return pushAccountPhoto();
      }
    }).then(function () { photoSyncBusy = false; }, function () { photoSyncBusy = false; });
  }
  function ensureV2Rooms() {                         // 옛 구조의 방을 새 구조로 옮김: 옛 방장이 이 기기라면 새 방을 만들어 방장을 이어받음
    var me = getDeviceId(), jobs = [];
    rooms.slice().forEach(function (r) {
      jobs.push(enqueue(function () {
        return dbFetch(ROOMS_ROOT + r.code + "/meta", { cache: "no-store" }).then(function (m) {
          if (m) { roomPending[r.code] = false; return; }
          return dbFetch("/rooms/" + r.code + "/meta/host", { cache: "no-store" }).then(function (oldHost) {
            if (typeof oldHost === "string" && oldHost && oldHost === getLegacyDeviceId()) {
              return putMetaCreate(r.code, me, roomLabel(r)).then(function () { roomPending[r.code] = false; });
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
        syncSubjects(); syncRecords(true); syncTheme(); pullExamState();
        return syncAccountPhoto(true).then(function () {         // 사진을 먼저 맞춘 뒤 방에 올림(기기마다 다른 사진을 방에 덮어쓰지 않게)
          renderRoomSwitch(); keepPageScroll(renderTogether);
          if (room) afterSwitch(); else syncOtherRooms(true);
        });
      }, function () { roomListBusy = false; });
  }
  // ---- 설정 창의 계정 칸 ----
  var accountLinkDrawn = false, accountLinkFrom = "", acctProfileTried = false;
  function renderAccount() {
    var sec = $("accountSec"); if (!sec) return;
    sec.classList.toggle("hidden", !(USE_V2 && fbAuth));
    if (!(USE_V2 && fbAuth)) return;
    var anon = fbAuth.kind === "anon";
    $("accountKind").textContent = anon ? "이 기기에서만 쓰는 중" : "구글메일로 로그인됨";
    var av = $("accountAv"), em = $("accountEmail");
    if (!anon && fbAuth.photo) { av.src = fbAuth.photo; av.classList.remove("hidden"); } else av.classList.add("hidden");
    if (!anon && fbAuth.email) { em.textContent = fbAuth.email; em.classList.remove("hidden"); } else em.classList.add("hidden");
    if (!anon && !fbAuth.photo && !fbAuth.email && !acctProfileTried) { acctProfileTried = true; authFetchProfile().then(function () { renderAccount(); }, function () {}); }      // 예전에 로그인해 저장된 프로필이 없으면 한 번 받아 옴
    $("accountLink").classList.toggle("hidden", !anon);
    if (anon && !accountLinkDrawn) {                 // 이 기기에서만 쓰던 계정에 구글을 연결 (방과 방장 권한은 그대로 이어짐)
      accountLinkDrawn = true; accountLinkFrom = fbAuth.uid;
      authRenderGoogleButton($("accountGoogle"), function () {
        accountLinkDrawn = false;
        if (fbAuth.uid !== accountLinkFrom) {          // 다른 계정으로 바뀜(이미 쓰던 구글 계정 / 새로 시작) → 이 기기에 남은 예전 계정 정보를 비우고 새 계정 기준으로 다시 시작
          wipeLocalAccountData();
          try { sessionStorage.setItem("examTimer.acctSwitched", authLastFresh ? "new" : "1"); } catch (e) {}
          location.reload(); return;
        }
        renderAccount(); setRoomMsg("구글 계정에 연결했어요.", false);
      }, function (e) { accountLinkDrawn = false; setRoomMsg(authErrorText(e)); }, confirmCarryOver);
    }
  }
  function confirmCarryOver() {                      // 처음 쓰는 구글 계정에 연결할 때: 지금 이 기기의 정보를 옮길지 물음
    return new Promise(function (resolve) {
      ask("처음 쓰는 구글 계정이에요.\n지금까지 쓰던 방·기록·설정을 모두 이 구글 계정으로 옮길까요?\n\n'새로 시작'을 고르면 빈 계정으로 시작하고, 지금 계정의 정보는 이 기기에서 더 볼 수 없어요.", "옮기기", false, function () { resolve(true); }, function () { resolve(false); });
      $("modalNo").textContent = "새로 시작";
    });
  }
  function wipeLocalAccountData() {                  // 이 기기에 저장된 앱 정보를 지움 (로그인 정보·화면 색·기기 표시는 남김)
    var keep = { "examTimer.auth.v1": 1, "examTimer.theme.v1": 1, "examTimer.inst.v1": 1 }, del = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf("examTimer.") === 0 && !keep[k]) del.push(k); } del.forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
  }
  $("accountOut").addEventListener("click", function () {
    var anon = fbAuth && fbAuth.kind === "anon";
    ask(anon ? "로그아웃하면 이 계정의 방을 다시 찾을 수 없어요.\n구글 계정에 먼저 연결해 두는 걸 추천해요.\n그래도 로그아웃할까요?" : "로그아웃할까요?\n다시 구글로 로그인하면 방 목록이 돌아와요.", "로그아웃", true, function () {
      authSignOut();
      location.reload();
    });
  });
  try {
    var swKind = sessionStorage.getItem("examTimer.acctSwitched");
    if (swKind) {
      sessionStorage.removeItem("examTimer.acctSwitched");
      var isNew = swKind === "new";
      setTimeout(function () { notice(isNew ? "빈 구글 계정으로 새로 시작했어요." : "이미 쓰던 구글 계정이라 그 계정으로 전환했어요.\n이 기기에서만 쓰던 계정의 방은 옮겨지지 않아요."); }, 900);
    }
  } catch (e) {}
  if (USE_V2 && fbAuth) startAccountSync();
