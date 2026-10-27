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

// Клавиши: интервал = свири/спри, стрелките сменят такта
document.addEventListener("keydown", event => {
  if (state.view !== "practice") return;
  if (document.querySelector(".overlay")) return;          // прозорецът „Браво“ е отворен
  if (event.target.matches && event.target.matches("input")) return; // пише се в поле

  if (event.code === "Space") {
    event.preventDefault();
    play();
  }
  if (event.code === "ArrowLeft") jumpMeasure(state.measure - 1);
  if (event.code === "ArrowRight") jumpMeasure(state.measure + 1);
});

async function init() {
  state.api = await waitForApi();
  try {
    if (state.api) {
      state.data = await state.api.get_lessons();
      state.stars = await state.api.get_progress();
    } else {
      const response = await fetch("lessons.json");
      state.data = await response.json();
    }
  } catch (e) {
    appEl.innerHTML = `<p class="error">Не мога да заредя уроците: ${esc(e.message)}</p>`;
    return;
  }

  // с един инструмент отваряме направо списъка с уроци
  if (state.data.instruments.length === 1) {
    go("instrument", { instId: state.data.instruments[0].id });
  } else {
    go("home");
  }
}

prepareSnares();
init();
animateBall();
