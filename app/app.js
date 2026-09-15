"use strict";

const VF = Vex.Flow;
const ACCENT = "#0071e3";
const DUR = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25 }; // в четвъртини

const state = {
  data: null,
  api: null,
  progress: { completed: [] },
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
const lessonKey = (i, idx) => `${i.id}/${i.lessons[idx].id}`;
const isDone = (i, idx) => state.progress.completed.includes(lessonKey(i, idx));

/* ---------- Данни ---------- */

function meter(l) {
  const [num, den] = l.timeSignature.split("/").map(Number);
  return { num, den, beats: (num * 4) / den, step: 4 / den };
}

// "8:hh+bd:R" → дължина, удари, надпис
function parseToken(tok, i) {
  const [durRaw, voicesRaw = "", label] = tok.split(":");
  const triplet = durRaw.startsWith("t"); // t8 = осмина в триола
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
    dur, dotted, triplet, rest, voices,
    label: label ?? voices.map(v => v.label).filter(Boolean).join(""),
    beats: DUR[dur] * (dotted ? 1.5 : 1) * (triplet ? 2 / 3 : 1),
  };
}

function prepare(i, l) {
  if (l.parsedExamples) return;
  const expected = meter(l).beats;
  l.parsedExamples = (l.examples || [l.measures]).map((ex, e) => ex.map((m, k) => {
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

const sizeLabel = l => l.timeSignature + (l.parts ? ` (${l.parts.join("+")})` : "");

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
    if (window.pywebview?.api?.load_progress) return resolve(window.pywebview.api);
    const timer = setTimeout(() => resolve(null), 1500);
    window.addEventListener("pywebviewready", () => {
      clearTimeout(timer);
      resolve(window.pywebview.api);
    }, { once: true });
  });
}

async function loadProgress() {
  if (state.api) return state.api.load_progress();
  try {
    return JSON.parse(localStorage.getItem("progress")) || { completed: [] };
  } catch {
    return { completed: [] };
  }
}

function saveProgress() {
  if (state.api) return state.api.save_progress(state.progress);
  try { localStorage.setItem("progress", JSON.stringify(state.progress)); } catch { /* няма къде */ }
}

/* ---------- Ноти ---------- */

function drawMeasure(el, l, data, { width, height, showSig, active = -1 }) {
  el.innerHTML = "";
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, 10, width - 20);
  if (showSig) stave.addClef("percussion").addTimeSignature(l.timeSignature);
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

  // триоли: поредни триолни ноти за общо 1 удар = една скоба
  const tuplets = [];
  let group = [];
  let acc = 0;
  data.forEach((n, idx) => {
    if (!n.triplet) { group = []; acc = 0; return; }
    group.push(notes[idx]);
    acc += n.beats;
    if (Math.abs(acc - 1) < 1e-6) {
      tuplets.push(new VF.Tuplet(group, { num_notes: 3, notes_occupied: 2 }));
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
}

/* ---------- Звук ---------- */

let audio = null;
let master = null;
let noiseBuf = null;
const live = new Set();

function ac() {
  if (!audio) {
    audio = new AudioContext();
    master = audio.createGain();
    master.gain.value = 0.8;
    master.connect(audio.destination);
    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

function envelope(t, peak, decay) {
  const g = audio.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + decay);
  g.connect(master);
  return g;
}

function startSrc(src, t, decay) {
  live.add(src);
  src.onended = () => live.delete(src);
  src.start(t);
  src.stop(t + decay + 0.05);
}

function tone(t, type, f0, f1, peak, decay) {
  const o = audio.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + decay);
  o.connect(envelope(t, peak, decay));
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
  snare: t => { noise(t, "highpass", 1200, 0.6, 0.18); tone(t, "triangle", 190, 120, 0.4, 0.1); },
  hihat: t => noise(t, "highpass", 7000, 0.3, 0.05),
  crash: t => noise(t, "highpass", 4500, 0.35, 1.2),
  tom_high: t => tone(t, "sine", 230, 150, 0.8, 0.3),
  tom_floor: t => tone(t, "sine", 120, 75, 0.9, 0.45),
  dum: t => { tone(t, "sine", 110, 65, 1, 0.5); noise(t, "lowpass", 400, 0.3, 0.08); },
  tek: t => { noise(t, "bandpass", 3500, 0.9, 0.06); tone(t, "sine", 900, 600, 0.25, 0.05); },
  ka: t => noise(t, "bandpass", 3000, 0.55, 0.05),
  click: (t, level = 0) => tone(t, "square", [1000, 1300, 1600][level], null, [0.09, 0.12, 0.14][level], 0.03),
};

/* ---------- Свирене ---------- */

let playId = 0;
let timers = [];

function at(t, fn) {
  timers.push(setTimeout(fn, Math.max(0, (t - audio.currentTime) * 1000)));
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
  clicks(l).forEach(c => {
    SOUNDS.click(t0 + c.at * quarter, c.level);
    if (c.label) at(t0 + c.at * quarter, () => id === playId && setStatus(`Отброяване… ${c.label}`));
  });
  scheduleMeasure(id, t0 + meter(l).beats * quarter);
}

function scheduleMeasure(id, t) {
  const l = lesson();
  const m = state.measure;
  const quarter = 60 / state.tempo;
  const { beats } = meter(l);

  let x = t;
  bars()[m].forEach((n, idx) => {
    const when = x;
    n.voices.forEach(v => SOUNDS[v.sound]?.(when));
    at(when, () => id === playId && state.measure === m && highlight(idx));
    x += n.beats * quarter;
  });

  clicks(l).forEach(c => {
    const when = t + c.at * quarter;
    if (state.metronome) SOUNDS.click(when, c.level);
    if (c.label) at(when, () => id === playId && setStatus(c.label));
  });

  const end = t + beats * quarter;
  at(end - 0.05, () => {
    if (id !== playId) return;
    if (state.mode === "manual") return scheduleMeasure(id, end);
    if (state.measure < bars().length - 1) {
      state.measure++;
      state.active = -1;
      updateMeasure();
      return scheduleMeasure(id, end);
    }
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
  updateMeasure();
  scheduleMeasure(++playId, audio.currentTime + 0.05);
}

function finishLesson() {
  const i = inst();
  const idx = state.lessonIdx;
  const ex = state.example;
  const hasNextExample = ex < lesson().parsedExamples.length - 1;
  const hasNextLesson = idx < i.lessons.length - 1;
  const key = lessonKey(i, idx);
  if (!hasNextExample && !state.progress.completed.includes(key)) {
    state.progress.completed.push(key);
    saveProgress();
  }
  const next = hasNextExample
    ? `<button class="primary" data-next-example>Пример ${ex + 2} ›</button>`
    : hasNextLesson
      ? `<button class="primary" data-next-lesson>Урок ${idx + 2} ›</button>`
      : `<button class="primary" data-list>Към уроците</button>`;
  const dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.innerHTML = `
    <div class="dialog">
      <h2>Браво!</h2>
      <p class="muted">Край на пример ${ex + 1} · Урок ${idx + 1} · ${esc(lesson().title)}.</p>
      <div class="dialog-actions">
        <button class="pill" data-again>Още веднъж</button>
        ${next}
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("[data-again]").onclick = () => { dlg.remove(); setMeasure(0); };
  dlg.querySelector("[data-next-example]")?.addEventListener("click", () => {
    dlg.remove();
    go("practice", { example: ex + 1, measure: 0, active: -1 });
  });
  dlg.querySelector("[data-next-lesson]")?.addEventListener("click", () => { dlg.remove(); go("intro", { lessonIdx: idx + 1 }); });
  dlg.querySelector("[data-list]")?.addEventListener("click", () => { dlg.remove(); go("instrument"); });
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
      ${state.data.instruments.map(i => {
        const done = i.lessons.filter((_, k) => isDone(i, k)).length;
        return `
          <button class="card" data-inst="${esc(i.id)}">
            <span class="card-title">${esc(i.name)}</span>
            <span class="muted">${esc(i.subtitle)}</span>
            <span class="bar"><span style="width:${(done / i.lessons.length) * 100}%"></span></span>
            <span class="muted small">${done} от ${i.lessons.length} урока</span>
          </button>`;
      }).join("")}
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
      <p class="muted">Темпо ${l.tempo} · Размер ${esc(sizeLabel(l))} · ${l.parsedExamples.length} примера по ${l.parsedExamples[0].length} такта</p>
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
      <div id="big"></div>
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

function drawBig() {
  const el = document.getElementById("big");
  if (el) drawMeasure(el, lesson(), bars()[state.measure], { width: 640, height: 130, showSig: true, active: state.active });
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
    state.progress = await loadProgress();
  } catch (e) {
    $app.innerHTML = `<p class="error">Не мога да заредя уроците: ${esc(e.message)}</p>`;
    return;
  }
  const [only, ...others] = state.data.instruments;
  if (only && !others.length) go("instrument", { instId: only.id });
  else go("home");
}

init();
