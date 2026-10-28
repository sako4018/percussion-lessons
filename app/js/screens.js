// Екраните на програмата: начален, списък с уроци, упражнение и прозорецът „Браво“.

// Размер на голямия такт горе (отгоре има място за подскоците на топчето)
const BIG = { width: 640, height: 170, top: 50, showSig: true };

// Сменя екрана. patch са промени по state, които се правят преди рисуването.
function go(view, patch) {
  stop();
  Object.assign(state, patch || {});
  state.view = view;
  if (view === "home") renderHome();
  if (view === "instrument") renderInstrument();
  if (view === "practice") renderPractice();
  window.scrollTo(0, 0);
}

// Отваря урок с номер k от първия му пример
function openLesson(k) {
  go("practice", {
    lessonIdx: k,
    example: 0,
    measure: 0,
    active: -1,
    tempo: getInstrument().lessons[k].tempo,
  });
}

/* ---------- Начален екран (само ако има повече от един инструмент) ---------- */

function renderHome() {
  let cards = "";
  for (const inst of state.data.instruments) {
    cards += `
      <button class="card" data-inst="${esc(inst.id)}">
        <span class="card-title">${esc(inst.name)}</span>
        <span class="muted">${esc(inst.subtitle)}</span>
        <span class="muted small">${inst.lessons.length} урока</span>
      </button>`;
  }
  appEl.innerHTML = `
    <header class="hero">
      <h1>Уроци по перкусии</h1>
      <p class="muted">Избери инструмент и започни от първия урок.</p>
    </header>
    <div class="cards">${cards}</div>`;

  for (const button of appEl.querySelectorAll("[data-inst]")) {
    button.onclick = () => go("instrument", { instId: button.dataset.inst });
  }
}

/* ---------- Списък с уроци ---------- */

function renderInstrument() {
  const inst = getInstrument();
  const onlyOne = state.data.instruments.length === 1;
  for (const lesson of inst.lessons) prepareLesson(inst, lesson);

  // HTML на всички раздели, всеки със своите кутии
  let sectionsHtml = "";
  for (let n = 0; n < SECTIONS.length; n++) {
    const section = SECTIONS[n];
    let end = inst.lessons.length; // разделът свършва там, където започва следващият
    if (n + 1 < SECTIONS.length) end = SECTIONS[n + 1].from;
    if (section.from >= end) continue;

    let rows = "";
    for (let k = section.from; k < end && k < inst.lessons.length; k++) {
      rows += `
        <button class="row" data-lesson="${k}">
          <span class="badge">${k + 1}</span>
          <span class="row-title">${esc(inst.lessons[k].title)}</span>
          <div class="row-notes"></div>
        </button>`;
    }
    sectionsHtml += `
      <section class="section" style="--lesson:${sectionColor(n)}">
        <h2 class="section-title">${esc(section.title)}</h2>
        <div class="list">${rows}</div>
      </section>`;
  }

  appEl.innerHTML = `
    ${onlyOne ? "" : `<button class="back" data-back>‹ Инструменти</button>`}
    <header class="hero">
      <h1>${esc(inst.name)}</h1>
      <p class="muted">${esc(inst.subtitle)}</p>
    </header>
    ${sectionsHtml}`;

  if (!onlyOne) $("[data-back]").onclick = () => go("home");

  // рисува малката фигура във всяка кутия и оживява кликването
  for (const button of appEl.querySelectorAll("[data-lesson]")) {
    const k = Number(button.dataset.lesson);
    const lesson = inst.lessons[k];
    const isMeterLesson = lesson.title.includes("/8"); // за тях се показва и размерът
    const figure = figureOf(inst, lesson);
    // ширината следва броя ноти, за да стои фигурата в средата
    let width = 50 + figure.length * 26;
    if (isMeterLesson) width += 60;
    drawMeasure(button.querySelector(".row-notes"), lesson, figure, {
      width: width,
      height: 100,
      top: 20,
      showSig: isMeterLesson,
    });
    button.onclick = () => openLesson(k);
  }
}

/* ---------- Упражнение ---------- */

function renderPractice() {
  const lesson = getLesson();
  prepareLesson(getInstrument(), lesson);
  const look = lessonLook(state.lessonIdx);
  appEl.style.setProperty("--lesson", look.color);

  // бутоните за примерите (със звезда, ако са свирени докрай)
  let exampleButtons = "";
  for (let e = 0; e < lesson.parsedExamples.length; e++) {
    let classes = "mode-btn";
    if (e === state.example) classes += " active";
    if (state.stars[state.lessonIdx + "/" + e]) classes += " star";
    exampleButtons += `<button class="${classes}" data-example="${e}">${e + 1}</button>`;
  }

  // празните плочки с всички тактове (нотите се рисуват след това)
  let tiles = "";
  for (let k = 0; k < getBars().length; k++) {
    tiles += `<button class="tile" data-m="${k}" aria-label="Такт ${k + 1}"><span class="tile-n">${k + 1}</span><div></div></button>`;
  }

  appEl.innerHTML = `
    <div class="topbar">
      <button class="back" data-back>‹ Всички уроци</button>
      <b class="lesson-name">Урок ${state.lessonIdx + 1} · ${esc(lesson.title)}</b>
      <span class="counter" id="counter"></span>
    </div>
    <div class="example-bar">
      <span class="muted">Пример</span>
      <div class="modes">${exampleButtons}</div>
      <span class="muted small">Размер ${esc(sizeLabel(lesson))}</span>
    </div>
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
    </div>
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
    </div>
    <section class="panel">
      <h2>Всички тактове</h2>
      <div class="tiles">${tiles}</div>
    </section>`;

  // бутони
  $("[data-back]").onclick = () => go("instrument");
  $("[data-prev]").onclick = () => jumpMeasure(state.measure - 1);
  $("[data-next]").onclick = () => jumpMeasure(state.measure + 1);
  $("#play").onclick = play;

  $("#tempo").oninput = event => {
    state.tempo = Number(event.target.value);
    $("#tempoVal").textContent = state.tempo;
  };
  $("#metro").onchange = event => {
    state.metronome = event.target.checked;
  };
  $("#sound").onchange = event => {
    state.sound = event.target.checked;
    if (master) master.gain.value = state.sound ? 0.9 : 0;
  };

  // автоматичен / ръчен режим
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

  // избор на пример
  for (const button of appEl.querySelectorAll("[data-example]")) {
    button.onclick = () => go("practice", { example: Number(button.dataset.example), measure: 0, active: -1 });
  }

  // малките плочки с всички тактове
  const tileButtons = appEl.querySelectorAll(".tile");
  for (let k = 0; k < tileButtons.length; k++) {
    drawMeasure(tileButtons[k].querySelector("div"), lesson, getBars()[k], {
      width: 300,
      height: 130,
      showSig: k === 0,
    });
    tileButtons[k].onclick = () => jumpMeasure(k);
  }
  updateMeasure();
}

// Рисува големия такт горе
function drawBig() {
  const el = document.getElementById("big");
  if (!el) return;
  drawMeasure(el, getLesson(), getBars()[state.measure], {
    width: BIG.width,
    height: BIG.height,
    top: BIG.top,
    showSig: BIG.showSig,
    active: state.active,
  });
}

// Обновява всичко, което зависи от текущия такт
function updateMeasure() {
  const total = getBars().length;
  drawBig();
  $("#counter").textContent = "Пример " + (state.example + 1) + " · Такт " + (state.measure + 1) + " от " + total;
  const tileButtons = appEl.querySelectorAll(".tile");
  for (let k = 0; k < tileButtons.length; k++) {
    tileButtons[k].classList.toggle("current", k === state.measure);
    if (k === state.measure) tileButtons[k].setAttribute("aria-current", "true");
    else tileButtons[k].removeAttribute("aria-current");
  }
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
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

/* ---------- Прозорец „Браво“ ---------- */

// Показва се, когато примерът е изсвирен от първия до последния такт
function finishLesson() {
  const inst = getInstrument();
  const lessonIdx = state.lessonIdx;
  const example = state.example;
  const lesson = getLesson();

  // запомняме напредъка и слагаме звезда на бутона на примера
  state.stars[lessonIdx + "/" + example] = true;
  if (state.api) state.api.save_progress(state.stars);
  const exampleButton = appEl.querySelector('[data-example="' + example + '"]');
  if (exampleButton) exampleButton.classList.add("star");

  // какво предлага бутонът вдясно: следващ пример, следващ урок или към списъка
  let nextButton = `<button class="primary" data-list>Към уроците</button>`;
  if (example < lesson.parsedExamples.length - 1) {
    nextButton = `<button class="primary" data-next-example>Пример ${example + 2} ›</button>`;
  } else if (lessonIdx < inst.lessons.length - 1) {
    nextButton = `<button class="primary" data-next-lesson>Урок ${lessonIdx + 2} ›</button>`;
  }

  const look = lessonLook(lessonIdx);
  const dialog = document.createElement("div");
  dialog.className = "overlay";
  dialog.innerHTML = `
    <div class="dialog">
      <div class="hero-shape">${shapeSvg(look)}</div>
      <h2>Браво!</h2>
      <p class="muted">Край на пример ${example + 1} · Урок ${lessonIdx + 1} · ${esc(lesson.title)}.</p>
      <div class="dialog-actions">
        <button class="pill" data-again>Още веднъж</button>
        ${nextButton}
      </div>
    </div>`;
  document.body.appendChild(dialog);
  celebrate(look.color);
  playTada();

  dialog.querySelector("[data-again]").onclick = () => {
    dialog.remove();
    setMeasure(0);
  };
  const nextExample = dialog.querySelector("[data-next-example]");
  if (nextExample) {
    nextExample.onclick = () => {
      dialog.remove();
      go("practice", { example: example + 1, measure: 0, active: -1 });
    };
  }
  const nextLesson = dialog.querySelector("[data-next-lesson]");
  if (nextLesson) {
    nextLesson.onclick = () => {
      dialog.remove();
      openLesson(lessonIdx + 1);
    };
  }
  const toList = dialog.querySelector("[data-list]");
  if (toList) {
    toList.onclick = () => {
      dialog.remove();
      go("instrument");
    };
  }
}
