// Общи настройки и данни, които се ползват от всички останали файлове.

const VF = Vex.Flow; // библиотеката, която рисува нотите
const ACCENT = "#0071e3"; // синият цвят на изсвирената нота

// дължина на всяка нота в четвъртини
const DURATIONS = { w: 4, h: 2, q: 1, "8": 0.5, "16": 0.25 };

// цветове за топчетата и конфетите
const PALETTE = ["#ff6b6b", "#fd7e14", "#f59f00", "#2fb344", "#12b886", "#228be6", "#7950f2", "#e64980"];

// формите на топчето — сменят се по ред от урок на урок
const SHAPES = ["smile", "star", "heart", "ball", "flower"];

// цветове на разделите по ред (червен, оранжев, жълт, зелен, син, лилав, розов);
// след седмия започват отначало
const SECTION_COLORS = ["#e03131", "#f76707", "#f59f00", "#2f9e44", "#1c7ed6", "#7048e8", "#d6336c"];

// Разделите по тема. "from" е номерът на първия урок в раздела (броенето започва от 0).
// Ако се добавят нови уроци в lessons.json, този списък трябва да се поправи.
const SECTIONS = [
  { from: 0, title: "Основни дължини" },
  { from: 4, title: "Осмини и шестнайсетини" },
  { from: 9, title: "Групи, точка и синкоп" },
  { from: 18, title: "Триоли" },
  { from: 22, title: "Неравноделни размери" },
  { from: 36, title: "6/8, 9/8 и 12/8" },
  { from: 40, title: "Двувременна триола, секстола и групи" },
];

// Всичко, което програмата помни, докато работи
const state = {
  data: null,        // уроците, заредени от lessons.json
  api: null,         // връзката с Python (записва напредъка)
  view: "home",      // кой екран е отворен: "home", "instrument" или "practice"
  instId: null,      // кой инструмент е избран
  lessonIdx: 0,      // кой урок е отворен
  example: 0,        // кой пример от урока
  measure: 0,        // кой такт се показва
  active: -1,        // коя нота свети в момента (-1 = никоя)
  playing: false,    // дали свири в момента
  fromStart: false,  // дали е започнало от първия такт (само тогава урокът се смята за завършен)
  tempo: 60,
  mode: "auto",      // "auto" = минава такт по такт сам, "manual" = повтаря такта, учителят сменя
  metronome: true,
  sound: true,       // звукът на барабанчето (метрономът си има отделен ключ)
  stars: {},         // напредъкът: "урок/пример" -> true, ако е свирен докрай
};

// Малки картинки до плъзгача за темпо
const TURTLE = `<svg viewBox="0 0 32 20" aria-hidden="true"><path d="M5 15a9 9 0 0 1 18 0Z"/><circle cx="26" cy="12" r="3.2"/>
  <rect x="7" y="14" width="3.5" height="4.5" rx="1.5"/><rect x="17.5" y="14" width="3.5" height="4.5" rx="1.5"/></svg>`;
const HARE = `<svg viewBox="0 0 32 20" aria-hidden="true"><ellipse cx="13" cy="13" rx="9" ry="5.5"/><circle cx="23" cy="9" r="3.6"/>
  <ellipse cx="22" cy="3.5" rx="1.4" ry="4" transform="rotate(-15 22 3.5)"/><ellipse cx="25" cy="3.5" rx="1.4" ry="4" transform="rotate(15 25 3.5)"/>
  <circle cx="4" cy="12" r="2"/></svg>`;

// Мястото на страницата, в което се рисуват екраните
const appEl = document.getElementById("app");

// Намира елемент вътре в страницата (по CSS селектор)
function $(selector) {
  return appEl.querySelector(selector);
}

// Прави текста безопасен за вмъкване в HTML
function esc(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Избраният инструмент
function getInstrument() {
  for (const inst of state.data.instruments) {
    if (inst.id === state.instId) return inst;
  }
}

// Отвореният урок
function getLesson() {
  return getInstrument().lessons[state.lessonIdx];
}

// Цветът на раздела с номер n
function sectionColor(n) {
  return SECTION_COLORS[n % SECTION_COLORS.length];
}

// В кой раздел е урок с даден номер
function sectionOfLesson(lessonIdx) {
  let found = 0;
  for (let n = 0; n < SECTIONS.length; n++) {
    if (SECTIONS[n].from <= lessonIdx) found = n;
  }
  return found;
}

// Цветът и формата на топчето за даден урок
function lessonLook(lessonIdx) {
  return {
    color: sectionColor(sectionOfLesson(lessonIdx)),
    shape: SHAPES[lessonIdx % SHAPES.length],
  };
}

// Формите на топчето: всяка е малка функция, която връща вътрешността на SVG-то
function ballSvg(color) {
  return `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="8.5" cy="8" r="2.8" fill="#fff" opacity=".5"/>`;
}

function smileSvg(color) {
  return `<circle cx="12" cy="12" r="10" fill="${color}"/><circle cx="8.6" cy="10" r="1.3" fill="#fff"/>
      <circle cx="15.4" cy="10" r="1.3" fill="#fff"/>
      <path d="M8 13.8Q12 17.6 16 13.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
}

function starSvg(color) {
  return `<path d="M12 2.5 14.8 8.7 21.5 9.4 16.5 13.9 17.9 20.6 12 17.2 6.1 20.6 7.5 13.9 2.5 9.4 9.2 8.7Z"
      fill="${color}" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function heartSvg(color) {
  return `<path d="M12 21C5.5 16.4 2 12.8 2 8.6 2 5.8 4.2 3.6 7 3.6c2 0 3.8 1.1 5 2.9 1.2-1.8 3-2.9 5-2.9 2.8 0 5 2.2 5 5 0 4.2-3.5 7.8-10 12.4Z" fill="${color}"/>`;
}

function flowerSvg(color) {
  const petalCount = 5;
  const petalDistance = 5.6; // колко далеч от средата е всяко листенце
  let petals = "";
  for (let k = 0; k < petalCount; k++) {
    const angle = -Math.PI / 2 + (k * 2 * Math.PI) / petalCount;
    const x = (12 + petalDistance * Math.cos(angle)).toFixed(2);
    const y = (12 + petalDistance * Math.sin(angle)).toFixed(2);
    petals += `<circle cx="${x}" cy="${y}" r="4.4" fill="${color}"/>`;
  }
  return petals + `<circle cx="12" cy="12" r="3.4" fill="#fff"/>`;
}

const SHAPE_DRAWERS = {
  ball: ballSvg,
  smile: smileSvg,
  star: starSvg,
  heart: heartSvg,
  flower: flowerSvg,
};

// Рисува топчето като SVG картинка (форма + цвят)
function shapeSvg(look) {
  const drawShape = SHAPE_DRAWERS[look.shape];
  const body = drawShape ? drawShape(look.color) : "";
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}
