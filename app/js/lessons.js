// Работа с уроците: как се чете един такт от lessons.json.
//
// В lessons.json всеки такт е ред текст, например: "q:hh+bd 8:hh 8:hh+sd q:r q:sd:R"
// Всяка "дума" е една нота във вида  дължина:удари:надпис
//   дължина — w цяла, h половина, q четвъртина, 8 осмина, 16 шестнайсетина
//             d накрая = с точка (qd), t отпред = триола (t8), s отпред = секстола (s16)
//   удари   — от "voices" на инструмента; + значи едновременно; r = пауза
//   надпис  — по желание, показва се под нотата (например R или L за ръка)

// Размерът на урока за даден пример (например "4/4").
// Някои уроци имат различен размер за всеки пример.
function timeSignatureOf(lesson, example) {
  if (lesson.timeSignatures && lesson.timeSignatures[example]) {
    return lesson.timeSignatures[example];
  }
  return lesson.timeSignature;
}

// Смята какво е размерът: колко четвъртини има един такт
function getMeter(lesson, example) {
  const ts = timeSignatureOf(lesson, example);
  const parts = ts.split("/");
  const num = Number(parts[0]);
  const den = Number(parts[1]);
  return {
    ts: ts,
    num: num,                  // горното число (колко времена)
    den: den,                  // долното число (каква нота е едно време)
    beats: (num * 4) / den,    // колко четвъртини е един такт
    step: 4 / den,             // колко четвъртини е едно време
  };
}

// Колко може да се различава сумата от очакваното заради закръгляне на дробни числа
const BEAT_TOLERANCE = 0.000001;

const TRIPLET_PREFIX = "t";
const SEXTUPLET_PREFIX = "s";
const DOT_SUFFIX = "d";
const REST_VOICE = "r";

// Отделя t/s отпред: "t8" -> { tuplet: "t", durationText: "8" }
function splitTupletPrefix(durationText) {
  const first = durationText[0];
  if (first === TRIPLET_PREFIX || first === SEXTUPLET_PREFIX) {
    return { tuplet: first, durationText: durationText.slice(1) };
  }
  return { tuplet: null, durationText: durationText };
}

// Отделя точката накрая: "qd" -> { dotted: true, durationText: "q" }
function splitDot(durationText) {
  if (durationText.endsWith(DOT_SUFFIX)) {
    return { dotted: true, durationText: durationText.slice(0, -1) };
  }
  return { dotted: false, durationText: durationText };
}

// Намира ударите на нотата; пауза няма удари
function voicesOf(voicesText, instrument, noteText) {
  const voices = [];
  if (voicesText === REST_VOICE) return voices;

  for (const id of voicesText.split("+")) {
    if (!instrument.voices[id]) {
      throw new Error('Непознат удар "' + id + '" в "' + noteText + '"');
    }
    voices.push(instrument.voices[id]);
  }
  return voices;
}

// Надписът е или зададен изрично, или събран от ударите
function labelOf(explicitLabel, voices) {
  if (explicitLabel !== undefined) return explicitLabel;

  let label = "";
  for (const voice of voices) {
    if (voice.label) label += voice.label;
  }
  return label;
}

// Колко четвъртини трае нотата
function beatsOf(duration, dotted, tuplet) {
  let beats = DURATIONS[duration];
  if (dotted) beats = beats * 1.5;
  if (tuplet) beats = beats * 2 / 3;
  return beats;
}

// Превръща една дума като "8:hh+bd:R" в обект с всичко за нотата
function parseNote(text, instrument) {
  const parts = text.split(":");
  const originalDuration = parts[0];
  const voicesText = parts[1] || "";
  const explicitLabel = parts[2];

  const withoutTuplet = splitTupletPrefix(originalDuration);
  const withoutDot = splitDot(withoutTuplet.durationText);
  const duration = withoutDot.durationText;
  const tuplet = withoutTuplet.tuplet;
  const dotted = withoutDot.dotted;

  if (!(duration in DURATIONS)) {
    throw new Error('Непозната дължина "' + originalDuration + '" в "' + text + '"');
  }

  const voices = voicesOf(voicesText, instrument, text);

  return {
    dur: duration,
    dotted: dotted,
    tuplet: tuplet,
    rest: voicesText === REST_VOICE,
    voices: voices,
    label: labelOf(explicitLabel, voices),
    beats: beatsOf(duration, dotted, tuplet),
  };
}

// Разбира един такт (ред текст) на ноти
function parseBar(barText, instrument) {
  const notes = [];
  for (const noteText of barText.trim().split(/\s+/)) {
    notes.push(parseNote(noteText, instrument));
  }
  return notes;
}

function totalBeats(notes) {
  let sum = 0;
  for (const note of notes) sum += note.beats;
  return sum;
}

// Само предупреждава (не спира), за да се вижда грешка в урока
function checkBarLength(notes, expectedBeats, lesson, exampleIdx, barIdx) {
  const sum = totalBeats(notes);
  if (Math.abs(sum - expectedBeats) <= BEAT_TOLERANCE) return;

  console.warn("„" + lesson.title + "“, пример " + (exampleIdx + 1) + ", такт " + (barIdx + 1) +
    ": " + sum + " четвъртини вместо " + expectedBeats);
}

// Подготвя нотите на урока (само първия път, после ги помни в lesson.parsedExamples).
// Проверява и дали всеки такт има правилната дължина.
function prepareLesson(instrument, lesson) {
  if (lesson.parsedExamples) return;

  const examples = lesson.examples || [lesson.measures];
  lesson.parsedExamples = [];

  for (let exampleIdx = 0; exampleIdx < examples.length; exampleIdx++) {
    const expectedBeats = getMeter(lesson, exampleIdx).beats;
    const bars = [];
    for (let barIdx = 0; barIdx < examples[exampleIdx].length; barIdx++) {
      const notes = parseBar(examples[exampleIdx][barIdx], instrument);
      checkBarLength(notes, expectedBeats, lesson, exampleIdx, barIdx);
      bars.push(notes);
    }
    lesson.parsedExamples.push(bars);
  }
}

// Тактовете на избрания пример
function getBars() {
  return getLesson().parsedExamples[state.example];
}

// Размерът за показване, напр. "7/8 (2+2+3)"
function sizeLabel(lesson) {
  let text = timeSignatureOf(lesson, state.example);
  if (lesson.parts) text += " (" + lesson.parts.join("+") + ")";
  return text;
}

const STRONGEST_CLICK = 2; // началото на такта
const PART_START_CLICK = 1;
const PLAIN_CLICK = 0;

// Кликове за равноделен размер: само първото време е силно
function regularClicks(meter) {
  const clicks = [];
  for (let beat = 0; beat < meter.num; beat++) {
    clicks.push({
      at: beat * meter.step,
      level: beat === 0 ? STRONGEST_CLICK : PLAIN_CLICK,
      label: String(beat + 1),
    });
  }
  return clicks;
}

// Кликове за един дял, който започва на времето firstBeat
function partClicks(partIdx, partLength, firstBeat, meter) {
  const clicks = [];
  for (let beatInPart = 0; beatInPart < partLength; beatInPart++) {
    const beat = firstBeat + beatInPart;
    let level = PLAIN_CLICK;
    if (beat === 0) level = STRONGEST_CLICK;
    else if (beatInPart === 0) level = PART_START_CLICK;

    clicks.push({
      at: beat * meter.step,
      level: level,
      label: beatInPart === 0 ? String(partIdx + 1) : null, // броим само началото на всеки дял
    });
  }
  return clicks;
}

// Кликовете на метронома в един такт.
// При неравноделен размер (parts) има по-силен клик в началото на всеки дял.
function getClicks(lesson) {
  const meter = getMeter(lesson, state.example);
  if (!lesson.parts) return regularClicks(meter);

  let clicks = [];
  let firstBeat = 0;
  for (let partIdx = 0; partIdx < lesson.parts.length; partIdx++) {
    const partLength = lesson.parts[partIdx];
    clicks = clicks.concat(partClicks(partIdx, partLength, firstBeat, meter));
    firstBeat += partLength;
  }
  return clicks;
}
