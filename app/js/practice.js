// Екранът с упражнението: голям такт, управление и плочки с всички тактове.

// Малките плочки с всички тактове
const TILE_FIGURE_WIDTH = 300;
const TILE_FIGURE_HEIGHT = 130;

// Силата на звука, когато „Звук“ е включен (0 е изключен)
const SOUND_ON_VOLUME = 0.9;

/* ---------- HTML на екрана ---------- */

// Бутоните за примерите (със звезда, ако са свирени докрай)
function exampleButtonsHtml(lesson) {
  let html = "";
  for (let i = 0; i < lesson.parsedExamples.length; i++) {
    let classes = "mode-btn";
    if (i === state.example) classes += " active";
    if (state.stars[state.lessonIdx + "/" + i]) classes += " star";
    html += `<button class="${classes}" data-example="${i}">${i + 1}</button>`;
  }
  return html;
}

// Празните плочки с всички тактове (нотите се рисуват след това)
function tilesHtml() {
  let html = "";
  for (let i = 0; i < getBars().length; i++) {
    html += `<button class="tile" data-m="${i}" aria-label="Такт ${i + 1}"><span class="tile-n">${i + 1}</span><div></div></button>`;
  }
  return html;
}

function topBarHtml(lesson) {
  return `
    <div class="topbar">
      <button class="back" data-back>‹ Всички уроци</button>
      <b class="lesson-name">Урок ${state.lessonIdx + 1} · ${esc(lesson.title)}</b>
      <span class="counter" id="counter"></span>
    </div>
    <div class="example-bar">
      <span class="muted">Пример</span>
      <div class="modes">${exampleButtonsHtml(lesson)}</div>
      <span class="muted small">Размер ${esc(sizeLabel(lesson))}</span>
    </div>`;
}

function stageHtml(look) {
  return `
    <section class="stage">
      <div class="big-wrap">
        <div id="big"></div>
        <div id="hit" class="hit"></div>
        <div id="ball" class="ball">${shapeSvg(look)}</div>
      </div>
      <p id="status" class="status"></p>
    </section>
    <div class="controls">
      <button class="pill" data-prev>‹ Предишен такт</button>
      <button class="primary" id="play">▶ Свири</button>
      <button class="pill" data-next>Следващ такт ›</button>
    </div>`;
}

function optionsHtml() {
  return `
    <div class="options">
      <label class="tempo">Темпо
        <span class="tempo-icon" title="Бавно">${TURTLE}</span>
        <input type="range" id="tempo" min="30" max="160" value="${state.tempo}">
        <span class="tempo-icon" title="Бързо">${HARE}</span>
        <output id="tempoVal">${state.tempo}</output>
      </label>
      <label class="toggle"><input type="checkbox" id="sound" ${state.sound ? "checked" : ""}> Звук</label>
      <label class="toggle"><input type="checkbox" id="metro" ${state.metronome ? "checked" : ""}> Метроном</label>
      <div class="modes" role="group" aria-label="Режим">
        <button class="mode-btn ${state.mode === "auto" ? "active" : ""}" data-mode="auto">Автоматично</button>
        <button class="mode-btn ${state.mode === "manual" ? "active" : ""}" data-mode="manual">Ръчно — аз сменям</button>
      </div>
    </div>`;
}

function tilesPanelHtml() {
  return `
    <section class="panel">
      <h2>Всички тактове</h2>
      <div class="tiles">${tilesHtml()}</div>
    </section>`;
}

function practiceHtml(lesson, look) {
  return topBarHtml(lesson) + stageHtml(look) + optionsHtml() + tilesPanelHtml();
}

/* ---------- Оживяване на бутоните ---------- */

function connectTempoSlider() {
  $("#tempo").oninput = event => {
    state.tempo = Number(event.target.value);
    $("#tempoVal").textContent = state.tempo;
  };
}

function connectSoundCheckbox() {
  $("#sound").onchange = event => {
    state.sound = event.target.checked;
    if (master) master.gain.value = state.sound ? SOUND_ON_VOLUME : 0;
  };
}

function connectMetronomeCheckbox() {
  $("#metro").onchange = event => {
    state.metronome = event.target.checked;
  };
}

function connectControls() {
  $("[data-back]").onclick = () => go("instrument");
  $("[data-prev]").onclick = () => jumpMeasure(state.measure - 1);
  $("[data-next]").onclick = () => jumpMeasure(state.measure + 1);
  $("#play").onclick = play;
  connectTempoSlider();
  connectMetronomeCheckbox();
  connectSoundCheckbox();
}

// Автоматичен / ръчен режим
function connectModeButtons() {
  const modeButtons = appEl.querySelectorAll("[data-mode]");
  for (const button of modeButtons) {
    button.onclick = () => {
      if (state.mode === button.dataset.mode) return;
      stop();
      state.mode = button.dataset.mode;
      for (const other of modeButtons) {
        other.classList.toggle("active", other === button);
      }
    };
  }
}

// Избор на пример
function connectExampleButtons() {
  for (const button of appEl.querySelectorAll("[data-example]")) {
    button.onclick = () => go("practice", { example: Number(button.dataset.example), measure: 0, active: -1 });
  }
}

// Рисува нотите във всяка плочка и оживява кликването
function drawTiles(lesson) {
  const tileButtons = appEl.querySelectorAll(".tile");
  const bars = getBars();
  for (let i = 0; i < tileButtons.length; i++) {
    drawMeasure(tileButtons[i].querySelector("div"), lesson, bars[i], {
      width: TILE_FIGURE_WIDTH,
      height: TILE_FIGURE_HEIGHT,
      showSig: i === 0, // размерът се показва само в първия такт
    });
    tileButtons[i].onclick = () => jumpMeasure(i);
  }
}

function renderPractice() {
  const lesson = getLesson();
  prepareLesson(getInstrument(), lesson);
  const look = lessonLook(state.lessonIdx);
  appEl.style.setProperty("--lesson", look.color);

  appEl.innerHTML = practiceHtml(lesson, look);

  connectControls();
  connectModeButtons();
  connectExampleButtons();
  drawTiles(lesson);
  updateMeasure();
}

/* ---------- Обновяване по време на свирене ---------- */

// Рисува големия такт горе
function drawBig() {
  const container = document.getElementById("big");
  if (!container) return;
  drawMeasure(container, getLesson(), getBars()[state.measure], {
    width: BIG.width,
    height: BIG.height,
    top: BIG.top,
    showSig: BIG.showSig,
    active: state.active,
  });
}

function updateCounter(total) {
  $("#counter").textContent = "Пример " + (state.example + 1) + " · Такт " + (state.measure + 1) + " от " + total;
}

// Тактът, който се свири в момента, е отбелязан в плочките
function highlightCurrentTile() {
  const tileButtons = appEl.querySelectorAll(".tile");
  for (let i = 0; i < tileButtons.length; i++) {
    const isCurrent = i === state.measure;
    tileButtons[i].classList.toggle("current", isCurrent);
    if (isCurrent) tileButtons[i].setAttribute("aria-current", "true");
    else tileButtons[i].removeAttribute("aria-current");
  }
}

// Обновява всичко, което зависи от текущия такт
function updateMeasure() {
  const total = getBars().length;
  drawBig();
  updateCounter(total);
  highlightCurrentTile();
  $("[data-prev]").disabled = state.measure === 0;
  $("[data-next]").disabled = state.measure === total - 1;
}

// Сменя надписа на бутона Свири / Спри
function updatePlayButton() {
  const button = document.getElementById("play");
  if (!button) return;
  button.textContent = state.playing ? "■ Спри" : "▶ Свири";
  button.classList.toggle("playing", state.playing);
}

// Текстът под нотите (отброяване, номер на времето…)
function setStatus(text) {
  const statusElement = document.getElementById("status");
  if (statusElement) statusElement.textContent = text;
}
