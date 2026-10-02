// [dialogs.js] 확인 창, 점수 늦게 입력, 과목 선택 창
// 이 파일들은 index.html에 적힌 순서대로 한 덩어리처럼 이어서 실행됩니다. (순서를 바꾸면 안 됨)
  // ---------- 확인 창 ----------
  var modalYes = $("modalYes"), onYes = null, onNo = null;
  var holdSlot = null;                           // 확인 창이 떠 있는 동안 파란 테두리를 유지할 과목 카드
  function releaseHold() { if (holdSlot) { holdSlot.classList.remove("pressing"); holdSlot = null; } }
  function ask(message, yesLabel, danger, cb, noCb) {
    $("modalMsg").textContent = message;
    modalYes.textContent = yesLabel;
    modalYes.classList.toggle("danger", !!danger);
    onYes = cb; onNo = noCb || null;
    modal.classList.add("on");
    $("modalNo").focus();
  }
  function closeAsk() { $("modalNo").textContent = "아니오"; modal.classList.remove("on"); onYes = null; onNo = null; releaseHold(); $("modalNo").classList.remove("hidden"); $("modalMsg").classList.remove("rpt"); }
  function notice(message) { ask(message, "확인", false, null); $("modalNo").classList.add("hidden"); }   // 아니오·Esc 등으로 닫히면 테두리가 원래대로 풀림
  modalYes.addEventListener("click", function () {
    var cb = onYes;
    closeAsk();
    if (cb) cb();
  });
  $("modalNo").addEventListener("click", function () {
    var cb = onNo;
    closeAsk();
    if (cb) cb();
  });

  // ---------- 점수 늦게 입력 (비어 있는 점수에 한 번만) ----------
  // 응시 기록 전체 삭제: 한 과목만 보고 있으면 그 과목 기록만, 전체를 보고 있으면 모든 기록
  $("recClear").addEventListener("click", function () {
    var all = loadView();
    var target = focusSubject ? all.filter(function (r) { return recSubject(r) === focusSubject; }) : all;
    if (!target.length) return;
    var label = focusSubject ? focusSubject + " 기록 " + target.length + "개를 모두 삭제하겠습니까?" : "응시 기록 " + target.length + "개를 모두 삭제하겠습니까?";
    ask(label + "\n되돌릴 수 없습니다.", "모두 삭제", true, function () {
      var gone = {};
      target.forEach(function (r) { gone[r.id] = true; });
      saveAll(loadView().filter(function (r) { return !gone[r.id]; }), viewDayStr());
      clearSelection();
      renderToday();
    });
  });

  var lateTarget = null, lateModal = $("lateModal"), lateInput = $("lateInput"), lateErr = $("lateErr");
  function openLate(id, field, label) {
    lateTarget = { id: id, field: field };
    $("lateTitle").textContent = label;
    lateInput.value = ""; lateErr.textContent = "";
    lateModal.classList.add("on");
    lateInput.focus();
  }
  function closeLate() { lateModal.classList.remove("on"); lateTarget = null; lateInput.blur(); }
  function saveLate() {
    if (!lateTarget) return;
    var v = lateInput.value.trim();
    if (!/^\d{1,2}$/.test(v) || Number(v) > 50) { lateErr.textContent = "0~50 사이의 정수로 입력해 주세요."; return; }
    var all = loadView(), rec = findRec(all, lateTarget.id);
    if (rec && rec[lateTarget.field] == null) {          // 이미 값이 있으면 덮어쓰지 않음 (한 번만)
      rec[lateTarget.field] = Number(v);
      rec[lateTarget.field === "score1" ? "late1" : "late2"] = true;       // 시험 끝에 바로 입력한 점수가 아님
      saveAll(all, viewDayStr());
    }
    closeLate();
    renderToday();
  }
  $("lateSave").addEventListener("click", saveLate);
  $("lateCancel").addEventListener("click", closeLate);
  lateInput.addEventListener("keydown", function (e) { if (e.key === "Enter") saveLate(); });
  lateInput.addEventListener("input", function () { lateInput.value = lateInput.value.replace(/\D/g, ""); lateErr.textContent = ""; });
  lateModal.addEventListener("click", function (e) { if (e.target === lateModal) closeLate(); });

  // ---------- 과목 선택 창 ----------
  // mode "single": 비어 있는 탐1/탐2를 눌렀을 때. 고르면 바로 닫힘
  // mode "edit":   과목 수정하기. 탐1·탐2를 오가며 바꾸고 완료로 닫음
  var pickerSlot = 1, pickerMode = "single";
  function openPicker(slot, mode) {
    pickerSlot = slot; pickerMode = mode;
    $("pickerTabs").classList.toggle("hidden", mode !== "edit");
    $("pickerFoot").classList.toggle("hidden", mode !== "edit");
    renderPicker();
    $("pickerBody").scrollTop = 0;
    picker.classList.add("on");
  }
  function closePicker() { picker.classList.remove("on"); if (normalizeSubjects()) { renderSlots(); renderToday(); } }      // 닫을 때 탐1·탐2 번호 순서를 맞춤
  function renderPicker() {
    var subjects = loadSubjects();
    $("pickerTitle").textContent = pickerMode === "edit" ? "과목 수정" : SLOTS[pickerSlot].label + " 과목 선택";
    [1, 2].forEach(function (s) {
      var ts = $("tabSubj" + s);
      ts.textContent = subjects[s] || "미선택";
      ts.classList.toggle("none", !subjects[s]);
    });
    Array.prototype.forEach.call($("pickerTabs").children, function (b) {
      b.classList.toggle("active", Number(b.getAttribute("data-slot")) === pickerSlot);
    });
    var body = $("pickerBody");
    body.textContent = "";
    SUBJECT_GROUPS.forEach(function (g) {
      body.appendChild(el("h3", "", g.name));
      var grid = el("div", "grid");
      g.list.forEach(function (name) {
        var chip = el("button", "chip" + (subjects[pickerSlot] === name ? " sel" : ""), name);
        chip.addEventListener("click", function () {
          setSubject(pickerSlot, name);
          renderSlots();
          renderToday();
          if (pickerMode === "single") closePicker(); else renderPicker();
        });
        grid.appendChild(chip);
      });
      body.appendChild(grid);
    });
  }
  Array.prototype.forEach.call($("pickerTabs").children, function (b) {
    b.addEventListener("click", function () {
      pickerSlot = Number(b.getAttribute("data-slot"));
      renderPicker();
      $("pickerBody").scrollTop = 0;
    });
  });
  $("pickerClose").addEventListener("click", closePicker);
  $("pickerDone").addEventListener("click", closePicker);
  picker.addEventListener("click", function (e) { if (e.target === picker) closePicker(); });
  $("editSubjects").addEventListener("click", function () { openPicker(1, "edit"); });
  if (normalizeSubjects()) { renderSlots(); }          // 예전에 저장된 선택도 번호 순서에 맞춤
  try { if (!localStorage.getItem("examTimer.slotFix.v1")) { fixRecordSlots(); localStorage.setItem("examTimer.slotFix.v1", "1"); } } catch (e) {}          // 이미 쌓인 기록의 탐1/탐2도 한 번 맞춤
