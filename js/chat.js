// [chat.js] 작은 채팅창 (읽음 표시, 크기 조절 포함)
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 작은 채팅창 ----------
  // 점수 물어보기 → 상대 답장 → 질문한 사람이 그 답장을 누르면, 서로의 카드 옆에 작은 채팅창이 열림 (앞의 두 마디 포함).
  // 둘 중 한 명이라도 실모를 시작하면 상대 창에 안내가 뜨고(입력창은 사라짐) 잠시 뒤 저절로 닫힘.
  var CHAT_ID = /^[A-Za-z0-9]{6,40}$/, CHAT_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  // 열려 있는 대화를 기기에 기억해 두었다가, 새로고침하면 상대가 아직 방에 있고 대화가 안 끝났을 때 다시 띄움
  var CHATS_KEY = "examTimer.chats.v1", pulled = false;
  function loadSavedChats() {
    var r = {};
    try {
      var o = JSON.parse(localStorage.getItem(CHATS_KEY));
      if (o && room && o.code === room.code && o.peers && typeof o.peers === "object") Object.keys(o.peers).forEach(function (id) {
        if (CHAT_ID.test(id) && o.peers[id] && typeof o.peers[id].o === "number") r[id] = o.peers[id].o;
      });
    } catch (e) {}
    return r;
  }
  var pendingRestore = loadSavedChats();
  function saveChats() {
    try {
      if (!room) { localStorage.removeItem(CHATS_KEY); return; }
      var peers = {};
      Object.keys(chats).forEach(function (id) { if (!chats[id].ended) peers[id] = { o: chats[id].opened }; });
      localStorage.setItem(CHATS_KEY, JSON.stringify({ code: room.code, peers: peers }));
    } catch (e) {}
  }
  function pairKey(a, b) { return a < b ? a + "_" + b : b + "_" + a; }
  function chatNode(code, peer) { return ROOMS_ROOT + code + "/chats/" + pairKey(getDeviceId(), peer); }
  function mkey(ms) { var b = Math.floor(ms).toString(36); while (b.length < 9) b = "0" + b; return "m" + b + rnd(3, CHAT_CHARS); }   // 시간순으로 정렬되는 글자 번호
  function cleanChat(v) { return String(v).replace(/\s+/g, " ").trim().slice(0, 60); }
  function validMsg(m) { return !!m && typeof m === "object" && typeof m.f === "string" && typeof m.t === "number" && (m.k === "m" || m.k === "ask" || m.k === "reply" || m.k === "sys"); }
  function isReadMark(m) { return !!m && m.k === "m" && !m.x && typeof m.s === "string" && m.s.indexOf("r|") === 0; }   // 읽음 표시: 글자 없는 메시지(규칙 변경 없이 기존 칸 사용)
  function msgText(m) { return m.k === "ask" ? "" : (m.x || ""); }
  function placeNear(node, anchor) {
    if (node.classList.contains("resizing")) return;                                           // 크기를 당기는 중에는 자리를 다시 계산하지 않음
    if (!anchor || !anchor.getBoundingClientRect || anchor.isConnected === false) return;       // 카드가 목록에서 사라졌으면 있던 자리에 그대로 둠
    var ae = document.activeElement;
    if (ae && ae.tagName === "INPUT" && node.contains(ae) && node.style.left) return;      // 입력 중에는 창을 건드리지 않음 (건드리면 아이패드 키보드가 튕겨 내려감)
    var vw = window.innerWidth, vh = window.innerHeight, r = anchor.getBoundingClientRect(), pw = node.offsetWidth, ph = node.offsetHeight, G = 10, x, y;
    if (!r.width && !r.height) return;                                                         // 숨겨진 상태(크기 0)에서는 계산하지 않음
    var B = vh - 8;
    if (node.classList.contains("chatwin") || node.classList.contains("bub")) B = Math.min(B, vh * 0.46);   // 입력칸이 키보드에 가려지지 않게 화면 위쪽 절반 안에: 가려지면 사파리가 화면을 억지로 밀어서 키보드가 튕김
    if (r.left - G - pw >= 8) { x = r.left - G - pw; y = r.top; }
    else if (r.right + G + pw <= vw - 8) { x = r.right + G; y = r.top; }
    else { x = Math.min(Math.max(8, r.left), vw - pw - 8); y = r.bottom + 6; if (y + ph > B) y = r.top - ph - 6; }
    y = Math.max(8, Math.min(y, B - ph));
    node.style.left = Math.round(x) + "px"; node.style.top = Math.round(y) + "px";
    node.style.visibility = (r.bottom < 0 || r.top > vh) ? "hidden" : "";
  }
  function renderChatMsgs(c) {
    var box = c.msgsEl, stick = c.stick || (box.scrollHeight - box.scrollTop - box.clientHeight < 28), me = getDeviceId();
    var keys = Object.keys(c.msgs).sort().slice(-40);
    box.textContent = "";
    keys.forEach(function (k) {
      var m = c.msgs[k], sc = (m.k === "reply") ? parseScore(m.x) : null;
      if (sc) {                                        // 점수 답장: 초록=인증, 노랑=호머식, 빨강=거짓말입니다, 회색=확인할 점수 없음
        var sd = el("div", "cm score v" + sc.v + " " + (m.f === me ? "me" : "them")), bd = el("span", "cmBadge");
        sd.appendChild(el("span", "cmScore", sc.n + "점"));
        bd.innerHTML = VICON[sc.v]; bd.appendChild(document.createTextNode(VLABEL[sc.v]));
        sd.appendChild(bd); box.appendChild(sd);
        return;
      }
      var tx = msgText(m);
      if (!tx) return;
      var d = el("div", "cm " + (m.f === me ? "me" : "them") + (m.st === "fail" ? " fail" : ""));
      d.textContent = tx + (m.st === "fail" ? " (전송 안 됨)" : "");
      if (m.f === me && m.k === "m" && !m.st && k.charAt(0) === "m" && k > (c.peerRead || "")) {     // 상대가 아직 안 읽음: 말풍선 옆에 1
        var rw = el("div", "cmRow me");
        rw.appendChild(el("span", "cmRead", "1")); rw.appendChild(d); box.appendChild(rw);
        return;
      }
      box.appendChild(d);
    });
    if (stick) box.scrollTop = box.scrollHeight;
    c.stick = false;
    placeNear(c.el, c.li);
  }
  setTimeout(refreshPush, 1500);
  var CHATSIZE_KEY = "examTimer.chatsize.v1", CHAT_MINW = 250, CHAT_MINH = 96;
  function chatBottomLimit() { var vh = window.innerHeight; return Math.min(vh - 8, vh * 0.46); }   // 입력칸이 키보드에 가려지지 않게 화면 위쪽 안에서만 커짐
  function loadChatSize() {
    try { var o = JSON.parse(localStorage.getItem(CHATSIZE_KEY)); if (o && typeof o.w === "number" && typeof o.h === "number") return { w: o.w, h: o.h }; } catch (e) {}
    return null;
  }
  function clampChatSize(c, w, h, top) {             // 창 폭/글 영역 높이를 화면 안으로 제한 (top: 창 위쪽 위치, 없으면 맨 위 기준)
    var maxW = Math.max(CHAT_MINW, Math.min(560, window.innerWidth - 16));
    var chrome = c.el.offsetHeight - c.msgsEl.offsetHeight;
    var maxTotal = chatBottomLimit() - 8;                                       // 손을 떼면 안전선 안으로 올라가 자리 잡으므로, 전체 높이는 여기까지
    if (top != null) maxTotal = Math.min(maxTotal, window.innerHeight - 8 - top);   // 당기는 동안은 화면 끝까지 손가락을 따라감
    var maxH = Math.max(CHAT_MINH, maxTotal - chrome);
    return { w: Math.round(Math.min(maxW, Math.max(CHAT_MINW, w))), h: Math.round(Math.min(maxH, Math.max(CHAT_MINH, h))) };
  }
  function applyChatSize(c, w, h, top) {
    var z = clampChatSize(c, w, h, top);
    c.el.style.width = z.w + "px"; c.msgsEl.style.height = z.h + "px";
    return z;
  }
  function attachGrip(c, grip) {
    var drag = null;
    grip.addEventListener("touchstart", function (e) { e.preventDefault(); }, { passive: false });   // 입력 중이어도 키보드가 내려가지 않게
    grip.addEventListener("mousedown", function (e) { e.preventDefault(); });
    grip.addEventListener("click", function (e) { e.stopPropagation(); });
    grip.addEventListener("pointerdown", function (e) {
      if (c.ended) return;
      e.preventDefault(); e.stopPropagation();
      var r = c.el.getBoundingClientRect();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, w: c.el.offsetWidth, h: c.msgsEl.offsetHeight, right: r.right, top: r.top, stick: c.msgsEl.scrollHeight - c.msgsEl.scrollTop - c.msgsEl.clientHeight < 28 };
      try { grip.setPointerCapture(e.pointerId); } catch (err) {}
      c.el.classList.add("resizing");
    });
    grip.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      e.preventDefault();
      applyChatSize(c, drag.w - (e.clientX - drag.x), drag.h + (e.clientY - drag.y), drag.top);   // 왼쪽 아래 모서리가 손가락을 따라옴 (오른쪽·위 가장자리는 고정)
      c.el.style.left = Math.round(Math.max(8, drag.right - c.el.offsetWidth)) + "px"; c.el.style.top = Math.round(drag.top) + "px";
      if (drag.stick) c.msgsEl.scrollTop = c.msgsEl.scrollHeight;
    });
    function end(e) {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      try { grip.releasePointerCapture(e.pointerId); } catch (err) {}
      c.el.classList.remove("resizing");
      try { localStorage.setItem(CHATSIZE_KEY, JSON.stringify({ w: c.el.offsetWidth, h: c.msgsEl.offsetHeight })); } catch (err) {}
      var nt = Math.max(8, Math.min(c.el.getBoundingClientRect().top, chatBottomLimit() - c.el.offsetHeight));   // 손을 떼면 키보드 안전선 안으로 부드럽게 올라가 자리 잡음
      c.el.style.transition = "top .2s ease"; c.el.style.top = Math.round(nt) + "px";
      setTimeout(function () { c.el.style.transition = ""; placeNear(c.el, c.li); }, 230);
    }
    grip.addEventListener("pointerup", end);
    grip.addEventListener("pointercancel", end);
  }
  window.addEventListener("resize", function () {          // 화면 크기가 바뀌면(회전 등) 창이 화면 밖으로 안 나가게 다시 맞춤
    Object.keys(chats).forEach(function (p) { var c = chats[p]; if (!c || !c.el.isConnected) return; applyChatSize(c, c.el.offsetWidth, c.msgsEl.offsetHeight); placeNear(c.el, c.li); });
  });
  function buildChat(peer, name, msgs, li) {
    var win = el("div", "chatwin"), head = el("div", "chatHead"), nm = el("span", "chatName", name), x = el("button", "chatX", "✕");
    var mb = el("div", "chatMsgs"), notice = el("div", "chatNotice hidden"), row = el("div", "chatRow"), inp = el("input", "chatIn"), send = el("button", "chatSend", "보내기");
    x.type = "button"; x.setAttribute("aria-label", "대화 닫기");
    inp.type = "text"; inp.maxLength = 60; inp.placeholder = "메시지"; inp.setAttribute("autocomplete", "off");
    send.type = "button";
    head.appendChild(nm); head.appendChild(x);
    row.appendChild(inp); row.appendChild(send);
    var grip = el("div", "chatGrip"); grip.setAttribute("aria-label", "채팅창 크기 조절");
    win.appendChild(head); win.appendChild(mb); win.appendChild(notice); win.appendChild(row); win.appendChild(grip);
    var c = { peer: peer, el: win, nameEl: nm, msgsEl: mb, row: row, notice: notice, input: inp, msgs: msgs, li: li, ended: false, timer: 0, sawServer: false, busy: false, lastSend: 0, opened: Date.now(), stick: true };
    function go() {
      if (sendChat(peer, inp.value)) inp.value = "";
      try { inp.focus({ preventScroll: true }); } catch (err) { inp.focus(); }       // 보낸 뒤에도 키보드를 그대로 유지
    }
    x.addEventListener("click", function (e) {                                       // 닫기는 한 번 확인 (이미 끝난 대화 = 안내가 떠 있는 창은 바로 닫음)
      e.stopPropagation();
      if (chats[peer] && chats[peer].ended) { closeChat(peer, null); return; }
      ask("대화를 닫겠습니까?\n상대에게도 대화가 닫혔다고 알려져요.", "닫기", false, function () { closeChat(peer, "bye"); });
    });
    send.addEventListener("mousedown", function (e) { e.preventDefault(); });        // 버튼을 눌러도 입력창의 포커스를 뺏지 않게
    send.addEventListener("click", function (e) { e.stopPropagation(); go(); });
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); go(); } });
    chats[peer] = c;
    saveChats();
    $("chatLayer").appendChild(win);
    attachGrip(c, grip);
    var sz = loadChatSize(); if (sz) applyChatSize(c, sz.w, sz.h);
    renderChatMsgs(c);
    return c;
  }
  function removeChat(peer) {
    var c = chats[peer];
    if (!c) return;
    clearTimeout(c.timer);
    if (c.el.parentNode) c.el.parentNode.removeChild(c.el);
    delete chats[peer];
    saveChats();
    chatClosedAt[peer] = Date.now() / 1000;
    if (profileM && profileM.id === peer) keepPageScroll(renderTogether);       // 열려 있는 프로필에 점수 물어보기 버튼이 다시 나올 수 있게
  }
  function postSys(peer, reason) {                    // 상대 창에 안내가 뜨게 하고, 잠시 뒤 서버의 대화 기록을 정리
    if (!room) return;
    var code = room.code, me = getDeviceId(), node = chatNode(code, peer), now = Date.now();
    enqueue(function () { return dbFetch(node + "/" + mkey(now), { method: "PUT", headers: JSONH, body: JSON.stringify({ f: me, k: "sys", x: reason, t: Math.floor(now / 1000) }) }).catch(function () {}); });
    setTimeout(function () { if (!chats[peer]) enqueue(function () { return dbFetch(node, { method: "DELETE" }).catch(function () {}); }); }, 6000);
  }
  function closeChat(peer, reason) {
    var c = chats[peer];
    if (!c) return;
    if (reason && !c.ended) postSys(peer, reason);
    removeChat(peer);
  }
  function closeAllChats(reason) { Object.keys(chats).forEach(function (p) { closeChat(p, reason); }); }
  function destroyAllChats() { closeAllChats(null); }
  function endChat(peer, text) {                      // 안내 문구를 보여 주고(입력창은 사라짐) 잠시 뒤 닫음
    var c = chats[peer];
    if (!c || c.ended) return;
    c.ended = true;
    saveChats();
    c.row.classList.add("hidden");
    c.notice.textContent = text; c.notice.classList.remove("hidden");
    c.input.blur();
    c.timer = setTimeout(function () { removeChat(peer); }, 3500);
  }
  function chatNoticeText(c, sys) {
    var n = c.nameEl.textContent;
    return sys === "exam" ? n + "님이 실모를 치러 갔어요" : sys === "gone" ? n + "님이 방을 나갔어요" : n + "님이 대화를 닫았어요";
  }
  function sendChat(peer, raw) {
    var c = chats[peer], text = cleanChat(raw);
    if (!c || c.ended || !text || !room) return false;
    var ms = Date.now();
    if (ms - c.lastSend < 350) return false;
    c.lastSend = ms;
    var key = mkey(ms), me = getDeviceId(), msg = { f: me, k: "m", x: text, t: Math.floor(ms / 1000) }, node = chatNode(room.code, peer);
    c.msgs[key] = { f: me, k: "m", x: text, s: "", t: msg.t, st: "pending" };
    c.stick = true;
    renderChatMsgs(c);
    enqueue(function () {
      return dbFetch(node + "/" + key, { method: "PUT", headers: JSONH, body: JSON.stringify(msg) })
        .then(function () { notifyPush(peer, text); if (c.msgs[key]) { delete c.msgs[key].st; if (chats[peer] === c && !c.ended) renderChatMsgs(c); } })
        .catch(function (err) {
          if (c.msgs[key]) { c.msgs[key].st = "fail"; if (chats[peer] === c) renderChatMsgs(c); }
          if (err && err.message === "http 401") if (!USE_V2) chatBlocked = true;
        });
    });
    return true;
  }
  function mergeChat(peer, d) {
    var c = chats[peer];
    if (!c || c.ended) return;
    var me = getDeviceId();
    if (!d || typeof d !== "object") { if (c.sawServer) endChat(peer, "대화가 끝났어요"); return; }
    c.sawServer = true;
    var changed = false, newest = 0, sys = "";
    Object.keys(d).forEach(function (k) {
      var m = d[k];
      if (!validMsg(m) || (m.f !== me && m.f !== peer)) return;
      if (m.t > newest) newest = m.t;
      if (isReadMark(m)) {                                                    // 상대가 어디까지 읽었는지
        if (m.f === peer) { var rk = m.s.slice(2, 20); if (rk > (c.peerRead || "")) { c.peerRead = rk; changed = true; } }
        return;
      }
      if (m.k === "sys") { if (m.f !== me) sys = typeof m.x === "string" ? m.x : "bye"; return; }
      var old = c.msgs[k];
      if (!old || old.st) {
        c.msgs[k] = { f: m.f, k: m.k, x: typeof m.x === "string" ? m.x.slice(0, 80) : "", s: typeof m.s === "string" ? m.s.slice(0, 30) : "", t: m.t };
        changed = true;
      }
    });
    if (changed) renderChatMsgs(c);
    if (sys) { endChat(peer, chatNoticeText(c, sys)); return; }
    var latest = "";                                                          // 내가 이 창을 보고 있으면 상대 메시지를 읽은 것으로 표시
    Object.keys(d).forEach(function (k) { var m = d[k]; if (validMsg(m) && m.f === peer && m.k === "m" && m.x && k.charAt(0) === "m" && k > latest) latest = k; });
    if (latest && latest > (c.readSent || "") && document.visibilityState === "visible" && home.style.display !== "none") {
      c.readSent = latest;
      var rn = chatNode(room.code, peer) + "/rd" + me, rv = { f: me, k: "m", x: "", s: "r|" + latest, t: Math.floor(Date.now() / 1000) };
      enqueue(function () { return dbFetch(rn, { method: "PUT", headers: JSONH, body: JSON.stringify(rv) }).catch(function () { c.readSent = ""; }); });
    }
    if (Date.now() / 1000 - Math.max(newest, c.opened / 1000) > 1800) endChat(peer, "대화가 끝났어요");      // 30분 동안 아무 말이 없으면 정리
  }
  function chatTick() {
    if (!room || chatBlocked || document.visibilityState !== "visible" || home.style.display === "none") return;
    var code = room.code;
    Object.keys(chats).forEach(function (peer) {
      var c = chats[peer];
      if (!c || c.ended || c.busy) return;
      c.busy = true;
      dbFetch(chatNode(code, peer), { cache: "no-store" })
        .then(function (d) { c.busy = false; if (chats[peer] === c) mergeChat(peer, d); })
        .catch(function (err) { c.busy = false; if (err && err.message === "http 401") { if (!USE_V2) chatBlocked = true; if (chats[peer] === c) endChat(peer, "서버 규칙 업데이트가 필요해요"); } });
    });
  }
  setInterval(chatTick, 3000);

  function openChatFromReply(it) {                    // 내가 물어봤고, 상대가 답한 말풍선을 눌렀을 때
    var peer = it.from;
    if (!room || chats[peer] || !CHAT_ID.test(peer)) return;
    var li = lastLis[peer];
    if (!li) return;
    if (chatBlocked) { notice("서버 규칙을 업데이트해야 대화할 수 있어요."); return; }
    var me = getDeviceId(), code = room.code, am = askMeta[peer] || {}, rt = it.t, at = Math.min(am.t || rt - 1, rt - 1), nowS = Math.floor(Date.now() / 1000);
    var ka = mkey(at * 1000), kr = mkey(rt * 1000), seeds = {}, node = chatNode(code, peer), nm = li.querySelector(".nm");
    seeds[ka] = { f: me, k: "ask", s: String(am.s || it.s || "").slice(0, 30), t: at };
    seeds[kr] = { f: peer, k: "reply", s: String(it.s || "").slice(0, 30), x: String(it.x || "").slice(0, 80), t: rt };
    var local = {};
    local[ka] = seeds[ka]; local[kr] = seeds[kr];
    dropMsg(it);
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + me + "/" + peer, { method: "DELETE" }).catch(function () {}); });
    buildChat(peer, nm ? nm.textContent : "친구", local, li);
    enqueue(function () {                             // 서버에 앞의 두 마디를 먼저 올리고, 상대에게 "대화가 열렸다"고 알림
      return dbFetch(node, { method: "PUT", headers: JSONH, body: JSON.stringify(seeds) })
        .then(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + peer + "/" + me, { method: "PUT", headers: JSONH, body: JSON.stringify({ k: "chat", s: seeds[ka].s, t: nowS }) }); })
        .catch(function (err) { if (err && err.message === "http 401") { if (!USE_V2) chatBlocked = true; removeChat(peer); notice("서버 규칙을 업데이트해야 대화할 수 있어요."); } });
    });
    keepPageScroll(renderTogether);
  }
  function dropInvite(iv) {
    dismissedMsg[iv.from + ":chat:" + iv.t] = true;
    invites = invites.filter(function (x) { return x !== iv; });
    if (!room) return;
    var code = room.code;
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + getDeviceId() + "/" + iv.from, { method: "DELETE" }).catch(function () {}); });
  }
  function handleInvite(iv, lis, byId) {              // 상대가 대화를 열었을 때: 내 쪽에도 창을 띄움
    var peer = iv.from, m = byId[peer], li = lis[peer];
    if (!CHAT_ID.test(peer) || chats[peer] || chatBlocked || !room) { dropInvite(iv); return; }
    if (iv.t <= (chatClosedAt[peer] || 0) || Date.now() / 1000 - iv.t > 120 || !m || !li || isLive(m)) { dropInvite(iv); return; }
    dropInvite(iv);
    var code = room.code, me = getDeviceId();
    dbFetch(chatNode(code, peer), { cache: "no-store" }).then(function (d) {
      if (!d || typeof d !== "object" || chats[peer] || !room || room.code !== code || !lastLis[peer]) return;
      var msgs = {}, over = false;
      Object.keys(d).forEach(function (k) {
        var x = d[k];
        if (!validMsg(x) || (x.f !== me && x.f !== peer)) return;
        if (x.k === "sys") { if (x.f !== me) over = true; return; }
        msgs[k] = { f: x.f, k: x.k, x: typeof x.x === "string" ? x.x.slice(0, 80) : "", s: typeof x.s === "string" ? x.s.slice(0, 30) : "", t: x.t };
      });
      if (over || !Object.keys(msgs).length) return;     // 이미 끝난 대화면 열지 않음
      var c = buildChat(peer, m.name, msgs, lastLis[peer]);
      c.sawServer = true;
    }).catch(function () {});
  }
  function syncChats(lis, list) {
    lastLis = lis;
    var byId = {};
    list.forEach(function (m) { byId[m.id] = m; });
    Object.keys(chats).forEach(function (peer) {
      var c = chats[peer], li = lis[peer], m = byId[peer];
      if (!li || !m) { endChat(peer, chatNoticeText(c, "gone")); return; }
      c.li = li; c.nameEl.textContent = m.name;
      if (isLive(m)) endChat(peer, chatNoticeText(c, "exam"));      // 상대가 실모를 시작한 것을 목록에서 먼저 알아챈 경우
      if (!c.ended || chats[peer]) placeNear(c.el, li);
    });
    invites.slice().forEach(function (iv) { handleInvite(iv, lis, byId); });
    Object.keys(pendingRestore).forEach(function (peer) { restoreChat(peer, pendingRestore, lis, byId); });
  }
  function restoreChat(peer, pending, lis, byId) {
    var m = byId[peer], li = lis[peer], opened = pending[peer];
    if (chats[peer]) { delete pending[peer]; return; }
    if (!m || !li) { if (pulled) { delete pending[peer]; saveChats(); } return; }       // 아직 목록을 못 받았으면 기다리고, 받았는데 없으면(상대가 나감) 포기
    delete pending[peer];
    if (!room || chatBlocked || isLive(m)) { saveChats(); return; }                       // 상대가 지금 시험 중이면 대화는 끝난 것
    var code = room.code, me = getDeviceId();
    dbFetch(chatNode(code, peer), { cache: "no-store" }).then(function (d) {
      if (chats[peer] || !room || room.code !== code || !lastLis[peer]) return;
      var msgs = {}, over = false;
      if (d && typeof d === "object") Object.keys(d).forEach(function (k) {
        var x = d[k];
        if (!validMsg(x) || (x.f !== me && x.f !== peer)) return;
        if (x.k === "sys") { if (x.f !== me) over = true; return; }
        msgs[k] = { f: x.f, k: x.k, x: typeof x.x === "string" ? x.x.slice(0, 80) : "", s: typeof x.s === "string" ? x.s.slice(0, 30) : "", t: x.t };
      });
      if (over || !Object.keys(msgs).length) { saveChats(); return; }                    // 상대가 닫았거나 이미 정리된 대화는 다시 열지 않음
      var c = buildChat(peer, m.name, msgs, lastLis[peer]);
      c.sawServer = true; c.opened = opened;
      saveChats();
    }).catch(function () {});
  }

  function closePhotoZoom() { var o = $("photoZoom"); if (o && o.parentNode) o.parentNode.removeChild(o); }
  function openPhotoZoom(src) {                       // 프로필 사진을 눌렀을 때 크게 보기 (아무 데나 누르면 닫힘)
    closePhotoZoom();
    var o = el("div"); o.id = "photoZoom";
    var im = el("img"); im.src = src; im.alt = "";
    o.appendChild(im); o.addEventListener("click", function (e) { e.stopPropagation(); closePhotoZoom(); });
    document.body.appendChild(o);
    requestAnimationFrame(function () { o.classList.add("on"); });
  }
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePhotoZoom(); });
  function openProfile(m, anchor) {
    var pop = $("profilePop");
    pop.textContent = "";
    clearOpenMark(); anchor.classList.add("open");      // 열려 있는 동안 카드 윤곽을 파랗게 유지
    profileKey = m.uid; profileM = m;
    var top = el("div", "pTop"), wrap = el("div", "avWrap"), av = el("div", "avatar"), who = el("div", "pWho"), nm = el("div", "pName", m.name);
    fillAvatar(av, m); wrap.appendChild(av);
    av.addEventListener("click", function (e) { var im = av.querySelector("img"); if (!im) return; e.stopPropagation(); openPhotoZoom(im.src); });
    if (hostId && m.id === hostId) {                    // 방장: 사진 오른쪽 위에 왕관
      var bc = el("span", "avCrown"); bc.innerHTML = CROWN_SVG; bc.setAttribute("title", "방장");
      wrap.appendChild(bc);
    }
    if (m.me) {                                         // 내 프로필: 사진 오른쪽 아래에 작은 동그란 펜 버튼
      var pen = el("button", "avPen");
      pen.type = "button"; pen.innerHTML = PEN_ICON;
      pen.setAttribute("aria-label", "프로필 사진 편집"); pen.setAttribute("title", "프로필 사진 편집");
      pen.addEventListener("click", function (e) {
        e.stopPropagation();
        if (penMenuOpen) closePenMenu(); else { penMenuOpen = true; buildPenMenu(wrap); }
      });
      wrap.appendChild(pen);
      if (penMenuOpen) buildPenMenu(wrap);
      nm.appendChild(el("span", "metag", "나"));
    }
    who.appendChild(nm);
    who.appendChild(el("div", "pSub", "오늘 " + m.total + "개 응시"));
    top.appendChild(wrap); top.appendChild(who);
    pop.appendChild(top);
    pop.appendChild(el("div", "pSec", "오늘의 응시"));
    if (m.subs.length) {
      m.subs.forEach(function (c) {
        var row = el("div", "pRow"), dot = el("span", "cdot");
        dot.style.background = SUBJECT_COLORS[c.name] || "#9aa0aa";
        row.appendChild(dot); row.appendChild(el("span", "", c.name)); row.appendChild(el("span", "c", c.count + "회"));
        pop.appendChild(row);
      });
    } else pop.appendChild(el("div", "pRow none", "아직 응시 전이에요"));
    if (!m.me && isLive(m)) {                           // 지금 시험 중: 녹화 중 느낌의 "응시 중" 표시
      var rmin = liveMin(m), rec = el("div", "pRec"), rh = el("div", "pRecHead");
      rh.appendChild(el("span", "rdot")); rh.appendChild(el("span", "", m.live.e === 1 ? "추가 시간" : "응시 중"));
      rec.appendChild(rh);
      rec.appendChild(el("div", "pRecSub", m.live.s + " · " + (rmin < 1 ? "방금 시작" : rmin + "분 경과")));
      pop.appendChild(rec);
    } else {                                            // 응시 중이 아님
      pop.appendChild(el("div", "pIdle", "현재 응시중이 아닙니다"));
      if (!m.me && justDone(m) && !chats[m.id]) {       // 방금(5분 이내) 끝냈다면: 점수 물어보기 (이미 대화 중이면 안 띄움)
        var aw = el("div", "pAskWrap"), already = asked[m.id] && Date.now() - asked[m.id] < 300000, blocked = askBlocked(m);
        aw.appendChild(el("div", "pAskSub", "방금 친 시험 · " + m.live.s + (blocked ? (resolved[m.id].k === "decline" ? " · 답변을 거절했어요" : " · 이미 답을 받았어요") : "")));
        var ab = el("button", "pAsk", already && !blocked ? "물어봤어요" : "점수 물어보기");
        ab.type = "button"; ab.disabled = !!already || blocked;
        ab.addEventListener("click", function (e) { e.stopPropagation(); askScore(m); });
        aw.appendChild(ab);
        pop.appendChild(aw);
      }
    }
    if (!m.me) {                                        // 다른 사람 프로필: 점수 염탐하기
      var sb = el("button", "pSpy", spyKey === m.uid ? "염탐 그만하기" : "점수 염탐하기");
      sb.type = "button";
      sb.addEventListener("click", function (e) { e.stopPropagation(); toggleSpy(m); });
      pop.appendChild(sb);
    }
    if (isHost() && !m.me) {                            // 방장만, 다른 사람의 프로필에서: 방장 넘기기(아이콘) + 추방
      var acts = el("div", "pActs"), xf = el("button", "pAct xfer"), kk = el("button", "pAct kick", "추방");
      xf.type = "button"; kk.type = "button";
      xf.innerHTML = '<span class="cr">' + CROWN_SVG + '</span>' + ARROW_SVG;
      xf.setAttribute("aria-label", "방장 권한 넘기기"); xf.setAttribute("title", "방장 권한 넘기기");
      xf.addEventListener("click", function (e) { e.stopPropagation(); transferHost(m); });
      kk.addEventListener("click", function (e) { e.stopPropagation(); kickMember(m); });
      acts.appendChild(xf); acts.appendChild(kk);
      pop.appendChild(acts);
    }
    if (m.me && (photoBlocked || liveBlocked || hostBlocked)) pop.appendChild(el("div", "pNote", "친구들에게 사진·응시 상태·방장 표시를 보여 주려면 서버 규칙 업데이트가 필요해요."));
    placeProfile(anchor);
    syncSpy(m);
    loadFriendPhoto(m);
  }

