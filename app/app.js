"use strict";

const VF = Vex.Flow;
const ACCENT = "#0071e3";
const DUR = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 }; // в четвъртини

// всеки урок има свой цвят и фигура за топчето
const PALETTE = ["#ff6b6b", "#fd7e14", "#f59f00", "#2fb344", "#12b886", "#228be6", "#7950f2", "#e64980"];
const SHAPES = ["smile", "star", "heart", "ball", "flower"];
const lessonLook = idx => ({ color: PALETTE[idx % PALETTE.length], shape: SHAPES[idx % SHAPES.length] });

function shapeSvg({ color: c, shape }) {
  const body = {
    ball: `<circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="8.5" cy="8" r="2.8" fill="#fff" opacity=".5"/>`,
    smile: `<circle cx="12" cy="12" r="10" fill="${c}"/><circle cx="8.6" cy="10" r="1.3" fill="#fff"/>
      <circle cx="15.4" cy="10" r="1.3" fill="#fff"/>
      <path d="M8 13.8Q12 17.6 16 13.8" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    star: `<path d="M12 2.5 14.8 8.7 21.5 9.4 16.5 13.9 17.9 20.6 12 17.2 6.1 20.6 7.5 13.9 2.5 9.4 9.2 8.7Z"
      fill="${c}" stroke="${c}" stroke-width="1.6" stroke-linejoin="round"/>`,
    heart: `<path d="M12 21C5.5 16.4 2 12.8 2 8.6 2 5.8 4.2 3.6 7 3.6c2 0 3.8 1.1 5 2.9 1.2-1.8 3-2.9 5-2.9 2.8 0 5 2.2 5 5 0 4.2-3.5 7.8-10 12.4Z" fill="${c}"/>`,
    flower: [0, 1, 2, 3, 4].map(k => {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 5;
      return `<circle cx="${(12 + 5.6 * Math.cos(a)).toFixed(2)}" cy="${(12 + 5.6 * Math.sin(a)).toFixed(2)}" r="4.4" fill="${c}"/>`;
    }).join("") + `<circle cx="12" cy="12" r="3.4" fill="#fff"/>`,
  }[shape];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

const state = {
  data: null,
  api: null,
  view: "home",
  instId: null,
  lessonIdx: 0,
  example: 0,
  measure: 0,
  active: -1,
  playing: false,
  fromStart: false,
  tempo: 60,
  mode: "auto", // "auto" = минава сам напред, "manual" = повтаря такта, учителят сменя
  metronome: true,
};

const $app = document.getElementById("app");
const $ = sel => $app.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const inst = () => state.data.instruments.find(i => i.id === state.instId);
const lesson = () => inst().lessons[state.lessonIdx];

/* ---------- Данни ---------- */

const tsOf = (l, e = state.example) => l.timeSignatures?.[e] ?? l.timeSignature;

function meter(l, e) {
  const ts = tsOf(l, e);
  const [num, den] = ts.split("/").map(Number);
  return { ts, num, den, beats: (num * 4) / den, step: 4 / den };
}

// "8:hh+bd:R" → дължина, удари, надпис
function parseToken(tok, i) {
  const [durRaw, voicesRaw = "", label] = tok.split(":");
  // t8 = осмина в триола, tq = двувременна триола, s16 = шестнайсетина в секстола
  const tuplet = /^[ts]/.test(durRaw) ? durRaw[0] : null;
  const triplet = !!tuplet;
  const plain = triplet ? durRaw.slice(1) : durRaw;
  const dotted = plain.endsWith("d");
  const dur = dotted ? plain.slice(0, -1) : plain;
  if (!(dur in DUR)) throw new Error(`Непозната дължина "${durRaw}" в "${tok}"`);
  const rest = voicesRaw === "r";
  const voices = rest ? [] : voicesRaw.split("+").map(id => {
    if (!i.voices[id]) throw new Error(`Непознат удар "${id}" в "${tok}"`);
    return i.voices[id];
  });
  return {
    dur, dotted, triplet, tuplet, rest, voices,
    label: label ?? voices.map(v => v.label).filter(Boolean).join(""),
    beats: DUR[dur] * (dotted ? 1.5 : 1) * (triplet ? 2 / 3 : 1),
  };
}

function prepare(i, l) {
  if (l.parsedExamples) return;
  l.parsedExamples = (l.examples || [l.measures]).map((ex, e) => ex.map((m, k) => {
    const expected = meter(l, e).beats;
    const notes = m.trim().split(/\s+/).map(t => parseToken(t, i));
    const sum = notes.reduce((a, n) => a + n.beats, 0);
    if (Math.abs(sum - expected) > 1e-6) {
      console.warn(`„${l.title}“, пример ${e + 1}, такт ${k + 1}: ${sum} четвъртини вместо ${expected}`);
    }
    return notes;
  }));
  l.usedVoices = [...new Set(l.parsedExamples.flat(2).flatMap(n => n.voices))];
}

// тактовете на избрания пример
const bars = () => lesson().parsedExamples[state.example];

const sizeLabel = (l, all = false) =>
  (all ? [...new Set(l.timeSignatures ?? [l.timeSignature])].join(", ") : tsOf(l)) +
  (l.parts ? ` (${l.parts.join("+")})` : "");

// кликове на метронома в един такт; при неравноделен размер — акцент в началото на всеки дял
function clicks(l) {
  const { num, step } = meter(l);
  if (!l.parts) {
    return Array.from({ length: num }, (_, b) => ({ at: b * step, level: b === 0 ? 2 : 0, label: String(b + 1) }));
  }
  const out = [];
  let pos = 0;
  l.parts.forEach((len, p) => {
    for (let k = 0; k < len; k++) {
      out.push({ at: (pos + k) * step, level: pos + k === 0 ? 2 : k === 0 ? 1 : 0, label: k === 0 ? String(p + 1) : null });
    }
    pos += len;
  });
  return out;
}

function waitApi() {
  return new Promise(resolve => {
    if (window.pywebview?.api?.get_lessons) return resolve(window.pywebview.api);
    const timer = setTimeout(() => resolve(null), 1500);
    window.addEventListener("pywebviewready", () => {
      clearTimeout(timer);
      resolve(window.pywebview.api);
    }, { once: true });
  });
}

/* ---------- Ноти ---------- */

// Рисува такт; връща къде са нотите (x) и линията, на която каца топчето (landY).
function drawMeasure(el, l, data, { width, height, showSig, top = 10, active = -1 }) {
  el.innerHTML = "";
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, top, width - 20);
  if (showSig) stave.addClef("percussion").addTimeSignature(tsOf(l));
  stave.setContext(ctx).draw();

  const notes = data.map((n, idx) => {
    const note = new VF.StaveNote({
      keys: n.rest ? ["b/4"] : n.voices.map(v => v.key),
      duration: n.dur + (n.dotted ? "d" : "") + (n.rest ? "r" : ""),
      clef: "percussion",
      stem_direction: VF.Stem.UP,
      auto_stem: false,
    });
    if (n.dotted) VF.Dot.buildAndAttach([note], { all: true });
    if (n.label) {
      note.addModifier(
        new VF.Annotation(n.label).setFont("Arial", 12, "bold")
          .setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM),
        0,
      );
    }
    if (idx === active) {
      const style = { fillStyle: ACCENT, strokeStyle: ACCENT };
      note.setStyle(style);
      note.setStemStyle(style);
      note.setFlagStyle(style);
      note.keys.forEach((_, ki) => note.setKeyStyle(ki, style));
    }
    return note;
  });

  // скоба: триола (t) = 3 на мястото на 2 от първата нота, секстола (s) = 6 на мястото на 4
  const tuplets = [];
  let group = [];
  let acc = 0;
  let span = 0;
  data.forEach((n, idx) => {
    if (!n.triplet) { group = []; acc = 0; return; }
    const [num, occ] = n.tuplet === "s" ? [6, 4] : [3, 2];
    if (!group.length) span = occ * DUR[n.dur];
    group.push(notes[idx]);
    acc += n.beats;
    if (Math.abs(acc - span) < 1e-6) {
      tuplets.push(new VF.Tuplet(group, { num_notes: num, notes_occupied: occ }));
      group = [];
      acc = 0;
    }
  });

  const { num, den } = meter(l);
  const voice = new VF.Voice({ num_beats: num, beat_value: den })
    .setMode(VF.Voice.Mode.SOFT)
    .addTickables(notes);
  const groups = (l.parts || []).map(p => new VF.Fraction(p, den));
  const beams = VF.Beam.generateBeams(notes, {
    stem_direction: VF.Stem.UP,
    ...(groups.length ? { groups } : {}),
  });
  new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 16);
  voice.draw(ctx, stave);
  beams.forEach(b => b.setContext(ctx).draw());
  tuplets.forEach(t => t.setContext(ctx).draw());

  const svg = el.querySelector("svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "100%";
  svg.style.height = "auto";

  const xs = notes.map(n => {
    try { return (n.getNoteHeadBeginX() + n.getNoteHeadEndX()) / 2; } catch { return n.getAbsoluteX() + 6; }
  });
  return { xs, landY: stave.getYForLine(0) - (tuplets.length ? 44 : 28) };
}

/* ---------- Звук ---------- */

let audio = null;
let master = null; // барабани: леко ехо на стая + компресор
let clickBus = null; // метроном: сух, без ехо
let noiseBuf = null;
let snareHits = []; // готови записи на удара — няколко леко различни варианта
const live = new Set();

// закъснението между „пуснат звук“ и „чут звук“ — за да върви картината заедно със звука
const outLatency = () => (audio?.outputLatency || 0) + (audio?.baseLatency || 0);

function ac() {
  if (!audio) {
    audio = new AudioContext({ latencyHint: "interactive" });
    const comp = audio.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 10;
    comp.ratio.value = 3;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    comp.connect(audio.destination);

    master = audio.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    const room = audio.createConvolver();
    room.buffer = makeRoom();
    const wet = audio.createGain();
    wet.gain.value = 0.12;
    master.connect(room);
    room.connect(wet);
    wet.connect(comp);

    clickBus = audio.createGain();
    clickBus.connect(audio.destination);

    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// кратко меко ехо на малка стая
function makeRoom() {
  const len = Math.floor(audio.sampleRate * 0.7);
  const buf = audio.createBuffer(2, len, audio.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let smooth = 0;
    for (let i = 0; i < len; i++) {
      smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
      d[i] = smooth * Math.pow(1 - i / len, 3);
    }
  }
  return buf;
}

// Записва един удар по малък барабан: палка + тяло + пружини.
async function renderSnare() {
  const sr = 48000;
  const off = new OfflineAudioContext(1, Math.ceil(sr * 0.6), sr);
  const out = off.createGain();
  out.connect(off.destination);
  const noiseData = off.createBuffer(1, off.length, sr);
  const nd = noiseData.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  const tune = 0.97 + Math.random() * 0.06;

  const env = (peak, decay, attack = 0.001) => {
    const g = off.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    g.gain.exponentialRampToValueAtTime(peak, attack);
    g.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
    g.connect(out);
    return g;
  };
  const noiseThrough = (...filters) => {
    const s = off.createBufferSource();
    s.buffer = noiseData;
    let node = s;
    for (const [type, freq, q = 0.7] of filters) {
      const f = off.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    s.start(0);
    return node;
  };

  noiseThrough(["highpass", 2500]).connect(env(0.9, 0.012)); // удар на палката
  [[190, 165, 0.8, 0.14, "triangle"], [335, 300, 0.35, 0.09, "sine"]].forEach(([f0, f1, peak, decay, type]) => {
    const o = off.createOscillator(); // тялото на барабана
    o.type = type;
    o.frequency.setValueAtTime(f0 * tune, 0);
    o.frequency.exponentialRampToValueAtTime(f1 * tune, 0.06);
    o.connect(env(peak, decay));
    o.start(0);
  });
  noiseThrough(["bandpass", 4200, 0.6]).connect(env(0.75, 0.24, 0.002)); // пружините отдолу
  noiseThrough(["highpass", 7500]).connect(env(0.22, 0.13, 0.002)); // съскане

  const buf = await off.startRendering();
  const ch = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  for (let i = 0; i < ch.length; i++) ch[i] *= 0.9 / peak;
  return buf;
}

function prepareSnares() {
  Promise.all([0, 1, 2, 3].map(renderSnare))
    .then(buffers => { snareHits = buffers; })
    .catch(e => console.warn("Не мога да подготвя звука на барабана:", e));
}

function playSnare(t, vel = 1) {
  if (!snareHits.length) { // още не е готов записът
    noise(t, "highpass", 1200, 0.6 * vel, 0.18);
    tone(t, "triangle", 190, 120, 0.4 * vel, 0.1);
    return;
  }
  const src = audio.createBufferSource();
  src.buffer = snareHits[Math.floor(Math.random() * snareHits.length)];
  src.playbackRate.value = 0.99 + Math.random() * 0.02;
  const g = audio.createGain();
  g.gain.value = vel;
  src.connect(g);
  g.connect(master);
  live.add(src);
  src.onended = () => live.delete(src);
  src.start(t);
}

function envelope(t, peak, decay, dest = master) {
  const g = audio.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(dest);
  return g;
}

function startSrc(src, t, decay) {
  live.add(src);
  src.onended = () => live.delete(src);
  src.start(t);
  src.stop(t + decay + 0.05);
}

function tone(t, type, f0, f1, peak, decay, dest = master) {
  const o = audio.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(envelope(t, peak, decay, dest));
  startSrc(o, t, decay);
}

function noise(t, filterType, freq, peak, decay) {
  const s = audio.createBufferSource();
  s.buffer = noiseBuf;
  const f = audio.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  s.connect(f);
  f.connect(envelope(t, peak, decay));
  startSrc(s, t, decay);
}

const SOUNDS = {
  kick: t => tone(t, "sine", 150, 40, 1, 0.35),
  snare: (t, vel) => playSnare(t, vel),
  hihat: t => noise(t, "highpass", 7000, 0.3, 0.05),
  crash: t => noise(t, "highpass", 4500, 0.35, 1.2),
  tom_high: t => tone(t, "sine", 230, 150, 0.8, 0.3),
  tom_floor: t => tone(t, "sine", 120, 75, 0.9, 0.45),
  dum: t => { tone(t, "sine", 110, 65, 1, 0.5); noise(t, "lowpass", 400, 0.3, 0.08); },
  tek: t => { noise(t, "bandpass", 3500, 0.9, 0.06); tone(t, "sine", 900, 600, 0.25, 0.05); },
  ka: t => noise(t, "bandpass", 3000, 0.55, 0.05),
  click: (t, level = 0) => tone(t, "sine", [1200, 1500, 1900][level], null, [0.22, 0.3, 0.4][level], 0.05, clickBus),
};

/* ---------- Свирене ---------- */

let playId = 0;
let timers = [];
let track = []; // {t, m, idx, end} — кога коя нота звучи; по него скача топчето
let trackPos = 0;
let lastLanded = null;

const LOOKAHEAD = 0.25; // следващият такт се подготвя толкова секунди предварително
// след последната нота листът минава на следващия такт толкова по-късно — колкото да се види ударът
const switchDelay = dur => Math.min(0.12, dur * 0.4);

// изпълнява fn, когато звукът за момент t се чуе
function at(t, fn) {
  timers.push(setTimeout(fn, Math.max(0, (t + outLatency() - audio.currentTime) * 1000)));
}

function play() {
  if (state.playing) return stop();
  ac();
  state.playing = true;
  state.fromStart = state.mode === "auto" && state.measure === 0;
  const id = ++playId;
  updatePlayButton();

  // един такт отброяване
  const l = lesson();
  const quarter = 60 / state.tempo;
  const t0 = audio.currentTime + 0.15;
  track = [];
  trackPos = 0;
  clicks(l).forEach(c => {
    SOUNDS.click(t0 + c.at * quarter, c.level);
    if (!c.label) return;
    at(t0 + c.at * quarter, () => id === playId && setStatus(`Отброяване… ${c.label}`));
    track.push({ t: t0 + c.at * quarter, m: state.measure, idx: 0, end: null }); // подскача на място
  });
  scheduleMeasure(id, t0 + meter(l).beats * quarter);
}

// Планира звука на такт m от момент t. Звукът се задава точно по часовника на звуковата карта;
// таймерите на JS само рисуват и подготвят следващия такт предварително.
function scheduleMeasure(id, t, m = state.measure) {
  const l = lesson();
  const quarter = 60 / state.tempo;
  const { beats } = meter(l);
  const end = t + beats * quarter;
  const strong = new Set(clicks(l).filter(c => c.label).map(c => c.at.toFixed(4)));
  const last = m === bars().length - 1;
  const next = state.mode === "manual" ? m : last ? null : m + 1;

  let pos = 0;
  let lastWhen = t;
  bars()[m].forEach((n, idx) => {
    const when = t + pos * quarter;
    lastWhen = when;
    // по-силно на времената/дяловете, малко по-меко между тях, с лека жива разлика
    const vel = (strong.has(pos.toFixed(4)) ? 1 : 0.84) + (Math.random() - 0.5) * 0.06;
    track.push({ t: when, m, idx, end, rest: n.rest });
    n.voices.forEach(v => SOUNDS[v.sound]?.(when, vel));
    at(when, () => {
      if (id !== playId) return;
      if (state.measure !== m) { // резервно, ако смяната отдолу не е стигнала навреме
        state.measure = m;
        state.active = -1;
        updateMeasure();
      }
      highlight(idx);
    });
    pos += n.beats;
  });

  // веднага след удара на последната нота листът минава на следващия такт — детето вижда
  // новите ноти по-рано; звукът и ритъмът не се променят
  // (обикновено го прави анимацията точно по часовника на звука; това е резерва)
  if (next !== null && next !== m) {
    at(lastWhen + switchDelay(end - lastWhen) + 0.15, () => {
      if (id !== playId || state.measure === next) return;
      state.measure = next;
      state.active = -1;
      updateMeasure();
    });
  }

  clicks(l).forEach(c => {
    const when = t + c.at * quarter;
    if (state.metronome) SOUNDS.click(when, c.level);
    if (c.label) at(when, () => id === playId && setStatus(c.label));
  });

  if (next !== null) {
    at(end - Math.min(LOOKAHEAD, (beats * quarter) / 2), () => id === playId && scheduleMeasure(id, end, next));
    return;
  }
  at(end + 0.25, () => { // оставя последния удар да отзвучи
    if (id !== playId) return;
    const finished = state.fromStart;
    stop();
    if (finished) finishLesson();
    else setStatus("Пусни от първия такт, за да завършиш урока.");
  });
}

function stop() {
  playId++;
  timers.forEach(clearTimeout);
  timers = [];
  track = [];
  trackPos = 0;
  live.forEach(s => { try { s.stop(); } catch { /* вече спрян */ } });
  live.clear();
  if (!state.playing) return;
  state.playing = false;
  state.active = -1;
  if (state.view === "practice") {
    updatePlayButton();
    setStatus("");
    drawBig();
  }
}

function highlight(idx) {
  state.active = idx;
  drawBig();
}

function setMeasure(k) {
  stop();
  const total = bars().length;
  state.measure = Math.min(Math.max(k, 0), total - 1);
  state.active = -1;
  setStatus("");
  updateMeasure();
}

// При ръчен режим, докато свири: сменя такта веднага, без да спира звука.
// Иначе (автоматичен режим или на пауза): обичайна навигация със спиране.
function jumpMeasure(k) {
  const total = bars().length;
  const target = Math.min(Math.max(k, 0), total - 1);
  if (!state.playing || state.mode !== "manual") return setMeasure(target);

  playId++;
  timers.forEach(clearTimeout);
  timers = [];
  live.forEach(s => { try { s.stop(); } catch { /* вече спрян */ } });
  live.clear();

  state.measure = target;
  state.active = -1;
  track = [];
  trackPos = 0;
  updateMeasure();
  scheduleMeasure(++playId, audio.currentTime + 0.05);
}

function finishLesson() {
  const i = inst();
  const idx = state.lessonIdx;
  const ex = state.example;
  const hasNextExample = ex < lesson().parsedExamples.length - 1;
  const hasNextLesson = idx < i.lessons.length - 1;
  const next = hasNextExample
    ? `<button class="primary" data-next-example>Пример ${ex + 2} ›</button>`
    : hasNextLesson
      ? `<button class="primary" data-next-lesson>Урок ${idx + 2} ›</button>`
      : `<button class="primary" data-list>Към уроците</button>`;
  const dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.innerHTML = `
    <div class="dialog">
      <div class="hero-shape">${shapeSvg(lessonLook(idx))}</div>
      <h2>Браво!</h2>
      <p class="muted">Край на пример ${ex + 1} · Урок ${idx + 1} · ${esc(lesson().title)}.</p>
      <div class="dialog-actions">
        <button class="pill" data-again>Още веднъж</button>
        ${next}
      </div>
    </div>`;
  document.body.appendChild(dlg);
  celebrate(lessonLook(idx).color);
  tada();
  dlg.querySelector("[data-again]").onclick = () => { dlg.remove(); setMeasure(0); };
  dlg.querySelector("[data-next-example]")?.addEventListener("click", () => {
    dlg.remove();
    go("practice", { example: ex + 1, measure: 0, active: -1 });
  });
  dlg.querySelector("[data-next-lesson]")?.addEventListener("click", () => { dlg.remove(); go("intro", { lessonIdx: idx + 1 }); });
  dlg.querySelector("[data-list]")?.addEventListener("click", () => { dlg.remove(); go("instrument"); });
}

/* ---------- Награда ---------- */

// кратка весела мелодия: до – ми – сол – до
function tada() {
  ac();
  const t = audio.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.11, "triangle", f, null, 0.25, i === 3 ? 0.6 : 0.18));
}

// конфети и балони за 4 секунди
function celebrate(color) {
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.appendChild(canvas);
  const W = innerWidth;
  const H = innerHeight;
  const dpr = devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const colors = [color, ...PALETTE];
  const pick = () => colors[Math.floor(Math.random() * colors.length)];
  const pieces = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3, y: H * 0.35,
    vx: (Math.random() - 0.5) * 9, vy: -Math.random() * 11 - 4,
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: pick(),
  }));
  const balloons = Array.from({ length: 6 }, (_, i) => ({
    x: W * (0.1 + (0.8 * i) / 5) + (Math.random() - 0.5) * 40, y: H + 60 + Math.random() * 120,
    vy: 1.6 + Math.random() * 1.2, sway: Math.random() * 6.28, r: 22 + Math.random() * 8,
    c: i === 0 ? color : PALETTE[(i * 3) % PALETTE.length],
  }));

  const start = performance.now();
  function frame(now) {
    const sec = (now - start) / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = sec > 3.2 ? Math.max(0, 1 - (sec - 3.2) / 0.8) : 1;

    for (const p of pieces) {
      p.vy += 0.25;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    for (const b of balloons) {
      b.y -= b.vy;
      b.sway += 0.03;
      const bx = b.x + Math.sin(b.sway) * 12;
      const knot = b.y + b.r * 1.05;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, knot);
      ctx.quadraticCurveTo(bx + 6, knot + 25, bx, knot + 50);
      ctx.stroke();
      ctx.fillStyle = b.c;
      ctx.beginPath();
      ctx.ellipse(bx, b.y, b.r * 0.85, b.r * 1.05, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(bx - 4, knot + 4);
      ctx.lineTo(bx + 4, knot + 4);
      ctx.lineTo(bx, knot - 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.beginPath();
      ctx.ellipse(bx - b.r * 0.3, b.y - b.r * 0.4, b.r * 0.16, b.r * 0.26, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (sec < 4) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

/* ---------- Екрани ---------- */

function go(view, patch = {}) {
  stop();
  Object.assign(state, patch, { view });
  ({ home: renderHome, instrument: renderInstrument, intro: renderIntro, practice: renderPractice })[view]();
  window.scrollTo(0, 0);
}

function renderHome() {
  $app.innerHTML = `
    <header class="hero">
      <h1>Уроци по перкусии</h1>
      <p class="muted">Избери инструмент и започни от първия урок.</p>
    </header>
    <div class="cards">
      ${state.data.instruments.map(i => `
          <button class="card" data-inst="${esc(i.id)}">
            <span class="card-title">${esc(i.name)}</span>
            <span class="muted">${esc(i.subtitle)}</span>
            <span class="muted small">${i.lessons.length} урока</span>
          </button>`).join("")}
    </div>`;
  $app.querySelectorAll("[data-inst]").forEach(b => {
    b.onclick = () => go("instrument", { instId: b.dataset.inst });
  });
}

function renderInstrument() {
  const i = inst();
  const single = state.data.instruments.length === 1;
  $app.innerHTML = `
    ${single ? "" : `<button class="back" data-back>‹ Инструменти</button>`}
    <header class="hero">
      <h1>${esc(i.name)}</h1>
      <p class="muted">${esc(i.subtitle)}</p>
    </header>
    <div class="list">
      ${i.lessons.map((l, k) => {
        return `
          <button class="row" data-lesson="${k}">
            <span class="badge">${k + 1}</span>
            <span class="row-text">
              <span class="row-title">Урок ${k + 1} · ${esc(l.title)}</span>
              <span class="muted small">${esc(l.learn.join(" · "))}</span>
            </span>
            <span class="chev">›</span>
          </button>`;
      }).join("")}
    </div>`;
  if (!single) $("[data-back]").onclick = () => go("home");
  $app.querySelectorAll("[data-lesson]").forEach(b => {
    b.onclick = () => go("intro", { lessonIdx: Number(b.dataset.lesson) });
  });
}

function legend(l) {
  return `<ul class="legend">${l.usedVoices.map(v => `
    <li><b>${esc(v.label || "●")}</b>${esc(v.name)} <span class="muted small">— ${esc(v.hint)}</span></li>`).join("")}
  </ul>`;
}

function renderIntro() {
  const i = inst();
  const l = lesson();
  prepare(i, l);
  $app.innerHTML = `
    <button class="back" data-back>‹ ${esc(i.name)}</button>
    <header class="hero">
      <p class="eyebrow">Урок ${state.lessonIdx + 1}</p>
      <h1>${esc(l.title)}</h1>
      <p class="muted">Темпо ${l.tempo} · Размер ${esc(sizeLabel(l, true))} · ${l.parsedExamples.length} примера по ${l.parsedExamples[0].length} такта</p>
    </header>
    <section class="panel">
      <h2>Какво се учи</h2>
      <ul class="learn">${l.learn.map(x => `<li>${esc(x)}</li>`).join("")}</ul>
    </section>
    <section class="panel">
      <h2>Удари в този урок</h2>
      ${legend(l)}
    </section>
    <button class="primary big" data-start>Започни урока</button>`;
  $("[data-back]").onclick = () => go("instrument");
  $("[data-start]").onclick = () => go("practice", { example: 0, measure: 0, active: -1, tempo: l.tempo });
}

function renderPractice() {
  const l = lesson();
  prepare(inst(), l);
  const look = lessonLook(state.lessonIdx);
  $app.style.setProperty("--lesson", look.color);
  $app.innerHTML = `
    <div class="topbar">
      <button class="back" data-back>‹ Урок ${state.lessonIdx + 1} · ${esc(l.title)}</button>
      <span class="counter" id="counter"></span>
    </div>
    <div class="example-bar">
      <span class="muted">Пример</span>
      <div class="modes">
        ${l.parsedExamples.map((_, e) => `<button class="mode-btn ${e === state.example ? "active" : ""}" data-example="${e}">${e + 1}</button>`).join("")}
      </div>
      <span class="muted small">Размер ${esc(sizeLabel(l))}</span>
    </div>
    <section class="panel stage">
      <div class="big-wrap"><div id="big"></div><div id="hit" class="hit"></div><div id="ball" class="ball">${shapeSvg(look)}</div></div>
      <p id="status" class="status"></p>
    </section>
    <div class="controls">
      <button class="pill" data-prev>‹ Предишен такт</button>
      <button class="primary" id="play">▶ Свири</button>
      <button class="pill" data-next>Следващ такт ›</button>
    </div>
    <div class="options">
      <label class="tempo">Темпо
        <input type="range" id="tempo" min="30" max="160" value="${state.tempo}">
        <output id="tempoVal">${state.tempo}</output>
      </label>
      <label class="toggle"><input type="checkbox" id="metro" ${state.metronome ? "checked" : ""}> Метроном</label>
      <div class="modes" role="group" aria-label="Режим">
        <button class="mode-btn ${state.mode === "auto" ? "active" : ""}" data-mode="auto">Автоматично</button>
        <button class="mode-btn ${state.mode === "manual" ? "active" : ""}" data-mode="manual">Ръчно — аз сменям</button>
      </div>
    </div>
    <section class="panel">
      <h2>Всички ноти на урока</h2>
      <div class="tiles">
        ${bars().map((_, k) => `<button class="tile" data-m="${k}"><span class="tile-n">${k + 1}</span><div></div></button>`).join("")}
      </div>
    </section>
    <section class="panel">
      <h2>Удари</h2>
      ${legend(l)}
    </section>`;

  $("[data-back]").onclick = () => go("intro");
  $("[data-prev]").onclick = () => jumpMeasure(state.measure - 1);
  $("[data-next]").onclick = () => jumpMeasure(state.measure + 1);
  $("#play").onclick = play;
  $("#tempo").oninput = e => {
    state.tempo = Number(e.target.value);
    $("#tempoVal").textContent = state.tempo;
  };
  $("#metro").onchange = e => { state.metronome = e.target.checked; };
  $app.querySelectorAll("[data-mode]").forEach(btn => {
    btn.onclick = () => {
      if (state.mode === btn.dataset.mode) return;
      stop();
      state.mode = btn.dataset.mode;
      $app.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("active", b === btn));
    };
  });

  $app.querySelectorAll("[data-example]").forEach(btn => {
    btn.onclick = () => go("practice", { example: Number(btn.dataset.example), measure: 0, active: -1 });
  });

  $app.querySelectorAll(".tile").forEach((tile, k) => {
    drawMeasure(tile.querySelector("div"), l, bars()[k], { width: 300, height: 130, showSig: k === 0 });
    tile.onclick = () => jumpMeasure(k);
  });
  updateMeasure();
}

const BIG = { width: 640, height: 170, top: 50, showSig: true }; // отгоре има място за подскоците

function drawBig() {
  const el = document.getElementById("big");
  if (el) drawMeasure(el, lesson(), bars()[state.measure], { ...BIG, active: state.active });
}

// къде са нотите в такт m от избрания пример (рисува се веднъж настрани и се помни)
function layoutOf(m) {
  const cache = (lesson().layouts ??= {});
  const key = `${state.example}/${m}`;
  cache[key] ??= drawMeasure(document.createElement("div"), lesson(), bars()[m], BIG);
  return cache[key];
}

/* ---------- Топче ---------- */

// следващото кацане след последната нота на такта (още не е в track)
function nextAfter(cur) {
  if (cur.end == null) return null;
  const m = state.mode === "manual" ? cur.m : cur.m + 1;
  return m < bars().length ? { t: cur.end, m, idx: 0 } : null;
}

function animateBall() {
  requestAnimationFrame(animateBall);
  const ball = document.getElementById("ball");
  if (!ball) return;
  const svg = document.querySelector("#big svg");
  if (!state.playing || !audio || !track.length || !svg) return ball.classList.remove("on");

  // моментът, който се чува сега (+ половин кадър, защото картината излиза на екрана малко след рисуването)
  const now = audio.currentTime - outLatency() + 0.008;
  while (trackPos + 1 < track.length && track[trackPos + 1].t <= now) trackPos++;
  const cur = track[trackPos];
  if (cur.t > now) return ball.classList.remove("on");
  const s = svg.clientWidth / BIG.width;
  const nxt = track[trackPos + 1] || nextAfter(cur);
  const dur = nxt ? nxt.t - cur.t : 0.3;
  const since = now - cur.t; // колко време мина от удара
  const crossing = nxt && nxt.m !== cur.m; // последната нота преди нов такт
  // веднага след удара на последната нота — листът минава на следващия такт
  if (crossing && state.mode !== "manual" && state.measure === cur.m && since >= switchDelay(dur)) {
    state.measure = nxt.m;
    state.active = -1;
    updateMeasure();
  }
  const switched = cur.m !== state.measure; // листът вече показва новия такт

  // откъде скача топчето: от нотата — или, след смяната на листа, от началото на новия такт
  let x0, y0, t0 = cur.t, flight = dur;
  if (switched) {
    const a = layoutOf(state.measure);
    x0 = Math.max(24, a.xs[0] - 70);
    y0 = a.landY;
    t0 = cur.t + switchDelay(dur);
    flight = Math.max(0.05, dur - switchDelay(dur));
  } else {
    const a = layoutOf(cur.m);
    x0 = a.xs[cur.idx];
    y0 = a.landY;
    if (cur !== lastLanded) { // точно в момента на звука — кръгче на мястото на кацане
      lastLanded = cur;
      if (!cur.rest && since < 0.1) pulse(x0 * s, y0 * s);
    }
  }

  let x = x0;
  let y = y0;
  let sx = 1;
  let sy = 1;

  // сплескване веднага СЛЕД удара (не преди), за да се вижда кога точно е звукът
  const squash = Math.min(0.09, Math.max(0.06, dur * 0.5));
  if (!switched && !cur.rest && since < squash) {
    const k = 1 - since / squash;
    sx = 1 + 0.35 * k;
    sy = 1 - 0.3 * k;
  }

  // на последната нота топчето стои, докато листът се смени, после продължава в ритъм
  if (nxt && !(crossing && !switched && state.mode !== "manual")) {
    const b = layoutOf(nxt.m);
    const x1 = b.xs[nxt.idx];
    const p = Math.min(Math.max((now - t0) / flight, 0), 1); // постоянна скорост — без ускорение по средата
    const lift = Math.min(Math.max(dur * 55, Math.abs(x1 - x0) * 0.1, 10), 40); // по-дълга нота или по-далечен скок — по-високо
    x = x0 + (x1 - x0) * p;
    y = y0 + (b.landY - y0) * p - lift * 4 * p * (1 - p);
    if (p > 0.8 && sx === 1) { // леко издължено при падане
      const k = (p - 0.8) / 0.2;
      sx = 1 - 0.1 * k;
      sy = 1 + 0.14 * k;
    }
  }
  ball.style.transform = `translate(${x * s}px, ${y * s}px) translate(-50%, -100%) scale(${sx}, ${sy})`;
  ball.classList.add("on");
}

function pulse(px, py) {
  const hit = document.getElementById("hit");
  if (!hit) return;
  hit.style.setProperty("--pos", `translate(${px}px, ${py}px)`);
  hit.classList.remove("go");
  void hit.offsetWidth; // рестартира анимацията
  hit.classList.add("go");
}

function updateMeasure() {
  const total = bars().length;
  drawBig();
  $("#counter").textContent = `Пример ${state.example + 1} · Такт ${state.measure + 1} от ${total}`;
  $app.querySelectorAll(".tile").forEach((t, k) => t.classList.toggle("current", k === state.measure));
  $("[data-prev]").disabled = state.measure === 0;
  $("[data-next]").disabled = state.measure === total - 1;
}

function updatePlayButton() {
  const btn = document.getElementById("play");
  if (btn) btn.textContent = state.playing ? "■ Спри" : "▶ Свири";
}

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

document.addEventListener("keydown", e => {
  if (state.view !== "practice" || document.querySelector(".overlay")) return;
  if (e.target.matches?.("input")) return;
  if (e.code === "Space") { e.preventDefault(); play(); }
  if (e.code === "ArrowLeft") jumpMeasure(state.measure - 1);
  if (e.code === "ArrowRight") jumpMeasure(state.measure + 1);
});

/* ---------- Старт ---------- */

async function init() {
  state.api = await waitApi();
  try {
    state.data = state.api ? await state.api.get_lessons() : await (await fetch("lessons.json")).json();
  } catch (e) {
    $app.innerHTML = `<p class="error">Не мога да заредя уроците: ${esc(e.message)}</p>`;
    return;
  }
  const [only, ...others] = state.data.instruments;
  if (only && !others.length) go("instrument", { instId: only.id });
  else go("home");
}

prepareSnares();
init();
animateBall();
