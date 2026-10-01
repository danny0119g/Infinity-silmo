// [scoreask.js] 점수 물어보기와 답장
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 점수 물어보기: 질문한 사람의 카드 옆에 말풍선이 뜨고, 눌러서 아무 말이나 적어 보내면 그대로 답장이 감
  function askScore(m) {
    if (!room || !m.live || chats[m.id] || askBlocked(m)) return;
    var code = room.code, now = Math.floor(Date.now() / 1000), subj = m.live.s;
    asked[m.id] = Date.now(); askMeta[m.id] = { s: subj, t: now };
    keepPageScroll(renderTogether);
    enqueue(function () {
      return dbFetch(ROOMS_ROOT + code + "/msgs/" + m.id + "/" + getDeviceId(), { method: "PUT", headers: JSONH, body: JSON.stringify({ k: "ask", s: subj, t: now }) })
        .catch(function (err) {
          delete asked[m.id];
          if (err && err.message === "http 401") { msgBlocked = true; notice("서버 규칙을 업데이트해야 점수를 물어볼 수 있어요."); }
          keepPageScroll(renderTogether);
        });
    });
  }
  function dropMsg(it) {
    dismissedMsg[it.from + ":" + it.k + ":" + it.t] = true;
    inbox = inbox.filter(function (x) { return !(x.from === it.from && x.k === it.k && x.t === it.t); });       // 객체가 아니라 (보낸 사람, 종류, 시각)으로 찾음
  }
  function confirmDecline(it, name) {                // 실수로 닫는 일이 없게 한 번 더 확인
    ask(name + "님의 점수 질문을 거절하겠습니까?\n상대에게 거절했다고 알려져요.", "거절", true, function () { declineAsk(it); });
  }
  function declineAsk(it) {
    if (!room) return;
    var code = room.code, me = getDeviceId(), now = Math.floor(Date.now() / 1000);
    dropMsg(it);
    keepPageScroll(renderTogether);
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + me + "/" + it.from, { method: "DELETE" }).catch(function () {}); });
    enqueue(function () {
      return dbFetch(ROOMS_ROOT + code + "/msgs/" + it.from + "/" + me, { method: "PUT", headers: JSONH, body: JSON.stringify({ k: "reply", s: String(it.s || "").slice(0, 30), x: DECLINE_X, t: now }) })
        .catch(function (err) { if (err && err.message === "http 401") notice("서버 규칙을 업데이트하면 상대에게 거절했다고 알릴 수 있어요."); });
    });
  }
  function silentDrop(it) {
    if (!room) return;
    var code = room.code;
    dropMsg(it);
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + getDeviceId() + "/" + it.from, { method: "DELETE" }).catch(function () {}); });
  }
  function dismissMsg(it) {
    if (!room) return;
    var code = room.code;
    dropMsg(it);
    keepPageScroll(renderTogether);
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + getDeviceId() + "/" + it.from, { method: "DELETE" }).catch(function () {}); });
  }
  // 점수 답장 형식: "38|g"  (g=방금 입력한 점수와 같음, y=호머식 점수와 같음, r=다름, n=확인할 점수가 없음)
  var SCORE_FMT = /^(\d{1,2})\|([gyrn])$/;
  function parseScore(x) { var m = SCORE_FMT.exec(x || ""); return m ? { n: Number(m[1]), v: m[2] } : null; }
  var VLABEL = { g: "인증", y: "호머식입니다", r: "거짓말입니다", n: "인증 불가" };
  var VICON = {
    g: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/></svg>',
    r: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    n: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12h7"/></svg>'
  };
  VICON.y = VICON.g;
  // 묻힌 시험(그 과목에서 질문 시각 이전에 시작한 가장 최근 기록)에 내가 시험 끝에 입력한 점수와 비교. 나중에 연필로 채운 점수는 믿을 수 없으므로 제외
  function verifyScore(subject, n, askT) {
    var all = loadAll(), rec = null, limit = (askT || 0) * 1000 + 5000;
    for (var i = all.length - 1; i >= 0; i--) {
      if (recSubject(all[i]) !== subject) continue;
      var st = parseInt(String(all[i].id).slice(0, 8), 36);
      if (isFinite(st) && st > limit) continue;
      rec = all[i]; break;
    }
    if (!rec) return "n";
    var s1 = (rec.score1 != null && !rec.late1) ? rec.score1 : null, s2 = (rec.score2 != null && !rec.late2) ? rec.score2 : null;
    if (s1 == null && s2 == null) return "n";
    if (s1 === n) return "g";
    if (s2 === n) return "y";
    return "r";
  }
  function sendReply(it, raw) {                      // 점수(0~50, "38"/"38점")는 인증 판정을 붙여서, 그 밖의 말은 그대로 보냄. 성공하면 true
    var txt = String(raw).replace(/\s+/g, " ").trim().slice(0, 60);
    if (!room || !txt) return false;
    var x, m = /^(\d{1,2})\s*점?$/.exec(txt);
    if (m && Number(m[1]) <= 50) { var n = Number(m[1]); x = n + "|" + verifyScore(it.s, n, it.t); }
    else {
      x = txt.replace(/\|/g, "｜");                   // 직접 "38|g" 같은 인증 표시를 흉내 내지 못하게 막음
      if (x === DECLINE_X) x = "_decline_";
    }
    var code = room.code, me = getDeviceId(), now = Math.floor(Date.now() / 1000);
    dropMsg(it);
    keepPageScroll(renderTogether);
    enqueue(function () {
      return dbFetch(ROOMS_ROOT + code + "/msgs/" + it.from + "/" + me, { method: "PUT", headers: JSONH, body: JSON.stringify({ k: "reply", s: it.s, x: x, t: now }) })
        .catch(function (err) { if (err && err.message === "http 401") msgBlocked = true; });
    });
    enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/msgs/" + me + "/" + it.from, { method: "DELETE" }).catch(function () {}); });
    return true;
  }
  function buildBubble(it, name) {
    var b = el("div", "bub " + it.k), main, x = el("button", "bubX", "✕");
    x.type = "button"; x.setAttribute("aria-label", "닫기");
    x.addEventListener("click", function (e) { e.stopPropagation(); if (it.k === "ask") confirmDecline(it, name);
      else if (it.k === "reply") ask(name + "님의 답장을 닫겠습니까?\n닫으면 이 답장으로 대화를 시작할 수 없어요.", "닫기", false, function () { dismissMsg(it); });
      else dismissMsg(it); });
    if (it.k === "reply") {
      main = el("button", "bubMain");
      main.type = "button";
      var sc = parseScore(it.x), sub = el("div", "bubS", it.s ? it.s + " · " : "");
      main.appendChild(el("div", "bubQ", name + ": " + (sc ? sc.n + "점" : it.x)));
      if (sc) { sub.appendChild(el("span", "vs v" + sc.v, VLABEL[sc.v])); sub.appendChild(document.createTextNode(" · ")); }
      sub.appendChild(document.createTextNode("눌러서 대화하기"));
      main.appendChild(sub);
      main.addEventListener("click", function (e) { e.stopPropagation(); openChatFromReply(it); });
      b.appendChild(main);
    } else if (it.k === "decline") {
      main = el("div", "bubMain");
      main.appendChild(el("div", "bubQ", name + "님이 답변을 거절했어요"));
      main.appendChild(el("div", "bubS", "다음 시험을 치고 나면 다시 물어볼 수 있어요"));
      b.appendChild(main);
    } else {
      main = el("button", "bubMain");
      main.type = "button";
      main.appendChild(el("div", "bubQ", name + "님이 점수를 물어봤어요"));
      main.appendChild(el("div", "bubS", (it.s ? it.s + " · " : "") + "눌러서 답하기"));
      main.addEventListener("click", function (e) {
        e.stopPropagation();
        var row = el("div", "bubRow"), inp = el("input", "bubIn"), send = el("button", "bubSend", "보내기");
        inp.type = "text"; inp.maxLength = 60; inp.placeholder = "점수나 한마디"; inp.setAttribute("autocomplete", "off");
        inp.addEventListener("input", function () { inp.classList.remove("bad"); });
        send.type = "button";
        function go() { if (!sendReply(it, inp.value)) { inp.classList.add("bad"); inp.focus(); } }       // 비어 있으면 빨간 테두리
        send.addEventListener("click", function (ev) { ev.stopPropagation(); go(); });
        inp.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); go(); } });
        row.appendChild(inp); row.appendChild(send);
        b.replaceChild(row, main);
        placeBubbleByEl(b);
        inp.focus();
      });
      b.appendChild(main);
    }
    b.appendChild(x);
    return b;
  }
  function placeBubble(bb) { placeNear(bb.el, bb.li); }
  function placeBubbleByEl(node) { Object.keys(bubbles).forEach(function (k) { if (bubbles[k].el === node) placeBubble(bubbles[k]); }); }
  function syncBubbles(lis) {
    var layer = $("askLayer"), keep = {}, names = {};
    if (!layer) return;
    Object.keys(lis).forEach(function (id) { var n = lis[id].querySelector(".nm"); names[id] = n ? n.textContent : ""; });
    inbox.forEach(function (it) {
      var li = lis[it.from];
      if (!li) return;
      if (it.k === "ask" && chats[it.from]) { silentDrop(it); return; }              // 이미 대화 중인 사람의 질문은 띄우지 않음
      var key = it.from + ":" + it.k, sig = it.t + "|" + it.k + "|" + it.x, bb = bubbles[key];
      if (!bb || bb.sig !== sig) {
        if (bb) layer.removeChild(bb.el);
        bb = { sig: sig, el: buildBubble(it, names[it.from] || "친구"), li: li };
        bubbles[key] = bb;
        layer.appendChild(bb.el);
      }
      bb.li = li; keep[key] = true;
      placeBubble(bb);
    });
    Object.keys(bubbles).forEach(function (k) {
      if (!keep[k]) { if (bubbles[k].el.parentNode) bubbles[k].el.parentNode.removeChild(bubbles[k].el); delete bubbles[k]; }
    });
  }
  var bubTick = 0;
  function repositionBubbles() {
    if (bubTick) return;
    bubTick = requestAnimationFrame(function () {
      bubTick = 0;
      Object.keys(bubbles).forEach(function (k) { placeBubble(bubbles[k]); });
      Object.keys(chats).forEach(function (p) { placeNear(chats[p].el, chats[p].li); });
    });
  }
  home.addEventListener("scroll", repositionBubbles, { passive: true });
  document.querySelector(".together").addEventListener("scroll", repositionBubbles, { passive: true });
  window.addEventListener("resize", repositionBubbles);

