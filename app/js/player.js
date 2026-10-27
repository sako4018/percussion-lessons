// Свирене: планира звука такт по такт и следи къде е топчето.
//
// Важно: звукът се задава предварително по часовника на звуковата карта (audio.currentTime),
// затова е точен. Таймерите на JavaScript (setTimeout) само обновяват картинката.

let playId = 0;        // номер на текущото свирене; старите таймери проверяват дали още е техният ред
let timers = [];       // всички таймери, за да могат да се спрат
let track = [];        // кога коя нота звучи: {t, m, idx, end, rest} — по него скача топчето
let trackPos = 0;      // докъде в track сме стигнали
let lastLanded = null; // последната нота, на която е кацнало топчето

const LOOKAHEAD = 0.25; // следващият такт се подготвя толкова секунди предварително

// След последната нота листът минава на следващия такт малко по-късно — колкото да се види ударът
function switchDelay(duration) {
  return Math.min(0.12, duration * 0.4);
}

// Изпълнява функцията fn, когато звукът за момент t се чуе
function runAt(t, fn) {
  const wait = Math.max(0, (t - heardNow()) * 1000);
  timers.push(setTimeout(fn, wait));
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

  // един такт отброяване с метронома
  const lesson = getLesson();
  const quarter = 60 / state.tempo; // колко секунди е една четвъртина
  const t0 = audio.currentTime + 0.15;
  track = [];
  trackPos = 0;
  for (const c of getClicks(lesson)) {
    const when = t0 + c.at * quarter;
    playClick(when, c.level);
    if (c.label) {
      runAt(when, () => {
        if (id === playId) setStatus("Отброяване… " + c.label);
      });
      // топчето подскача на място
      track.push({ t: when, m: state.measure, idx: 0, end: null });
    }
  }
  scheduleMeasure(id, t0 + getMeter(lesson, state.example).beats * quarter, state.measure);
}

// Планира звука на такт m, който започва в момент t
function scheduleMeasure(id, t, m) {
  const lesson = getLesson();
  const quarter = 60 / state.tempo;
  const beats = getMeter(lesson, state.example).beats;
  const end = t + beats * quarter; // кога свършва тактът
  const bar = getBars()[m];
  const isLast = m === getBars().length - 1;

  // кой е следващият такт: в ръчен режим същият, в автоматичен — следващият (null след последния)
  let next = null;
  if (state.mode === "manual") next = m;
  else if (!isLast) next = m + 1;

  // на кои позиции са силните времена (там ударите са по-силни)
  const clicks = getClicks(lesson);
  const strong = [];
  for (const c of clicks) {
    if (c.label) strong.push(c.at.toFixed(4));
  }

  let pos = 0;         // позицията в такта в четвъртини
  let lastWhen = t;    // кога звучи последната нота
  for (let idx = 0; idx < bar.length; idx++) {
    const note = bar[idx];
    const when = t + pos * quarter;
    lastWhen = when;

    // по-силно на силните времена, малко по-меко между тях, с лека случайна разлика
    let vel = strong.includes(pos.toFixed(4)) ? 1 : 0.84;
    vel += (Math.random() - 0.5) * 0.06;

    track.push({ t: when, m: m, idx: idx, end: end, rest: note.rest });
    for (const voice of note.voices) {
      if (SOUNDS[voice.sound]) SOUNDS[voice.sound](when, vel);
    }

    // когато нотата се чуе, я оцветяваме
    runAt(when, () => {
      if (id !== playId) return;
      if (state.measure !== m) { // резервно, ако смяната на такта не е стигнала навреме
        state.measure = m;
        state.active = -1;
        updateMeasure();
      }
      highlight(idx);
    });
    pos += note.beats;
  }

  // Веднага след удара на последната нота листът минава на следващия такт — детето вижда
  // новите ноти по-рано. Обикновено това го прави анимацията на топчето; това е резерва.
  if (next !== null && next !== m) {
    runAt(lastWhen + switchDelay(end - lastWhen) + 0.15, () => {
      if (id !== playId || state.measure === next) return;
      state.measure = next;
      state.active = -1;
      updateMeasure();
    });
  }

  // метроном
  for (const c of clicks) {
    const when = t + c.at * quarter;
    if (state.metronome) playClick(when, c.level);
    if (c.label) {
      runAt(when, () => {
        if (id === playId) setStatus(c.label);
      });
    }
  }

  if (next !== null) {
    // подготвя следващия такт малко преди да е дошъл редът му
    const early = Math.min(LOOKAHEAD, (beats * quarter) / 2);
    runAt(end - early, () => {
      if (id === playId) scheduleMeasure(id, end, next);
    });
    return;
  }

  // това е последният такт — след като последният удар отзвучи, свирим е приключило
  runAt(end + 0.25, () => {
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
  track = [];
  trackPos = 0;
  stopAllSounds();
  if (!state.playing) return;
  state.playing = false;
  state.active = -1;
  if (state.view === "practice") {
    updatePlayButton();
    setStatus("");
    drawBig();
  }
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

// Оцветява нота idx от текущия такт
function highlight(idx) {
  state.active = idx;
  drawBig();
}

// Отива на такт k (и спира свиренето)
function setMeasure(k) {
  stop();
  const total = getBars().length;
  state.measure = Math.min(Math.max(k, 0), total - 1);
  state.active = -1;
  setStatus("");
  updateMeasure();
}

// Бутоните „Предишен / Следващ такт“.
// В ръчен режим, докато свири: сменя такта веднага, без да спира звука.
// Иначе: обикновена смяна със спиране.
function jumpMeasure(k) {
  const total = getBars().length;
  const target = Math.min(Math.max(k, 0), total - 1);
  if (!state.playing || state.mode !== "manual") {
    setMeasure(target);
    return;
  }

  playId++;
  clearAllTimers();
  stopAllSounds();

  state.measure = target;
  state.active = -1;
  track = [];
  trackPos = 0;
  updateMeasure();
  playId++;
  scheduleMeasure(playId, audio.currentTime + 0.05, target);
}

/* ---------- Топчето ---------- */

// Къде са нотите в такт m. Рисува се веднъж настрани и резултатът се помни (кеш).
function layoutOf(m) {
  const lesson = getLesson();
  if (!lesson.layouts) lesson.layouts = {};
  const key = state.example + "/" + m;
  if (!lesson.layouts[key]) {
    lesson.layouts[key] = drawMeasure(document.createElement("div"), lesson, getBars()[m], BIG);
  }
  return lesson.layouts[key];
}

// Следващото кацане след последната нота на такта (още не е в track)
function nextAfter(cur) {
  if (cur.end === null || cur.end === undefined) return null;
  const m = state.mode === "manual" ? cur.m : cur.m + 1;
  if (m < getBars().length) return { t: cur.end, m: m, idx: 0 };
  return null;
}

// Вика се на всеки кадър (около 60 пъти в секунда) и мести топчето.
// Топчето скача от нота на нота; ударът му в нотата съвпада със звука.
function animateBall() {
  requestAnimationFrame(animateBall);
  const ball = document.getElementById("ball");
  if (!ball) return;
  const svg = document.querySelector("#big svg");
  if (!state.playing || !audio || track.length === 0 || !svg) {
    ball.classList.remove("on");
    return;
  }

  // Моментът, който се чува сега (+ половин кадър, защото картината излиза на екрана малко след рисуването)
  const now = heardNow() + 0.008;
  while (trackPos + 1 < track.length && track[trackPos + 1].t <= now) trackPos++;
  const cur = track[trackPos];
  if (cur.t > now) {
    ball.classList.remove("on");
    return;
  }

  const scale = svg.clientWidth / BIG.width;         // колко е смалена картинката на екрана
  const nxt = track[trackPos + 1] || nextAfter(cur); // към коя нота лети топчето
  const dur = nxt ? nxt.t - cur.t : 0.3;             // колко трае полетът
  const since = now - cur.t;                         // колко време мина от удара
  const crossing = nxt && nxt.m !== cur.m;           // последната нота преди нов такт

  // веднага след удара на последната нота листът минава на следващия такт
  if (crossing && state.mode !== "manual" && state.measure === cur.m && since >= switchDelay(dur)) {
    state.measure = nxt.m;
    state.active = -1;
    updateMeasure();
  }
  const switched = cur.m !== state.measure; // листът вече показва новия такт

  // Откъде скача топчето: от нотата — или, след смяната на листа, от началото на новия такт
  let x0;
  let y0;
  let t0 = cur.t;
  let flight = dur;
  if (switched) {
    const layout = layoutOf(state.measure);
    x0 = Math.max(24, layout.xs[0] - 70);
    y0 = layout.landY;
    t0 = cur.t + switchDelay(dur);
    flight = Math.max(0.05, dur - switchDelay(dur));
  } else {
    const layout = layoutOf(cur.m);
    x0 = layout.xs[cur.idx];
    y0 = layout.landY;
    if (cur !== lastLanded) { // точно в момента на звука — кръгче на мястото на кацане
      lastLanded = cur;
      if (!cur.rest && since < 0.1) pulse(x0 * scale, y0 * scale);
    }
  }

  let x = x0;
  let y = y0;
  let stretchX = 1; // сплесквания на топчето
  let stretchY = 1;

  // сплескване веднага СЛЕД удара (не преди), за да се вижда кога точно е звукът
  const squashTime = Math.min(0.09, Math.max(0.06, dur * 0.5));
  if (!switched && !cur.rest && since < squashTime) {
    const k = 1 - since / squashTime;
    stretchX = 1 + 0.35 * k;
    stretchY = 1 - 0.3 * k;
  }

  // На последната нота топчето стои, докато листът се смени, после продължава в ритъм
  const waiting = crossing && !switched && state.mode !== "manual";
  if (nxt && !waiting) {
    const target = layoutOf(nxt.m);
    const x1 = target.xs[nxt.idx];
    const p = Math.min(Math.max((now - t0) / flight, 0), 1); // 0 = току-що тръгнало, 1 = кацнало
    // по-дълга нота или по-далечен скок — по-високо подскачане
    const lift = Math.min(Math.max(dur * 55, Math.abs(x1 - x0) * 0.1, 10), 40);
    x = x0 + (x1 - x0) * p;
    // бързо нагоре, бавно горе, бързо надолу
    y = y0 + (target.landY - y0) * p - lift * (1 - Math.pow(2 * p - 1, 4));
    if (p > 0.8 && stretchX === 1) { // леко издължено при падане
      const k = (p - 0.8) / 0.2;
      stretchX = 1 - 0.1 * k;
      stretchY = 1 + 0.14 * k;
    }
  }

  ball.style.transform = "translate(" + (x * scale) + "px, " + (y * scale) + "px) translate(-50%, -100%) scale(" +
    stretchX + ", " + stretchY + ")";
  ball.classList.add("on");
}

// Кръгче, което се разширява на мястото на кацане
function pulse(px, py) {
  const hit = document.getElementById("hit");
  if (!hit) return;
  hit.style.setProperty("--pos", "translate(" + px + "px, " + py + "px)");
  hit.classList.remove("go");
  void hit.offsetWidth; // тази линия рестартира анимацията
  hit.classList.add("go");
}
