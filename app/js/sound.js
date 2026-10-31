// Звукът: барабанът и метрономът се правят със Web Audio (без готови звукови файлове).

let audio = null;       // звуковата система на браузъра
let master = null;      // главният звук на барабаните (с леко ехо и компресор)
let clickBus = null;    // метроном: отделен, без ехо
let noiseBuf = null;    // запис от шум — основа на много от звуците
let snareHits = [];     // готови записи на удара на малкия барабан (няколко леко различни)
const liveSounds = new Set(); // звуците, които свирят в момента (за да може да се спрат)

// Настройки на компресора — не позволява звукът да е прекалено силен
const COMPRESSOR_THRESHOLD = -14;
const COMPRESSOR_KNEE = 10;
const COMPRESSOR_RATIO = 3;
const COMPRESSOR_ATTACK = 0.002;
const COMPRESSOR_RELEASE = 0.15;

const MASTER_VOLUME = 0.9;
const ECHO_VOLUME = 0.12;

const ROOM_SECONDS = 0.7;
const ROOM_CHANNELS = 2;
const ROOM_SMOOTHING = 0.6;     // колко от предишната стойност се пази (меко, не пронизващо ехо)
const ROOM_FADE_POWER = 3;

function createCompressor() {
  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_THRESHOLD;
  compressor.knee.value = COMPRESSOR_KNEE;
  compressor.ratio.value = COMPRESSOR_RATIO;
  compressor.attack.value = COMPRESSOR_ATTACK;
  compressor.release.value = COMPRESSOR_RELEASE;
  compressor.connect(audio.destination);
  return compressor;
}

// Барабаните: силата се контролира от master, плюс малко ехо на стая
function createDrumBus(compressor) {
  master = audio.createGain();
  master.gain.value = state.sound ? MASTER_VOLUME : 0;
  master.connect(compressor);

  const room = audio.createConvolver();
  room.buffer = makeRoom();
  const echoVolume = audio.createGain();
  echoVolume.gain.value = ECHO_VOLUME;
  master.connect(room);
  room.connect(echoVolume);
  echoVolume.connect(compressor);
}

// Метрономът върви направо към колонките
function createClickBus() {
  clickBus = audio.createGain();
  clickBus.connect(audio.destination);
}

function randomNoiseValue() {
  return Math.random() * 2 - 1;
}

function fillWithNoise(samples) {
  for (let i = 0; i < samples.length; i++) {
    samples[i] = randomNoiseValue();
  }
}

// Една секунда случаен шум
function createNoiseBuffer(context) {
  const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  fillWithNoise(buffer.getChannelData(0));
  return buffer;
}

// Създава звуковата система при първо ползване
function startAudio() {
  if (!audio) {
    audio = new AudioContext({ latencyHint: "interactive" });
    const compressor = createCompressor();
    createDrumBus(compressor);
    createClickBus();
    noiseBuf = createNoiseBuffer(audio);
  }
  if (audio.state === "suspended") audio.resume();
  return audio;
}

// Закъснението между „пуснат звук“ и „чут звук“ — за да върви картината заедно със звука
function outputLatency() {
  if (!audio) return 0;
  return (audio.outputLatency || 0) + (audio.baseLatency || 0);
}

// Кой момент от звука излиза от колонките точно сега
function heardNow() {
  const stamp = audio.getOutputTimestamp ? audio.getOutputTimestamp() : null;
  if (!stamp || !stamp.contextTime) {
    return audio.currentTime - outputLatency();
  }
  return stamp.contextTime + (performance.now() - stamp.performanceTime) / 1000;
}

// Кратко меко ехо на малка стая
function makeRoom() {
  const length = Math.floor(audio.sampleRate * ROOM_SECONDS);
  const buffer = audio.createBuffer(ROOM_CHANNELS, length, audio.sampleRate);
  for (let channel = 0; channel < ROOM_CHANNELS; channel++) {
    fillRoomChannel(buffer.getChannelData(channel));
  }
  return buffer;
}

function fillRoomChannel(samples) {
  const length = samples.length;
  let smooth = 0;
  for (let i = 0; i < length; i++) {
    smooth = smooth * ROOM_SMOOTHING + randomNoiseValue() * (1 - ROOM_SMOOTHING);
    samples[i] = smooth * Math.pow(1 - i / length, ROOM_FADE_POWER); // затихва към края
  }
}

/* ---------- Малкият барабан ---------- */

const SNARE_SAMPLE_RATE = 48000;
const SNARE_SECONDS = 0.6;
const SNARE_PEAK_LEVEL = 0.9;   // най-високата точка на готовия запис
const SNARE_VARIANTS = 4;
const SNARE_TUNE_MIN = 0.97;    // всеки запис е леко различно настроен
const SNARE_TUNE_RANGE = 0.06;
const SNARE_SILENCE = 0.0001;   // експоненциалното затихване не може да стигне точно 0

const STICK_FILTER = { type: "highpass", frequency: 2500, q: 0.7 };
const STICK_ENVELOPE = { peak: 0.9, decay: 0.012, attack: 0.001 };

const BODY_DROP_SECONDS = 0.06;
const BODY_ATTACK = 0.001;
const BODY_TONES = [
  { from: 190, to: 165, peak: 0.8, decay: 0.14, type: "triangle" },
  { from: 335, to: 300, peak: 0.35, decay: 0.09, type: "sine" },
];

const WIRES_FILTER = { type: "bandpass", frequency: 4200, q: 0.6 };
const WIRES_ENVELOPE = { peak: 0.75, decay: 0.24, attack: 0.002 };
const SIZZLE_FILTER = { type: "highpass", frequency: 7500, q: 0.7 };
const SIZZLE_ENVELOPE = { peak: 0.22, decay: 0.13, attack: 0.002 };

// Плик на звука: бързо се усилва (attack), после затихва (decay)
function createSnareEnvelope(context, output, envelope) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(SNARE_SILENCE, 0);
  gain.gain.exponentialRampToValueAtTime(envelope.peak, envelope.attack);
  gain.gain.exponentialRampToValueAtTime(SNARE_SILENCE, envelope.attack + envelope.decay);
  gain.connect(output);
  return gain;
}

// Шум през филтър ("highpass" пропуска само високите звуци, "bandpass" — един тесен пояс)
function createFilteredNoise(context, noiseBuffer, filterSettings) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = filterSettings.type;
  filter.frequency.value = filterSettings.frequency;
  filter.Q.value = filterSettings.q;
  source.connect(filter);
  source.start(0);
  return filter;
}

// 1) удар на палката
function addStickHit(context, noiseBuffer, output) {
  const envelope = createSnareEnvelope(context, output, STICK_ENVELOPE);
  createFilteredNoise(context, noiseBuffer, STICK_FILTER).connect(envelope);
}

// 2) тялото на барабана — два тона, които леко падат надолу
function addDrumBody(context, output, tune) {
  for (const bodyTone of BODY_TONES) {
    const oscillator = context.createOscillator();
    oscillator.type = bodyTone.type;
    oscillator.frequency.setValueAtTime(bodyTone.from * tune, 0);
    oscillator.frequency.exponentialRampToValueAtTime(bodyTone.to * tune, BODY_DROP_SECONDS);
    const envelope = createSnareEnvelope(context, output, {
      peak: bodyTone.peak, decay: bodyTone.decay, attack: BODY_ATTACK,
    });
    oscillator.connect(envelope);
    oscillator.start(0);
  }
}

// 3) пружините отдолу и съскането
function addSnareWires(context, noiseBuffer, output) {
  const wiresEnvelope = createSnareEnvelope(context, output, WIRES_ENVELOPE);
  createFilteredNoise(context, noiseBuffer, WIRES_FILTER).connect(wiresEnvelope);
  const sizzleEnvelope = createSnareEnvelope(context, output, SIZZLE_ENVELOPE);
  createFilteredNoise(context, noiseBuffer, SIZZLE_FILTER).connect(sizzleEnvelope);
}

// Изравнява силата, за да е най-високата точка SNARE_PEAK_LEVEL
function normalizeBuffer(buffer) {
  const samples = buffer.getChannelData(0);
  let highest = 0;
  for (let i = 0; i < samples.length; i++) {
    highest = Math.max(highest, Math.abs(samples[i]));
  }
  for (let i = 0; i < samples.length; i++) {
    samples[i] = samples[i] * SNARE_PEAK_LEVEL / highest;
  }
}

// Записва един удар по малък барабан: палка + тяло + пружини.
// Ползва OfflineAudioContext — „свири“ на скрито и връща готов запис.
async function renderSnare() {
  const context = new OfflineAudioContext(1, Math.ceil(SNARE_SAMPLE_RATE * SNARE_SECONDS), SNARE_SAMPLE_RATE);
  const output = context.createGain();
  output.connect(context.destination);

  const noiseBuffer = createNoiseBuffer(context);
  const tune = SNARE_TUNE_MIN + Math.random() * SNARE_TUNE_RANGE;

  addStickHit(context, noiseBuffer, output);
  addDrumBody(context, output, tune);
  addSnareWires(context, noiseBuffer, output);

  const buffer = await context.startRendering();
  normalizeBuffer(buffer);
  return buffer;
}

// Приготвя няколко записа на удара още при отваряне на програмата
function prepareSnares() {
  const renders = [];
  for (let i = 0; i < SNARE_VARIANTS; i++) {
    renders.push(renderSnare());
  }
  Promise.all(renders)
    .then(buffers => { snareHits = buffers; })
    .catch(e => console.warn("Не мога да подготвя звука на барабана:", e));
}

// Прост звук, докато записите още не са готови
function playFallbackSnare(startTime, loudness) {
  noise(startTime, "highpass", 1200, 0.6 * loudness, 0.18);
  tone(startTime, "triangle", 190, 120, 0.4 * loudness, 0.1);
}

function pickRandomSnareHit() {
  return snareHits[Math.floor(Math.random() * snareHits.length)];
}

// Свири удар по малък барабан в момент startTime
function playSnare(startTime, loudness) {
  if (snareHits.length === 0) {
    playFallbackSnare(startTime, loudness);
    return;
  }
  const source = audio.createBufferSource();
  source.buffer = pickRandomSnareHit();
  source.playbackRate.value = 0.99 + Math.random() * 0.02;
  const gain = audio.createGain();
  gain.gain.value = loudness;
  source.connect(gain);
  gain.connect(master);
  liveSounds.add(source);
  source.onended = () => liveSounds.delete(source);
  source.start(startTime);
}

/* ---------- Прости звуци ---------- */

const ENVELOPE_FLOOR = 0.001;   // експоненциалното затихване не може да стигне точно 0
const STOP_MARGIN = 0.05;       // малко време след затихването, преди източникът да се спре

// Плик: звукът започва със сила peak и затихва за decay секунди
function makeEnvelope(startTime, peak, decay, destination) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(peak, startTime);
  gain.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, startTime + decay);
  gain.connect(destination);
  return gain;
}

// Пуска източник на звук и го спира, когато затихне
function startSource(source, startTime, decay) {
  liveSounds.add(source);
  source.onended = () => liveSounds.delete(source);
  source.start(startTime);
  source.stop(startTime + decay + STOP_MARGIN);
}

// Чист тон, който пада от startFrequency до endFrequency (ако endFrequency е null — остава същият)
function tone(startTime, type, startFrequency, endFrequency, peak, decay, destination) {
  const oscillator = audio.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startFrequency, startTime);
  if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + decay);
  oscillator.connect(makeEnvelope(startTime, peak, decay, destination || master));
  startSource(oscillator, startTime, decay);
}

// Шум през филтър
function noise(startTime, filterType, frequency, peak, decay) {
  const source = audio.createBufferSource();
  source.buffer = noiseBuf;
  const filter = audio.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  source.connect(filter);
  filter.connect(makeEnvelope(startTime, peak, decay, master));
  startSource(source, startTime, decay);
}

// Звуците, които могат да се посочат в "sound" на удар в lessons.json
const SOUNDS = {
  kick: startTime => tone(startTime, "sine", 150, 40, 1, 0.35),
  snare: (startTime, loudness) => playSnare(startTime, loudness),
  hihat: startTime => noise(startTime, "highpass", 7000, 0.3, 0.05),
  crash: startTime => noise(startTime, "highpass", 4500, 0.35, 1.2),
  tom_high: startTime => tone(startTime, "sine", 230, 150, 0.8, 0.3),
  tom_floor: startTime => tone(startTime, "sine", 120, 75, 0.9, 0.45),
  dum: startTime => { tone(startTime, "sine", 110, 65, 1, 0.5); noise(startTime, "lowpass", 400, 0.3, 0.08); },
  tek: startTime => { noise(startTime, "bandpass", 3500, 0.9, 0.06); tone(startTime, "sine", 900, 600, 0.25, 0.05); },
  ka: startTime => noise(startTime, "bandpass", 3000, 0.55, 0.05),
};

const CLICK_PITCHES = [1200, 1500, 1900];
const CLICK_VOLUMES = [0.22, 0.3, 0.4];
const CLICK_DECAY = 0.05;

// Клик на метронома. level: 0 обикновен, 1 по-висок, 2 най-висок (началото на такта)
function playClick(startTime, level) {
  tone(startTime, "sine", CLICK_PITCHES[level], null, CLICK_VOLUMES[level], CLICK_DECAY, clickBus);
}

const TADA_NOTES = [523.25, 659.25, 783.99, 1046.5];
const TADA_NOTE_GAP = 0.11;
const TADA_SHORT_DECAY = 0.18;
const TADA_LAST_DECAY = 0.6;
const TADA_VOLUME = 0.25;
const TADA_DELAY = 0.02;

// Кратка весела мелодия при завършен урок: до – ми – сол – до
function playTada() {
  startAudio();
  const start = audio.currentTime + TADA_DELAY;
  const lastIndex = TADA_NOTES.length - 1;
  for (let i = 0; i < TADA_NOTES.length; i++) {
    const decay = i === lastIndex ? TADA_LAST_DECAY : TADA_SHORT_DECAY;
    tone(start + i * TADA_NOTE_GAP, "triangle", TADA_NOTES[i], null, TADA_VOLUME, decay);
  }
}
