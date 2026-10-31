// Екраните на програмата: начален и списък с уроци.
// Упражнението е в practice.js, прозорецът „Браво“ е в bravo.js.

// Размер на голямия такт горе (отгоре има място за подскоците на топчето)
const BIG = { width: 640, height: 170, top: 50, showSig: true };

// Размери на малката фигура в кутията на урока
const LESSON_FIGURE_HEIGHT = 100;
const LESSON_FIGURE_TOP = 20;
const FIGURE_BASE_WIDTH = 50;
const FIGURE_WIDTH_PER_NOTE = 26;
const FIGURE_METER_EXTRA_WIDTH = 60;

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

// Отваря урок с дадения номер от първия му пример
function openLesson(lessonIndex) {
  go("practice", {
    lessonIdx: lessonIndex,
    example: 0,
    measure: 0,
    active: -1,
    tempo: getInstrument().lessons[lessonIndex].tempo,
  });
}

/* ---------- Начален екран (само ако има повече от един инструмент) ---------- */

function instrumentCardHtml(instrument) {
  return `
      <button class="card" data-inst="${esc(instrument.id)}">
        <span class="card-title">${esc(instrument.name)}</span>
        <span class="muted">${esc(instrument.subtitle)}</span>
        <span class="muted small">${instrument.lessons.length} урока</span>
      </button>`;
}

function renderHome() {
  let cardsHtml = "";
  for (const instrument of state.data.instruments) {
    cardsHtml += instrumentCardHtml(instrument);
  }
  appEl.innerHTML = `
    <header class="hero">
      <h1>Уроци по перкусии</h1>
      <p class="muted">Избери инструмент и започни от първия урок.</p>
    </header>
    <div class="cards">${cardsHtml}</div>`;

  for (const button of appEl.querySelectorAll("[data-inst]")) {
    button.onclick = () => go("instrument", { instId: button.dataset.inst });
  }
}

/* ---------- Списък с уроци ---------- */

function lessonRowHtml(lesson, lessonIndex) {
  return `
        <button class="row" data-lesson="${lessonIndex}">
          <span class="badge">${lessonIndex + 1}</span>
          <span class="row-title">${esc(lesson.title)}</span>
          <div class="row-notes"></div>
        </button>`;
}

// Разделът свършва там, където започва следващият (или с последния урок)
function sectionEnd(sectionIndex, lessonCount) {
  const nextIndex = sectionIndex + 1;
  if (nextIndex < SECTIONS.length) return SECTIONS[nextIndex].from;
  return lessonCount;
}

// Връща "" за празен раздел
function sectionHtml(instrument, sectionIndex) {
  const section = SECTIONS[sectionIndex];
  const lessonCount = instrument.lessons.length;
  const end = sectionEnd(sectionIndex, lessonCount);
  if (section.from >= end) return "";

  let rowsHtml = "";
  for (let i = section.from; i < end && i < lessonCount; i++) {
    rowsHtml += lessonRowHtml(instrument.lessons[i], i);
  }
  return `
      <section class="section" style="--lesson:${sectionColor(sectionIndex)}">
        <h2 class="section-title">${esc(section.title)}</h2>
        <div class="list">${rowsHtml}</div>
      </section>`;
}

function allSectionsHtml(instrument) {
  let html = "";
  for (let i = 0; i < SECTIONS.length; i++) {
    html += sectionHtml(instrument, i);
  }
  return html;
}

function instrumentHtml(instrument, hasBackButton) {
  const backHtml = hasBackButton ? `<button class="back" data-back>‹ Инструменти</button>` : "";
  return `
    ${backHtml}
    <header class="hero">
      <h1>${esc(instrument.name)}</h1>
      <p class="muted">${esc(instrument.subtitle)}</p>
    </header>
    ${allSectionsHtml(instrument)}`;
}

// Само уроците с размер (/8) показват и размера до нотите
function isMeterLesson(lesson) {
  return lesson.title.includes("/8");
}

// Ширината следва броя ноти, за да стои фигурата в средата
function lessonFigureWidth(figure, showMeter) {
  let width = FIGURE_BASE_WIDTH + figure.length * FIGURE_WIDTH_PER_NOTE;
  if (showMeter) width += FIGURE_METER_EXTRA_WIDTH;
  return width;
}

function drawLessonFigure(instrument, lesson, container) {
  const showMeter = isMeterLesson(lesson);
  const figure = figureOf(instrument, lesson);
  drawMeasure(container, lesson, figure, {
    width: lessonFigureWidth(figure, showMeter),
    height: LESSON_FIGURE_HEIGHT,
    top: LESSON_FIGURE_TOP,
    showSig: showMeter,
  });
}

// Рисува малката фигура във всяка кутия и оживява кликването
function connectLessonRows(instrument) {
  for (const button of appEl.querySelectorAll("[data-lesson]")) {
    const lessonIndex = Number(button.dataset.lesson);
    drawLessonFigure(instrument, instrument.lessons[lessonIndex], button.querySelector(".row-notes"));
    button.onclick = () => openLesson(lessonIndex);
  }
}

function renderInstrument() {
  const instrument = getInstrument();
  const hasBackButton = state.data.instruments.length !== 1;
  for (const lesson of instrument.lessons) prepareLesson(instrument, lesson);

  appEl.innerHTML = instrumentHtml(instrument, hasBackButton);

  if (hasBackButton) $("[data-back]").onclick = () => go("home");
  connectLessonRows(instrument);
}
