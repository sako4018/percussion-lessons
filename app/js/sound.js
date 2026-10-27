// Звукът: барабанът и метрономът се правят със Web Audio (без готови звукови файлове).

let audio = null;       // звуковата система на браузъра
let master = null;      // главният звук на барабаните (с леко ехо и компресор)
let clickBus = null;    // метроном: отделен, без ехо
let noiseBuf = null;    // запис от шум — основа на много от звуците
let snareHits = [];     // готови записи на удара на малкия барабан (няколко леко различни)
const liveSounds = new Set(); // звуците, които свирят в момента (за да може да се спрат)

// Създава звуковата система при първо ползване
function startAudio() {
  if (!audio) {
    audio = new AudioContext({ latencyHint: "interactive" });

    // компресорът не позволява звукът да е прекалено силен
    const compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -14;
    compressor.knee.value = 10;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.15;
    compressor.connect(audio.destination);

    // барабаните: силата се контролира от master, плюс малко ехо на стая
    master = audio.createGain();
    master.gain.value = state.sound ? 0.9 : 0;
    master.connect(compressor);
    const room = audio.createConvolver();
    room.buffer = makeRoom();
    const echoVolume = audio.createGain();
    echoVolume.gain.value = 0.12;
    master.connect(room);
    room.connect(echoVolume);
    echoVolume.connect(compressor);

    // метрономът върви направо към колонките
    clickBus = audio.createGain();
    clickBus.connect(audio.destination);

    // една секунда случаен шум
    noiseBuf = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
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
  const length = Math.floor(audio.sampleRate * 0.7);
  const buffer = audio.createBuffer(2, length, audio.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    let smooth = 0;
    for (let i = 0; i < length; i++) {
      smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = smooth * Math.pow(1 - i / length, 3); // затихва към края
    }
  }
  return buffer;
}

/* ---------- Малкият барабан ---------- */

// Записва един удар по малък барабан: палка + тяло + пружини.
// Ползва OfflineAudioContext — „свири“ на скрито и връща готов запис.
async function renderSnare() {
  const sampleRate = 48000;
  const off = new OfflineAudioContext(1, Math.ceil(sampleRate * 0.6), sampleRate);
  const out = off.createGain();
  out.connect(off.destination);

  // шум за този запис
  const noiseData = off.createBuffer(1, off.length, sampleRate);
  const nd = noiseData.getChannelData(0);
  for (let i = 0; i < nd.length; i++) {
    nd[i] = Math.random() * 2 - 1;
  }
  const tune = 0.97 + Math.random() * 0.06; // всеки запис е леко различно настроен

  // Плик на звука: бързо се усилва (attack), после затихва (decay)
  function envelope(peak, decay, attack) {
    const gain = off.createGain();
    gain.gain.setValueAtTime(0.0001, 0);
    gain.gain.exponentialRampToValueAtTime(peak, attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, attack + decay);
    gain.connect(out);
    return gain;
  }

  // Пуска шум през един филтър ("highpass" пропуска само високите звуци, "bandpass" — един тесен пояс)
  function filteredNoise(filterType, frequency, q) {
    const source = off.createBufferSource();
    source.buffer = noiseData;
    const filter = off.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    source.connect(filter);
    source.start(0);
    return filter;
  }

  // 1) удар на палката
  filteredNoise("highpass", 2500, 0.7).connect(envelope(0.9, 0.012, 0.001));

  // 2) тялото на барабана — два тона, които леко падат надолу
  const bodyTones = [
    { from: 190, to: 165, peak: 0.8, decay: 0.14, type: "triangle" },
    { from: 335, to: 300, peak: 0.35, decay: 0.09, type: "sine" },
  ];
  for (const t of bodyTones) {
    const osc = off.createOscillator();
    osc.type = t.type;
    osc.frequency.setValueAtTime(t.from * tune, 0);
    osc.frequency.exponentialRampToValueAtTime(t.to * tune, 0.06);
    osc.connect(envelope(t.peak, t.decay, 0.001));
    osc.start(0);
  }

  // 3) пружините отдолу и съскането
  filteredNoise("bandpass", 4200, 0.6).connect(envelope(0.75, 0.24, 0.002));
  filteredNoise("highpass", 7500, 0.7).connect(envelope(0.22, 0.13, 0.002));

  const buffer = await off.startRendering();

  // изравнява силата, за да е най-високата точка 0.9
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i]));
  }
  for (let i = 0; i < data.length; i++) {
    data[i] = data[i] * 0.9 / peak;
  }
  return buffer;
}

// Приготвя 4 записа на удара още при отваряне на програмата
function prepareSnares() {
  Promise.all([renderSnare(), renderSnare(), renderSnare(), renderSnare()])
    .then(buffers => { snareHits = buffers; })
    .catch(e => console.warn("Не мога да подготвя звука на барабана:", e));
}

// Свири удар по малък барабан в момент t (vel = сила)
function playSnare(t, vel) {
  if (snareHits.length === 0) {
    // записите още не са готови — свири прост звук
    noise(t, "highpass", 1200, 0.6 * vel, 0.18);
    tone(t, "triangle", 190, 120, 0.4 * vel, 0.1);
    return;
  }
  const source = audio.createBufferSource();
  source.buffer = snareHits[Math.floor(Math.random() * snareHits.length)]; // случаен от четирите
  source.playbackRate.value = 0.99 + Math.random() * 0.02;
  const gain = audio.createGain();
  gain.gain.value = vel;
  source.connect(gain);
  gain.connect(master);
  liveSounds.add(source);
  source.onended = () => liveSounds.delete(source);
  source.start(t);
}

/* ---------- Прости звуци ---------- */

// Плик: звукът започва със сила peak и затихва за decay секунди
function makeEnvelope(t, peak, decay, destination) {
  const gain = audio.createGain();
  gain.gain.setValueAtTime(peak, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + decay);
  gain.connect(destination);
  return gain;
}

// Пуска източник на звук в момент t и го спира, когато затихне
function startSource(source, t, decay) {
  liveSounds.add(source);
  source.onended = () => liveSounds.delete(source);
  source.start(t);
  source.stop(t + decay + 0.05);
}

// Чист тон, който пада от честота f0 до f1 (ако f1 е null — остава същият)
function tone(t, type, f0, f1, peak, decay, destination) {
  const osc = audio.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t);
  if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + decay);
  osc.connect(makeEnvelope(t, peak, decay, destination || master));
  startSource(osc, t, decay);
}

// Шум през филтър
function noise(t, filterType, frequency, peak, decay) {
  const source = audio.createBufferSource();
  source.buffer = noiseBuf;
  const filter = audio.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = frequency;
  source.connect(filter);
  filter.connect(makeEnvelope(t, peak, decay, master));
  startSource(source, t, decay);
}

// Звуците, които могат да се посочат в "sound" на удар в lessons.json
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
};

// Клик на метронома. level: 0 обикновен, 1 по-висок, 2 най-висок (началото на такта)
function playClick(t, level) {
  const pitches = [1200, 1500, 1900];
  const volumes = [0.22, 0.3, 0.4];
  tone(t, "sine", pitches[level], null, volumes[level], 0.05, clickBus);
}

// Кратка весела мелодия при завършен урок: до – ми – сол – до
function playTada() {
  startAudio();
  const start = audio.currentTime + 0.02;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  for (let i = 0; i < notes.length; i++) {
    const decay = i === 3 ? 0.6 : 0.18;
    tone(start + i * 0.11, "triangle", notes[i], null, 0.25, decay);
  }
}
