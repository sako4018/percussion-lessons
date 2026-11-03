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

// Напредъкът в браузър се пази в localStorage (в програмата го пази Python)
const BROWSER_PROGRESS_KEY = "percussion-progress";

function loadBrowserProgress() {
  try {
    return JSON.parse(localStorage.getItem(BROWSER_PROGRESS_KEY)) || {};
  } catch (error) {
    return {};
  }
}

function saveBrowserProgress(stars) {
  try {
    localStorage.setItem(BROWSER_PROGRESS_KEY, JSON.stringify(stars));
  } catch (error) {
    // няма достъп до localStorage – напредъкът важи само за този път
  }
}

// Взема уроците от Python, а в браузър - от файла
async function loadData() {
  if (state.api) {
    state.data = await state.api.get_lessons();
    state.stars = await state.api.get_progress();
    return;
  }
  const response = await fetch("lessons.json");
  state.data = await response.json();
  state.stars = loadBrowserProgress();
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
