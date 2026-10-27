// Учениците: екранът „Кой свири?“ и напредъкът на всеки ученик (пази се в progress.json от Python).

// Зарежда списъка с ученици. Връща името на последно избрания ученик (или null).
async function loadStudents() {
  const info = await state.api.get_students();
  state.students = info.students;
  return info.last;
}

// Дали има ученик с това име
function hasStudent(name) {
  for (const student of state.students) {
    if (student.name === name) return true;
  }
  return false;
}

// Избира ученик, зарежда неговите отметки и отваря уроците
async function selectStudent(name) {
  state.stars = await state.api.select_student(name);
  state.student = name;
  openLessons();
}

// Преначертава екрана с учениците след промяна (ново име, изтриване…)
async function refreshStudents(patch) {
  await loadStudents();
  go("students", patch);
}

/* ---------- Екран „Кой свири?“ ---------- */

function renderStudents() {
  // учениците по азбучен ред
  const students = state.students.slice();
  students.sort((a, b) => a.name.localeCompare(b.name, "bg"));

  let cards = "";
  for (const student of students) {
    const name = esc(student.name);
    if (state.editing === student.name) {
      // кутия за преименуване
      cards += `
        <div class="card student-card">
          <input class="name-input" id="renameInput" value="${name}" maxlength="40">
          <div class="student-actions">
            <button class="pill" data-cancel>Отказ</button>
            <button class="primary" data-save>Запази</button>
          </div>
        </div>`;
    } else if (state.deleting === student.name) {
      // питаме още веднъж, преди да изтрием
      cards += `
        <div class="card student-card">
          <span class="card-title">Да изтрия ли ${name}?</span>
          <span class="muted small">Отметките на ученика ще се загубят.</span>
          <div class="student-actions">
            <button class="pill" data-cancel>Не</button>
            <button class="primary danger" data-confirm-delete>Изтрий</button>
          </div>
        </div>`;
    } else {
      cards += `
        <div class="card student-card">
          <button class="student-pick" data-pick="${name}">
            <span class="card-title">${name}</span>
            <span class="muted small">${doneText(student.done)}</span>
          </button>
          <div class="student-tools">
            <button class="back" data-edit="${name}">Преименувай</button>
            <button class="back" data-delete="${name}">Изтрий</button>
          </div>
        </div>`;
    }
  }

  let back = "";
  if (state.student && hasStudent(state.student)) {
    back = `<button class="back" data-back>‹ Обратно към уроците на ${esc(state.student)}</button>`;
  }

  appEl.innerHTML = `
    ${back}
    <header class="hero">
      <h1>Кой свири?</h1>
      <p class="muted">${students.length ? "Избери ученик, за да видиш докъде е стигнал." : "Добави първия ученик."}</p>
    </header>
    <div class="cards">${cards}</div>
    <form class="add-student" id="addForm">
      <input class="name-input" id="newName" placeholder="Име на нов ученик" maxlength="40">
      <button class="primary" type="submit">+ Добави</button>
    </form>
    <p class="error student-error">${esc(state.studentError)}</p>`;

  if (back) $("[data-back]").onclick = () => openLessons();

  // избор на ученик
  for (const button of appEl.querySelectorAll("[data-pick]")) {
    button.onclick = () => selectStudent(button.dataset.pick);
  }

  // преименуване
  for (const button of appEl.querySelectorAll("[data-edit]")) {
    button.onclick = () => go("students", { editing: button.dataset.edit, deleting: null, studentError: "" });
  }
  const renameInput = $("#renameInput");
  if (renameInput) {
    renameInput.focus();
    renameInput.select();
    const save = async () => {
      const oldName = state.editing;
      const newName = renameInput.value.trim();
      const error = await state.api.rename_student(oldName, newName);
      if (error) {
        go("students", { studentError: error });
        return;
      }
      if (state.student === oldName) state.student = newName;
      refreshStudents({ editing: null, studentError: "" });
    };
    $("[data-save]").onclick = save;
    renameInput.onkeydown = event => {
      if (event.key === "Enter") save();
      if (event.key === "Escape") go("students", { editing: null, studentError: "" });
    };
  }

  // изтриване
  for (const button of appEl.querySelectorAll("[data-delete]")) {
    button.onclick = () => go("students", { deleting: button.dataset.delete, editing: null, studentError: "" });
  }
  const confirmDelete = $("[data-confirm-delete]");
  if (confirmDelete) {
    confirmDelete.onclick = async () => {
      await state.api.delete_student(state.deleting);
      if (state.student === state.deleting) state.student = null;
      refreshStudents({ deleting: null, studentError: "" });
    };
  }

  // „Отказ“ / „Не“
  const cancel = $("[data-cancel]");
  if (cancel) cancel.onclick = () => go("students", { editing: null, deleting: null, studentError: "" });

  // нов ученик
  $("#addForm").onsubmit = async event => {
    event.preventDefault();
    const name = $("#newName").value.trim();
    const error = await state.api.add_student(name);
    if (error) {
      go("students", { studentError: error });
      return;
    }
    refreshStudents({ studentError: "" });
  };
  if (!state.editing) $("#newName").focus();
}

// „3 изсвирени примера“, „1 изсвирен пример“, „Още нищо не е изсвирено“
function doneText(done) {
  if (done === 0) return "Още нищо не е изсвирено";
  if (done === 1) return "1 изсвирен пример";
  return done + " изсвирени примера";
}
