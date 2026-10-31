// Свирене: планира звука такт по такт и следи къде е топчето.
//
// Важно: звукът се задава предварително по часовника на звуковата карта (audio.currentTime),
// затова е точен. Таймерите на JavaScript (setTimeout) само обновяват картинката.
// Самото топче е във файла ball.js — той чете track, trackPos и lastLanded оттук.

let playId = 0;        // номер на текущото свирене; старите таймери проверяват дали още е техният ред
let timers = [];       // всички таймери, за да могат да се спрат
let track = [];        // кога коя нота звучи: {time, measure, index, end, rest} — по него скача топчето
let trackPos = 0;      // докъде в track сме стигнали
let lastLanded = null; // последната нота, на която е кацнало топчето

const LOOKAHEAD = 0.25;            // следващият такт се подготвя толкова секунди предварително
const COUNT_IN_DELAY = 0.15;       // пауза преди първия удар на отброяването
const JUMP_DELAY = 0.05;           // пауза преди такта при бърза смяна в ръчен режим
const END_DELAY = 0.25;            // след последния такт изчакваме удара да отзвучи
const SWITCH_BACKUP_DELAY = 0.15;  // резервната смяна на листа идва малко след основната
const SWITCH_MAX = 0.12;           // най-много колко се бави смяната на листа след удара
const SWITCH_FRACTION = 0.4;       // или толкова от дължината на последната нота
const STRONG_VELOCITY = 1;         // сила на удара на силните времена
const WEAK_VELOCITY = 0.84;        // по-меко между тях
const VELOCITY_JITTER = 0.06;      // лека случайна разлика
const POSITION_DIGITS = 4;         // позициите се сравняват като текст, закръглени така

// След последната нота листът минава на следващия такт малко по-късно — колкото да се види ударът
function switchDelay(duration) {
  return Math.min(SWITCH_MAX, duration * SWITCH_FRACTION);
}

// Изпълнява функцията action, когато звукът за момент time се чуе
function runAt(time, action) {
  const wait = Math.max(0, (time - heardNow()) * 1000);
  timers.push(setTimeout(action, wait));
}

function secondsPerQuarter() {
  return 60 / state.tempo;
}

function beatsPerMeasure() {
  return getMeter(getLesson(), state.example).beats;
}

function resetTrack() {
  track = [];
  trackPos = 0;
}

// Листът показва такт measure и нито една нота не е оцветена
function showMeasure(measure) {
  state.measure = measure;
  state.active = -1;
  updateMeasure();
}

// Бутонът „Свири / Спри“
function play() {
  if (state.playing) {
    stop();
    return;
  }
  startAudio();
  state.playing = true;
  state.fromStart = state.mode === "auto" && state.measure === 0;
  playId++;
  const id = playId;
  updatePlayButton();

  const countInStart = audio.currentTime + COUNT_IN_DELAY;
  resetTrack();
  scheduleCountIn(id, countInStart);
  const firstMeasureStart = countInStart + beatsPerMeasure() * secondsPerQuarter();
  scheduleMeasure(id, firstMeasureStart, state.measure);
}

// Един такт отброяване с метронома
function scheduleCountIn(id, start) {
  const quarter = secondsPerQuarter();
  for (const click of getClicks(getLesson())) {
    const when = start + click.at * quarter;
    playClick(when, click.level);
    if (!click.label) continue;
    runAt(when, () => {
      if (id === playId) setStatus("Отброяване… " + click.label);
    });
    // топчето подскача на място
    track.push({ time: when, measure: state.measure, index: 0, end: null });
  }
}

// Планира звука на такт measure, който започва в момент start
function scheduleMeasure(id, start, measure) {
  const end = start + beatsPerMeasure() * secondsPerQuarter(); // кога свършва тактът
  const next = measureAfter(measure);

  const lastNoteTime = scheduleNotes(id, start, end, measure);
  scheduleEarlySwitch(id, lastNoteTime, end, measure, next);
  scheduleMetronome(id, start);

  if (next !== null) scheduleNextMeasure(id, end, next);
  else scheduleEnd(id, end);
}

// Кой такт е следващият: в ръчен режим същият, в автоматичен — следващият (null след последния)
function measureAfter(measure) {
  if (state.mode === "manual") return measure;
  if (measure === getBars().length - 1) return null;
  return measure + 1;
}

// Позициите (в четвъртини) на силните времена — там ударите са по-силни
function strongPositions() {
  const positions = [];
  for (const click of getClicks(getLesson())) {
    if (click.label) positions.push(click.at.toFixed(POSITION_DIGITS));
  }
  return positions;
}

// По-силно на силните времена, по-меко между тях, с лека случайна разлика
function velocityAt(position, strong) {
  const base = strong.includes(position.toFixed(POSITION_DIGITS)) ? STRONG_VELOCITY : WEAK_VELOCITY;
  return base + (Math.random() - 0.5) * VELOCITY_JITTER;
}

// Пуска звука на всяка нота от такта и записва в track кога звучи. Връща кога звучи последната.
function scheduleNotes(id, start, end, measure) {
  const bar = getBars()[measure];
  const strong = strongPositions();
  const quarter = secondsPerQuarter();
  let position = 0;      // позицията в такта в четвъртини
  let lastNoteTime = start;
  for (let index = 0; index < bar.length; index++) {
    const note = bar[index];
    const when = start + position * quarter;
    lastNoteTime = when;
    track.push({ time: when, measure: measure, index: index, end: end, rest: note.rest });
    playNote(note, when, velocityAt(position, strong));
    scheduleHighlight(id, when, measure, index);
    position += note.beats;
  }
  return lastNoteTime;
}

function playNote(note, when, velocity) {
  for (const voice of note.voices) {
    if (SOUNDS[voice.sound]) SOUNDS[voice.sound](when, velocity);
  }
}

// Когато нотата се чуе, я оцветяваме
function scheduleHighlight(id, when, measure, index) {
  runAt(when, () => {
    if (id !== playId) return;
    if (state.measure !== measure) showMeasure(measure); // резервно, ако смяната на такта не е стигнала навреме
    highlight(index);
  });
}

// Веднага след удара на последната нота листът минава на следващия такт — детето вижда
// новите ноти по-рано. Обикновено това го прави анимацията на топчето; това е резерва.
function scheduleEarlySwitch(id, lastNoteTime, end, measure, next) {
  if (next === null || next === measure) return;
  const when = lastNoteTime + switchDelay(end - lastNoteTime) + SWITCH_BACKUP_DELAY;
  runAt(when, () => {
    if (id !== playId || state.measure === next) return;
    showMeasure(next);
  });
}

function scheduleMetronome(id, start) {
  const quarter = secondsPerQuarter();
  for (const click of getClicks(getLesson())) {
    const when = start + click.at * quarter;
    if (state.metronome) playClick(when, click.level);
    if (!click.label) continue;
    runAt(when, () => {
      if (id === playId) setStatus(click.label);
    });
  }
}

// Подготвя следващия такт малко преди да е дошъл редът му
function scheduleNextMeasure(id, end, next) {
  const early = Math.min(LOOKAHEAD, (beatsPerMeasure() * secondsPerQuarter()) / 2);
  runAt(end - early, () => {
    if (id === playId) scheduleMeasure(id, end, next);
  });
}

// Последният такт — след като последният удар отзвучи, свиренето е приключило
function scheduleEnd(id, end) {
  runAt(end + END_DELAY, () => {
    if (id !== playId) return;
    const finished = state.fromStart;
    stop();
    if (finished) finishLesson();
    else setStatus("Пусни от първия такт, за да завършиш урока.");
  });
}

// Спира звука и таймерите
function stop() {
  playId++;
  clearAllTimers();
  resetTrack();
  stopAllSounds();
  if (!state.playing) return;
  state.playing = false;
  state.active = -1;
  if (state.view !== "practice") return;
  updatePlayButton();
  setStatus("");
  drawBig();
}

function clearAllTimers() {
  for (const timer of timers) clearTimeout(timer);
  timers = [];
}

function stopAllSounds() {
  for (const source of liveSounds) {
    try {
      source.stop();
    } catch (e) {
      // вече е спрян — нищо
    }
  }
  liveSounds.clear();
}

// Оцветява нота index от текущия такт
function highlight(index) {
  state.active = index;
  drawBig();
}

// Държи номера на такта в границите на урока
function clampMeasure(measure) {
  return Math.min(Math.max(measure, 0), getBars().length - 1);
}

// Отива на такт measure (и спира свиренето)
function setMeasure(measure) {
  stop();
  state.measure = clampMeasure(measure);
  state.active = -1;
  setStatus("");
  updateMeasure();
}

// Бутоните „Предишен / Следващ такт“.
// В ръчен режим, докато свири: сменя такта веднага, без да спира звука.
// Иначе: обикновена смяна със спиране.
function jumpMeasure(measure) {
  const target = clampMeasure(measure);
  if (!state.playing || state.mode !== "manual") {
    setMeasure(target);
    return;
  }

  playId++;
  clearAllTimers();
  stopAllSounds();

  state.measure = target;
  state.active = -1;
  resetTrack();
  updateMeasure();
  playId++;
  scheduleMeasure(playId, audio.currentTime + JUMP_DELAY, target);
}
