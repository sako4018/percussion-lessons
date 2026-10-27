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

// Превръща една дума като "8:hh+bd:R" в обект с всичко за нотата
function parseNote(text, instrument) {
  const parts = text.split(":");
  const durText = parts[0];
  const voicesText = parts[1] || "";
  const labelText = parts[2];

  // триола (t) или секстола (s) отпред
  let tuplet = null;
  let dur = durText;
  if (dur[0] === "t" || dur[0] === "s") {
    tuplet = dur[0];
    dur = dur.slice(1);
  }

  // точка накрая
  let dotted = false;
  if (dur.endsWith("d")) {
    dotted = true;
    dur = dur.slice(0, -1);
  }
  if (!(dur in DURATIONS)) {
    throw new Error('Непозната дължина "' + durText + '" в "' + text + '"');
  }

  // удари (или пауза)
  const rest = voicesText === "r";
  const voices = [];
  if (!rest) {
    for (const id of voicesText.split("+")) {
      if (!instrument.voices[id]) {
        throw new Error('Непознат удар "' + id + '" в "' + text + '"');
      }
      voices.push(instrument.voices[id]);
    }
  }

  // надпис: или зададен изрично, или взет от ударите
  let label = "";
  if (labelText !== undefined) {
    label = labelText;
  } else {
    for (const v of voices) {
      if (v.label) label += v.label;
    }
  }

  // колко четвъртини трае нотата
  let beats = DURATIONS[dur];
  if (dotted) beats = beats * 1.5;
  if (tuplet) beats = beats * 2 / 3;

  return { dur: dur, dotted: dotted, tuplet: tuplet, rest: rest, voices: voices, label: label, beats: beats };
}

// Подготвя нотите на урока (само първия път, после ги помни в lesson.parsedExamples).
// Проверява и дали всеки такт има правилната дължина.
function prepareLesson(instrument, lesson) {
  if (lesson.parsedExamples) return;

  const examples = lesson.examples || [lesson.measures];
  lesson.parsedExamples = [];

  for (let e = 0; e < examples.length; e++) {
    const expected = getMeter(lesson, e).beats;
    const bars = [];
    for (let k = 0; k < examples[e].length; k++) {
      const notes = [];
      let sum = 0;
      for (const text of examples[e][k].trim().split(/\s+/)) {
        const note = parseNote(text, instrument);
        notes.push(note);
        sum += note.beats;
      }
      if (Math.abs(sum - expected) > 0.000001) {
        console.warn("„" + lesson.title + "“, пример " + (e + 1) + ", такт " + (k + 1) +
          ": " + sum + " четвъртини вместо " + expected);
      }
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

// Кликовете на метронома в един такт.
// При неравноделен размер (parts) има по-силен клик в началото на всеки дял.
// level: 2 = най-силен (началото на такта), 1 = начало на дял, 0 = обикновен
function getClicks(lesson) {
  const meter = getMeter(lesson, state.example);
  const clicks = [];

  if (!lesson.parts) {
    for (let b = 0; b < meter.num; b++) {
      clicks.push({ at: b * meter.step, level: b === 0 ? 2 : 0, label: String(b + 1) });
    }
    return clicks;
  }

  let pos = 0; // на кое време сме
  for (let p = 0; p < lesson.parts.length; p++) {
    for (let k = 0; k < lesson.parts[p]; k++) {
      let level = 0;
      if (pos + k === 0) level = 2;
      else if (k === 0) level = 1;
      clicks.push({
        at: (pos + k) * meter.step,
        level: level,
        label: k === 0 ? String(p + 1) : null, // броим само началото на всеки дял
      });
    }
    pos += lesson.parts[p];
  }
  return clicks;
}
