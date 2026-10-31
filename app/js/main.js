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
  if (state.api) {
    state.data = await state.api.get_lessons();
    state.stars = await state.api.get_progress();
    return;
  }
  const response = await fetch("lessons.json");
  state.data = await response.json();
}

function showLoadError(error) {
  appEl.innerHTML = `<p class="error">Не мога да заредя уроците: ${esc(error.message)}</p>`;
}

// С един инструмент отваряме направо списъка с уроци
function showFirstScreen() {
  const instruments = state.data.instruments;
  if (instruments.length === 1) {
    go("instrument", { instId: instruments[0].id });
    return;
  }
  go("home");
}

async function init() {
  state.api = await waitForApi();
  try {
    await loadData();
  } catch (error) {
    showLoadError(error);
    return;
  }
  showFirstScreen();
}

prepareSnares();
init();
animateBall();
