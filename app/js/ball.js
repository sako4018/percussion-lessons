// Топчето: скача от нота на нота по листа. Ударът му в нотата съвпада със звука.
// Чете състоянието от player.js: track, trackPos, lastLanded, switchDelay и общите state, audio, BIG.

const HEARD_OFFSET = 0.008;       // половин кадър: картината излиза на екрана малко след рисуването
const DEFAULT_FLIGHT = 0.3;       // колко трае полетът след последната нота, ако няма следваща
const MIN_FLIGHT = 0.05;          // най-краткият полет след смяната на листа
const PULSE_WINDOW = 0.1;         // кръгчето се показва само ако сме току-що след удара
const MIN_START_X = 24;           // най-лявата точка, от която тръгва топчето в нов такт
const START_X_MARGIN = 70;        // колко преди първата нота стои топчето в нов такт
const SQUASH_MIN = 0.06;          // най-кратко сплескване (секунди)
const SQUASH_MAX = 0.09;          // най-дълго сплескване (секунди)
const SQUASH_WIDEN = 0.35;        // колко се разширява при удар
const SQUASH_FLATTEN = 0.3;       // колко се снижава при удар
const FALL_START = 0.8;           // от кой дял на полета започва удължаването
const FALL_LENGTH = 0.2;          // дял от полета, в който топчето се удължава
const FALL_NARROW = 0.1;          // колко се стеснява при падане
const FALL_TALL = 0.14;           // колко се издължава при падане
const LIFT_PER_SECOND = 55;       // височина на подскока за секунда дължина на нотата
const LIFT_PER_DISTANCE = 0.1;    // височина на подскока за единица разстояние
const LIFT_MIN = 10;
const LIFT_MAX = 40;

// Къде са нотите в такт measure. Рисува се веднъж настрани и резултатът се помни (кеш).
function layoutOf(measure) {
  const lesson = getLesson();
  if (!lesson.layouts) lesson.layouts = {};
  const key = state.example + "/" + measure;
  if (!lesson.layouts[key]) {
    lesson.layouts[key] = drawMeasure(document.createElement("div"), lesson, getBars()[measure], BIG);
  }
  return lesson.layouts[key];
}

// Следващото кацане след последната нота на такта (още не е в track)
function nextAfter(current) {
  if (current.end === null || current.end === undefined) return null;
  const measure = state.mode === "manual" ? current.measure : current.measure + 1;
  if (measure >= getBars().length) return null;
  return { time: current.end, measure: measure, index: 0 };
}

// Вика се на всеки кадър (около 60 пъти в секунда) и мести топчето.
function animateBall() {
  requestAnimationFrame(animateBall);
  const ball = document.getElementById("ball");
  if (!ball) return;
  const svg = document.querySelector("#big svg");
  if (!state.playing || !audio || track.length === 0 || !svg) {
    ball.classList.remove("on");
    return;
  }

  const now = heardNow() + HEARD_OFFSET;
  advanceTrackPos(now);
  const current = track[trackPos];
  if (current.time > now) {
    ball.classList.remove("on");
    return;
  }

  const pose = poseAt(current, now, svg.clientWidth / BIG.width);
  ball.style.transform = ballTransform(pose);
  ball.classList.add("on");
}

// Премества trackPos до последната нота, чийто удар вече се чува
function advanceTrackPos(now) {
  while (trackPos + 1 < track.length && track[trackPos + 1].time <= now) trackPos++;
}

// Къде е топчето и как е деформирано в момент now (координати в пиксели на екрана)
function poseAt(current, now, scale) {
  const next = track[trackPos + 1] || nextAfter(current); // към коя нота лети топчето
  const flightLength = next ? next.time - current.time : DEFAULT_FLIGHT;
  const since = now - current.time; // колко време мина от удара
  const crossing = next && next.measure !== current.measure; // последна нота преди нов такт

  switchSheetIfDue(current, next, crossing, since, flightLength);
  const switched = current.measure !== state.measure; // листът вече показва новия такт

  const start = takeOffPoint(current, switched, since, flightLength, scale);
  const pose = { x: start.x, y: start.y, stretchX: 1, stretchY: 1 };

  if (!switched && !current.rest) applySquash(pose, since, flightLength);

  // На последната нота топчето стои, докато листът се смени, после продължава в ритъм
  const waiting = crossing && !switched && state.mode !== "manual";
  if (next && !waiting) applyFlight(pose, start, next, now, flightLength);

  return { x: pose.x * scale, y: pose.y * scale, stretchX: pose.stretchX, stretchY: pose.stretchY };
}

// Веднага след удара на последната нота листът минава на следващия такт
function switchSheetIfDue(current, next, crossing, since, flightLength) {
  if (!crossing) return;
  if (state.mode === "manual" || state.measure !== current.measure) return;
  if (since < switchDelay(flightLength)) return;
  state.measure = next.measure;
  state.active = -1;
  updateMeasure();
}

// Откъде скача топчето: от нотата — или, след смяната на листа, от началото на новия такт.
// Връща {x, y, time, flight}: точка, момент на тръгване и дължина на полета.
function takeOffPoint(current, switched, since, flightLength, scale) {
  if (switched) {
    const layout = layoutOf(state.measure);
    const delay = switchDelay(flightLength);
    return {
      x: Math.max(MIN_START_X, layout.xs[0] - START_X_MARGIN),
      y: layout.landY,
      time: current.time + delay,
      flight: Math.max(MIN_FLIGHT, flightLength - delay),
    };
  }
  const layout = layoutOf(current.measure);
  const x = layout.xs[current.index];
  pulseOnLanding(current, since, x * scale, layout.landY * scale);
  return { x: x, y: layout.landY, time: current.time, flight: flightLength };
}

// Точно в момента на звука — кръгче на мястото на кацане (веднъж за нота)
function pulseOnLanding(current, since, pixelX, pixelY) {
  if (current === lastLanded) return;
  lastLanded = current;
  if (!current.rest && since < PULSE_WINDOW) pulse(pixelX, pixelY);
}

// Сплескване веднага СЛЕД удара (не преди), за да се вижда кога точно е звукът
function applySquash(pose, since, flightLength) {
  const squashTime = Math.min(SQUASH_MAX, Math.max(SQUASH_MIN, flightLength * 0.5));
  if (since >= squashTime) return;
  const strength = 1 - since / squashTime;
  pose.stretchX = 1 + SQUASH_WIDEN * strength;
  pose.stretchY = 1 - SQUASH_FLATTEN * strength;
}

// Движи топчето по дъга от точката на тръгване към следващата нота
function applyFlight(pose, start, next, now, flightLength) {
  const target = layoutOf(next.measure);
  const endX = target.xs[next.index];
  const progress = flightProgress(now, start);
  const lift = jumpHeight(flightLength, Math.abs(endX - start.x));

  pose.x = start.x + (endX - start.x) * progress;
  // бързо нагоре, бавно горе, бързо надолу
  pose.y = start.y + (target.landY - start.y) * progress - lift * (1 - Math.pow(2 * progress - 1, 4));

  if (progress > FALL_START && pose.stretchX === 1) applyFall(pose, progress);
}

// 0 = току-що тръгнало, 1 = кацнало
function flightProgress(now, start) {
  return Math.min(Math.max((now - start.time) / start.flight, 0), 1);
}

// По-дълга нота или по-далечен скок — по-високо подскачане
function jumpHeight(flightLength, distance) {
  const wanted = Math.max(flightLength * LIFT_PER_SECOND, distance * LIFT_PER_DISTANCE, LIFT_MIN);
  return Math.min(wanted, LIFT_MAX);
}

// Леко издължено при падане
function applyFall(pose, progress) {
  const strength = (progress - FALL_START) / FALL_LENGTH;
  pose.stretchX = 1 - FALL_NARROW * strength;
  pose.stretchY = 1 + FALL_TALL * strength;
}

function ballTransform(pose) {
  return "translate(" + pose.x + "px, " + pose.y + "px) translate(-50%, -100%) scale(" +
    pose.stretchX + ", " + pose.stretchY + ")";
}

// Кръгче, което се разширява на мястото на кацане
function pulse(pixelX, pixelY) {
  const hit = document.getElementById("hit");
  if (!hit) return;
  hit.style.setProperty("--pos", "translate(" + pixelX + "px, " + pixelY + "px)");
  hit.classList.remove("go");
  void hit.offsetWidth; // тази линия рестартира анимацията
  hit.classList.add("go");
}
