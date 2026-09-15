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
  measure: 0,
  active: -1,
  playing: false,
  fromStart: false,
  tempo: 60,
  loop: false,
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
  const dotted = durRaw.endsWith("d");
  const dur = dotted ? durRaw.slice(0, -1) : durRaw;
  if (!(dur in DUR)) throw new Error(`Непозната дължина "${durRaw}" в "${tok}"`);
  const rest = voicesRaw === "r";
  const voices = rest ? [] : voicesRaw.split("+").map(id => {
    if (!i.voices[id]) throw new Error(`Непознат удар "${id}" в "${tok}"`);
    return i.voices[id];
  });
  return {
    dur, dotted, rest, voices,
    label: label ?? voices.map(v => v.label).filter(Boolean).join(""),
    beats: DUR[dur] * (dotted ? 1.5 : 1),
  };
}

function prepare(i, l) {
  if (l.parsed) return;
  const expected = meter(l).beats;
  l.parsed = l.measures.map((m, k) => {
    const notes = m.trim().split(/\s+/).map(t => parseToken(t, i));
    const sum = notes.reduce((a, n) => a + n.beats, 0);
    if (Math.abs(sum - expected) > 1e-6) {
      console.warn(`„${l.title}“, такт ${k + 1}: ${sum} четвъртини вместо ${expected}`);
    }
    return notes;
  });
  l.usedVoices = [...new Set(l.parsed.flat().flatMap(n => n.voices))];
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

function drawMeasure(el, l, k, { width, height, showSig, active = -1 }) {
  el.innerHTML = "";
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  const stave = new VF.Stave(10, 10, width - 20);
  if (showSig) stave.addClef("percussion").addTimeSignature(l.timeSignature);
  stave.setContext(ctx).draw();

  const notes = l.parsed[k].map((n, idx) => {
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

  const { num, den } = meter(l);
  const voice = new VF.Voice({ num_beats: num, beat_value: den })
    .setMode(VF.Voice.Mode.SOFT)
    .addTickables(notes);
  const groups = (l.beamGroups || []).map(g => new VF.Fraction(...g.split("/").map(Number)));
  const beams = VF.Beam.generateBeams(notes, {
    stem_direction: VF.Stem.UP,
    ...(groups.length ? { groups } : {}),
  });
  new VF.Formatter().joinVoices([voice]).format([voice], stave.getNoteEndX() - stave.getNoteStartX() - 16);
  voice.draw(ctx, stave);
  beams.forEach(b => b.setContext(ctx).draw());

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
  click: (t, accent) => tone(t, "square", accent ? 1600 : 1000, null, 0.12, 0.03),
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
  state.fromStart = state.measure === 0 && !state.loop;
  const id = ++playId;
  updatePlayButton();

  // един такт отброяване
  const l = lesson();
  const { num, step } = meter(l);
  const stepSec = (step * 60) / state.tempo;
  const t0 = audio.currentTime + 0.15;
  for (let b = 0; b < num; b++) {
    SOUNDS.click(t0 + b * stepSec, b === 0);
    at(t0 + b * stepSec, () => id === playId && setStatus(`Отброяване… ${b + 1}`));
  }
  scheduleMeasure(id, t0 + num * stepSec);
}

function scheduleMeasure(id, t) {
  const l = lesson();
  const m = state.measure;
  const quarter = 60 / state.tempo;
  const { num, step, beats } = meter(l);

  let x = t;
  l.parsed[m].forEach((n, idx) => {
    const when = x;
    n.voices.forEach(v => SOUNDS[v.sound]?.(when));
    at(when, () => id === playId && state.measure === m && highlight(idx));
    x += n.beats * quarter;
  });

  for (let b = 0; b < num; b++) {
    const when = t + b * step * quarter;
    if (state.metronome) SOUNDS.click(when, b === 0);
    at(when, () => id === playId && setStatus(String(b + 1)));
  }

  const end = t + beats * quarter;
  at(end - 0.05, () => {
    if (id !== playId) return;
    if (state.loop) return scheduleMeasure(id, end);
    if (state.measure < l.parsed.length - 1) {
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
  const total = lesson().parsed.length;
  state.measure = Math.min(Math.max(k, 0), total - 1);
  state.active = -1;
  setStatus("");
  updateMeasure();
}

function finishLesson() {
  const i = inst();
  const idx = state.lessonIdx;
  const key = lessonKey(i, idx);
  if (!state.progress.completed.includes(key)) {
    state.progress.completed.push(key);
    saveProgress();
  }
  const hasNext = idx < i.lessons.length - 1;
  const dlg = document.createElement("div");
  dlg.className = "overlay";
  dlg.innerHTML = `
    <div class="dialog">
      <h2>Браво!</h2>
      <p class="muted">Завърши урок ${idx + 1} · ${esc(lesson().title)}.</p>
      <div class="dialog-actions">
        <button class="pill" data-again>Още веднъж</button>
        ${hasNext
          ? `<button class="primary" data-next-lesson>Урок ${idx + 2} ›</button>`
          : `<button class="primary" data-list>Към уроците</button>`}
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelector("[data-again]").onclick = () => { dlg.remove(); setMeasure(0); };
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
        const done = isDone(i, k);
        return `
          <button class="row" data-lesson="${k}">
            <span class="badge ${done ? "done" : ""}">${done ? "✓" : k + 1}</span>
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
      <p class="muted">Темпо ${l.tempo} · Размер ${esc(l.timeSignature)} · ${l.measures.length} такта</p>
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
  $("[data-start]").onclick = () => go("practice", { measure: 0, active: -1, tempo: l.tempo });
}

function renderPractice() {
  const l = lesson();
  prepare(inst(), l);
  $app.innerHTML = `
    <div class="topbar">
      <button class="back" data-back>‹ Урок ${state.lessonIdx + 1} · ${esc(l.title)}</button>
      <span class="counter" id="counter"></span>
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
      <label class="toggle"><input type="checkbox" id="loop" ${state.loop ? "checked" : ""}> Повтаряй такта</label>
    </div>
    <section class="panel">
      <h2>Всички ноти на урока</h2>
      <div class="tiles">
        ${l.parsed.map((_, k) => `<button class="tile" data-m="${k}"><span class="tile-n">${k + 1}</span><div></div></button>`).join("")}
      </div>
    </section>
    <section class="panel">
      <h2>Удари</h2>
      ${legend(l)}
    </section>`;

  $("[data-back]").onclick = () => go("intro");
  $("[data-prev]").onclick = () => setMeasure(state.measure - 1);
  $("[data-next]").onclick = () => setMeasure(state.measure + 1);
  $("#play").onclick = play;
  $("#tempo").oninput = e => {
    state.tempo = Number(e.target.value);
    $("#tempoVal").textContent = state.tempo;
  };
  $("#metro").onchange = e => { state.metronome = e.target.checked; };
  $("#loop").onchange = e => { state.loop = e.target.checked; };

  $app.querySelectorAll(".tile").forEach((tile, k) => {
    drawMeasure(tile.querySelector("div"), l, k, { width: 300, height: 130, showSig: k === 0 });
    tile.onclick = () => setMeasure(k);
  });
  updateMeasure();
}

function drawBig() {
  const el = document.getElementById("big");
  if (el) drawMeasure(el, lesson(), state.measure, { width: 640, height: 130, showSig: true, active: state.active });
}

function updateMeasure() {
  const total = lesson().parsed.length;
  drawBig();
  $("#counter").textContent = `Такт ${state.measure + 1} от ${total}`;
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
  if (e.code === "ArrowLeft") setMeasure(state.measure - 1);
  if (e.code === "ArrowRight") setMeasure(state.measure + 1);
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
