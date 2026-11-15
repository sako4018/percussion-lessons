// Стартът на програмата и клавишите.

// Чака връзката с Python (pywebview). Ако програмата е отворена направо в браузър — няма връзка.
function waitForApi() {
  return new Promise(resolve => {
    if (window.pywebview && window.pywebview.api && window.pywebview.api.get_lessons) {
      resolve(window.pywebview.api);
      return;
    }
    const timer = setTimeout(() => resolve(null), 1500);
    window.addEventListener("pywebviewready", () => {
      clearTimeout(timer);
      resolve(window.pywebview.api);
    }, { once: true });
  });
}

// Прозорецът „Браво“ е отворен
function isDialogOpen() {
  return document.querySelector(".overlay") !== null;
}

// Пише се в поле
function isTypingInField(event) {
  return Boolean(event.target.matches && event.target.matches("input"));
}

// Клавиши: интервал = свири/спри, стрелките сменят такта
function handleKey(event) {
  if (state.view !== "practice") return;
  if (isDialogOpen()) return;
  if (isTypingInField(event)) return;

  if (event.code === "Space") {
    event.preventDefault();
    play();
  }
  if (event.code === "ArrowLeft") jumpMeasure(state.measure - 1);
  if (event.code === "ArrowRight") jumpMeasure(state.measure + 1);
}

document.addEventListener("keydown", handleKey);

// Взема уроците от Python, а в браузър - от файла
async function loadData() {
  state.data = await state.api.get_lessons();
}

function showLoadError(error) {
  appEl.innerHTML = `<p class="error">Не мога да заредя уроците: ${esc(error.message)}</p>`;
}

// Отваряме последно избрания ученик; ако няма такъв – екрана „Кой свири?“
async function showFirstScreen() {
  const last = await loadStudents();
  if (last && hasStudent(last)) {
    await selectStudent(last);
  } else {
    go("students");
  }
}

async function init() {
  // в програмата учениците ги пази Python, а в браузър – самият браузър (browser-api.js)
  state.api = await waitForApi();
  if (!state.api) state.api = makeBrowserApi();
  try {
    await loadData();
  } catch (error) {
    showLoadError(error);
    return;
  }
  await showFirstScreen();
}

prepareSnares();
init();
animateBall();
