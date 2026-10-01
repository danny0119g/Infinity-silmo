// [profile.js] 프로필 창, 점수 염탐, 프로필 사진, 방장 기능
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // 프로필 (초안): 닉네임을 누르면 그 카드 옆에 작은 창이 뜸
  var profileKey = "";
  var AV_COLORS = ["#4f7cff", "#2fa37a", "#c46a3a", "#a0527c", "#7a62c9", "#3b8aa6", "#8a8f3a", "#c25757"];
  function avatarColor(name) { var h = 0; for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
  var CROWN_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.6 4.2L12 5l4.4 7.2L21 8l-1.8 10H4.8L3 8z"/><rect x="5" y="19.5" width="14" height="2" rx="1"/></svg>';
  var ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function isHost() { return !!hostId && hostId === getDeviceId(); }
  // 점수 염탐: 그 친구의 점수 추이 그래프가 프로필 창 옆에 뜸
  var spyKey = "";
  function hideSpy() { var sp = $("spyPop"); if (sp) sp.classList.remove("on"); }
  function placeSpy() {
    var sp = $("spyPop"), pp = $("profilePop");
    if (!sp.classList.contains("on") || !pp.classList.contains("on")) return;
    var pr = pp.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, w = sp.offsetWidth, h = sp.offsetHeight, G = 10, x, y = pr.top;
    if (pr.left - G - w >= 8) x = pr.left - G - w;
    else if (pr.right + G + w <= vw - 8) x = pr.right + G;
    else { x = Math.min(Math.max(8, pr.left), vw - w - 8); y = pr.bottom + 8; if (y + h > vh - 8) y = pr.top - h - 8; }
    y = Math.max(8, Math.min(y, vh - h - 8));
    sp.style.left = Math.round(x) + "px"; sp.style.top = Math.round(y) + "px";
  }
  function renderSpy(m) {
    var sp = $("spyPop");
    sp.textContent = "";
    sp.classList.add("on");
    sp.appendChild(el("div", "spyTitle", m.name + "님의 점수 추이"));
    if (!m.shared) { sp.appendChild(el("div", "spyMsg", "이 친구는 점수를 공개하지 않았어요")); return; }
    var data = (m.series || []).filter(function (x) { return x.v.some(function (p) { return p.a != null || p.b != null; }); });
    if (!data.length) { sp.appendChild(el("div", "spyMsg", "아직 입력한 점수가 없어요")); return; }
    var W = 332, H = 220, L = 30, R = 14, T = 16, B = 28, maxN = 1, lo = 50, hi = 50, count = 0;
    data.forEach(function (x) {
      if (x.v.length > maxN) maxN = x.v.length;
      x.v.forEach(function (p) { [p.a, p.b].forEach(function (v) { if (v != null) { if (v < lo) lo = v; count++; } }); });
    });
    lo = Math.max(0, Math.floor((lo - 4) / 5) * 5);
    if (hi - lo < 10) lo = hi - 10;
    var step = (hi - lo) > 25 ? 10 : 5, gw = W - L - R, gh = H - T - B;
    function X(n) { return maxN === 1 ? L + gw / 2 : L + (n - 1) * gw / (maxN - 1); }
    function Y(v) { return T + (hi - v) / (hi - lo) * gh; }
    var svg = svgEl("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, role: "img", "aria-label": m.name + "님의 점수 추이" });
    for (var t = Math.ceil(lo / step) * step; t <= hi; t += step) {
      svg.appendChild(svgEl("line", { x1: L, x2: W - R, y1: Y(t), y2: Y(t), stroke: "#3a3e46", "stroke-width": 1 }));
      var yl = svgEl("text", { x: L - 6, y: Y(t) + 4, "text-anchor": "end", "font-size": 11, fill: "#9aa0aa" }); yl.textContent = t; svg.appendChild(yl);
    }
    var every = Math.max(1, Math.ceil(30 / (maxN > 1 ? gw / (maxN - 1) : 100)));
    for (var n = 1; n <= maxN; n += every) {
      var xl = svgEl("text", { x: X(n), y: H - 8, "text-anchor": "middle", "font-size": 11, fill: "#9aa0aa" }); xl.textContent = n + "회"; svg.appendChild(xl);
    }
    var showAll = count <= 16;
    data.forEach(function (x) {
      var col = SUBJECT_COLORS[x.s] || "#9aa0aa", pts = [];
      x.v.forEach(function (p, i) { if (p.a != null) pts.push({ n: i + 1, a: p.a, b: p.b }); else if (p.b != null) pts.push({ n: i + 1, a: null, b: p.b }); });
      var line = pts.filter(function (p) { return p.a != null; });
      if (line.length > 1) svg.appendChild(svgEl("polyline", { points: line.map(function (p) { return X(p.n).toFixed(1) + "," + Y(p.a).toFixed(1); }).join(" "), fill: "none", stroke: col, "stroke-width": 2.4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      pts.forEach(function (p, idx) {
        if (p.b != null) {                                // 호머식 점수: 연한 속 빈 점 + 점선
          if (p.a != null) svg.appendChild(svgEl("line", { x1: X(p.n), x2: X(p.n), y1: Y(p.a), y2: Y(p.b), stroke: lighten(col, 0.5), "stroke-width": 1.4, "stroke-dasharray": "3 3" }));
          svg.appendChild(svgEl("circle", { cx: X(p.n), cy: Y(p.b), r: 4, fill: "#1b1d21", stroke: lighten(col, 0.5), "stroke-width": 2 }));
        }
        if (p.a != null) {
          svg.appendChild(svgEl("circle", { cx: X(p.n), cy: Y(p.a), r: 4.4, fill: col, stroke: "#1b1d21", "stroke-width": 2 }));
          if (showAll || idx === pts.length - 1) {
            var tx = svgEl("text", { x: X(p.n), y: Y(p.a) - 9, "text-anchor": "middle", "font-size": 11, "font-weight": 700, fill: col, stroke: "#1b1d21", "stroke-width": 3, "paint-order": "stroke" });
            tx.textContent = p.a; svg.appendChild(tx);
          }
        }
      });
    });
    sp.appendChild(svg);
    var lg = el("div", "spyLegend");
    data.forEach(function (x) { var it = el("span", "", x.s), sw = el("i"); sw.style.background = SUBJECT_COLORS[x.s] || "#9aa0aa"; it.insertBefore(sw, it.firstChild); lg.appendChild(it); });
    sp.appendChild(lg);
  }
  function syncSpy(m) {                                // 프로필이 다시 그려질 때마다 그래프도 같이 갱신/위치 조정
    if (!m.me && spyKey === m.uid) { renderSpy(m); placeSpy(); } else { hideSpy(); }
  }
  function toggleSpy(m) { spyKey = (spyKey === m.uid) ? "" : m.uid; keepPageScroll(renderTogether); }
  function clearOpenMark() { Array.prototype.forEach.call(document.querySelectorAll(".mem.open"), function (x) { x.classList.remove("open"); }); }
  function closeProfile() {
    profileKey = ""; profileM = null; penMenuOpen = false; spyKey = ""; hideSpy();
    var p = $("profilePop"); if (p) p.classList.remove("on");
    clearOpenMark();
  }
  function liveMin(m) { var min = Math.floor((Date.now() / 1000 - m.live.t) / 60); return min < 0 ? 0 : min; }
  function isLive(m) { return !!m.live && (m.live.e === 0 || m.live.e === 1) && liveMin(m) <= 90; }          // 오래된 상태는 무시 (앱이 꺼진 채 남은 경우)
  function justDone(m) { return !!m.live && m.live.e === 2 && (Date.now() / 1000 - m.live.t) <= 300; }       // 끝난 지 5분 이내
  function liveText(m) {
    if (!isLive(m)) return "";
    var min = liveMin(m);
    return (m.live.e === 1 ? "추가 시간" : "응시 중") + " · " + m.live.s + " · " + (min < 1 ? "방금 시작" : min + "분 경과");
  }

  // 프로필 사진 (작은 JPEG, 기기에 저장 + 방 서버의 photos 칸에 올림)
  var PHOTO_KEY = "examTimer.photo.v1", memPhoto = "";
  function validPhoto(p) { return typeof p === "string" && p.length <= 12000 && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(p); }
  function loadPhoto() { var p = ""; try { p = localStorage.getItem(PHOTO_KEY) || ""; } catch (e) {} if (!p) p = memPhoto; return validPhoto(p) ? p : ""; }
  var photo = loadPhoto();
  function savePhoto(p) { memPhoto = p; photo = p; try { localStorage.setItem(PHOTO_KEY, p); } catch (e) {} }
  function applyPhoto(data) {
    if (room) setPhotoUse(room.code, true);           // 새로 고른 사진은 이 방에서 바로 사용
    savePhoto(data); photoSentBy = {}; photoBlocked = false;
    keepPageScroll(renderTogether);
    enqueue(function () { return pushPhoto(true); }).then(function () { keepPageScroll(renderTogether); });
    rooms.forEach(function (r) { if (!room || r.code !== room.code) enqueue(function () { return pushPhoto(true, r); }); });      // 다른 방에도 (사진을 쓰기로 한 방만)
  }
  function removePhoto() {
    closePenMenu();
    photo = ""; memPhoto = ""; photoSentBy = {};
    try { localStorage.removeItem(PHOTO_KEY); } catch (e) {}
    rooms.forEach(function (r) { enqueue(function () { return dbFetch(ROOMS_ROOT + r.code + "/photos/" + getDeviceId(), { method: "DELETE" }).catch(function () {}); }); });
    keepPageScroll(renderTogether);
  }
  function fillAvatar(av, m) {
    av.textContent = "";
    var src = m.me ? (photoUsable() ? photo : "") : ((photoCache[m.uid] || {}).data || "");
    if (src && validPhoto(src)) {
      var im = el("img"); im.src = src; im.alt = "";
      av.appendChild(im); av.style.background = "#111214";
    } else {
      av.textContent = m.name.charAt(0); av.style.background = avatarColor(m.name);
    }
  }
  var photoBusy = {};
  function refreshListAvatars(uid) {                  // 목록 카드의 사진을 새로 받은 사진으로 바꿈
    var avs = document.querySelectorAll('.memAv[data-uid="' + uid + '"]');
    for (var i = 0; i < avs.length; i++) fillAvatar(avs[i], { uid: uid, me: false, name: avs[i].getAttribute("data-name") || "?" });
  }
  function loadFriendPhoto(m) {                       // 친구 사진을 가져옴 (목록은 5분, 프로필을 열면 1분 지난 것부터 다시)
    if (m.me || !room) return;
    var c = photoCache[m.uid], uid = m.uid, code = room.code;
    if ((c && Date.now() - c.t < 60000) || photoBusy[uid]) return;
    photoBusy[uid] = true;
    dbFetch(ROOMS_ROOT + code + "/photos/" + uid, { cache: "no-store" }).then(function (d) {
      photoBusy[uid] = false;
      if (!room || room.code !== code) return;
      photoCache[uid] = { data: validPhoto(d) ? d : "", t: Date.now() };
      refreshListAvatars(uid);
      if (profileKey === uid && profileM) { var av = document.querySelector("#profilePop .avatar"); if (av) fillAvatar(av, profileM); }
    }).catch(function () { photoBusy[uid] = false; photoCache[uid] = { data: c ? c.data : "", t: Date.now() - 50000 }; });    // 실패하면 10초 뒤 다시 시도
  }

  // 펜 버튼 옆의 작은 메뉴 (수정 / 삭제)
  function closePenMenu() { penMenuOpen = false; var mn = document.querySelector("#profilePop .penMenu"); if (mn) mn.parentNode.removeChild(mn); }
  function buildPenMenu(wrap) {
    var old = wrap.querySelector(".penMenu"); if (old) wrap.removeChild(old);
    var mn = el("div", "penMenu"), ed = el("button", "pmItem", "프로필 사진 수정");
    ed.type = "button";
    ed.addEventListener("click", function (e) { e.stopPropagation(); closePenMenu(); $("photoInput").click(); });
    mn.appendChild(ed);
    if (photo && room && !photoUsable() && photoUse[room.code] === false) {       // 이 방에서는 안 쓰기로 했던 사진을 다시 쓰고 싶을 때
      var use = el("button", "pmItem", "이 방에서 사진 쓰기");
      use.type = "button";
      use.addEventListener("click", function (e) {
        e.stopPropagation(); closePenMenu();
        setPhotoUse(room.code, true); photoSentBy = {}; photoBlocked = false;
        keepPageScroll(renderTogether);
        enqueue(function () { return pushPhoto(true); }).then(function () { keepPageScroll(renderTogether); });
      });
      mn.appendChild(use);
    }
    if (photo) {
      var del = el("button", "pmItem del", "프로필 사진 삭제");
      del.type = "button";
      del.addEventListener("click", function (e) { e.stopPropagation(); removePhoto(); });
      mn.appendChild(del);
    }
    wrap.appendChild(mn);
  }
  $("profilePop").addEventListener("click", function (e) {
    if (penMenuOpen && !(e.target.closest && e.target.closest(".penMenu, .avPen"))) closePenMenu();
  });

  // 방장 기능: 추방 / 방장 넘기기 (새 구조에서는 서버 규칙이 방장만 가능하게 막고, 옛 구조에서는 앱 화면에서만 지켜져요)
  function kickMember(m) {
    ask(m.name + "님을 추방하겠습니까?", "추방", true, function () {
      if (!room || !isHost()) return;
      var code = room.code, id = m.id;
      others = others.filter(function (x) { return x.id !== id; });
      closeProfile(); keepPageScroll(renderTogether);
      enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/meta/kicked/" + id, { method: "PUT", headers: JSONH, body: "true" }).catch(function () {}); });   // 접속 중인 사람이 알아채고 스스로 나가게
      enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/members/" + id, { method: "DELETE" }).catch(function () {}); });
      enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/photos/" + id, { method: "DELETE" }).catch(function () {}); });
      if (USE_V2) enqueue(function () { return dbFetch(ROOMS_ROOT + code + "/push/" + id, { method: "DELETE" }).catch(function () {}); });
    });
  }
  function transferHost(m) {
    ask(m.name + "님에게 방장을 넘기겠습니까?", "넘기기", false, function () {
      if (!room || !isHost()) return;
      closeProfile();
      enqueue(function () { return putHost(m.id); }).then(function () {
        if (hostId !== m.id) notice("방장을 넘기지 못했어요.\n서버 규칙을 업데이트했는지 확인해 주세요.");
        keepPageScroll(renderTogether);
      });
    });
  }

