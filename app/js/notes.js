// Рисуване на нотите с библиотеката VexFlow.

const STAVE_MARGIN = 10;
const DEFAULT_TOP = 10;
const NO_ACTIVE_NOTE = -1;
const FORMAT_PADDING = 16;
const REST_CENTER_OFFSET = 6;
const LANDING_OFFSET = 28;
const LANDING_OFFSET_WITH_TUPLET = 44;
const BEATS_TOLERANCE = 0.000001;
const REST_KEY = "b/4";

// Рисува един такт в елемента el.
// options: width, height — размер; top — колко отгоре да е петолинието;
//          showSig — да се покажат ли ключът и размерът; active — коя нота да е синя
// Връща къде са нотите по хоризонтала (xs) и на каква височина каца топчето (landY).
function drawMeasure(el, lesson, notesData, options) {
  const top = options.top === undefined ? DEFAULT_TOP : options.top;
  const active = options.active === undefined ? NO_ACTIVE_NOTE : options.active;

  const context = createContext(el, options.width, options.height);
  const stave = drawStave(context, lesson, options, top);
  const notes = createStaveNotes(notesData, active);
  const tuplets = createTuplets(notesData, notes);

  const meter = getMeter(lesson, state.example);
  const beams = createBeams(notes, lesson, meter);
  drawVoice(context, stave, notes, meter);
  for (const beam of beams) beam.setContext(context).draw();
  for (const tuplet of tuplets) tuplet.setContext(context).draw();

  fitSvgToWidth(el, options.width, options.height);

  return {
    xs: noteCenters(notes),
    landY: landingHeight(stave, tuplets),
  };
}

function createContext(el, width, height) {
  el.innerHTML = "";
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  return renderer.getContext();
}

function drawStave(context, lesson, options, top) {
  const stave = new VF.Stave(STAVE_MARGIN, top, options.width - 2 * STAVE_MARGIN);
  if (options.showSig) {
    stave.addClef("percussion").addTimeSignature(timeSignatureOf(lesson, state.example));
  }
  stave.setContext(context).draw();
  return stave;
}

function createStaveNotes(notesData, activeIndex) {
  const notes = [];
  for (let index = 0; index < notesData.length; index++) {
    const note = createStaveNote(notesData[index]);
    if (index === activeIndex) markNoteActive(note);
    notes.push(note);
  }
  return notes;
}

function createStaveNote(noteData) {
  const note = new VF.StaveNote({
    keys: keysOf(noteData),
    duration: durationCodeOf(noteData),
    clef: "percussion",
    stem_direction: VF.Stem.UP,
    auto_stem: false,
  });
  if (noteData.dotted) VF.Dot.buildAndAttach([note], { all: true });
  if (noteData.label) addLabel(note, noteData.label);
  return note;
}

function keysOf(noteData) {
  if (noteData.rest) return [REST_KEY];
  return noteData.voices.map(voice => voice.key);
}

function durationCodeOf(noteData) {
  let code = noteData.dur;
  if (noteData.dotted) code += "d";
  if (noteData.rest) code += "r";
  return code;
}

// надпис под нотата (R / L)
function addLabel(note, text) {
  const annotation = new VF.Annotation(text);
  annotation.setFont("Arial", 12, "bold");
  annotation.setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
  note.addModifier(annotation, 0);
}

// изсвирената нота е синя
function markNoteActive(note) {
  const style = { fillStyle: ACCENT, strokeStyle: ACCENT };
  note.setStyle(style);
  note.setStemStyle(style);
  note.setFlagStyle(style);
  for (let keyIndex = 0; keyIndex < note.keys.length; keyIndex++) {
    note.setKeyStyle(keyIndex, style);
  }
}

// Триола (t): 3 ноти на мястото на 2. Секстола (s): 6 ноти на мястото на 4.
function tupletShapeOf(noteData) {
  if (noteData.tuplet === "s") return { count: 6, occupied: 4 };
  return { count: 3, occupied: 2 };
}

// Скобите се затварят, когато нотите в тях съберат нужните четвъртини.
function createTuplets(notesData, notes) {
  const tuplets = [];
  let group = [];
  let groupBeats = 0;  // колко четвъртини е събрала скобата досега
  let groupSpan = 0;   // колко четвъртини трябва да събере, за да е пълна

  for (let index = 0; index < notesData.length; index++) {
    const noteData = notesData[index];
    if (!noteData.tuplet) {
      group = [];
      groupBeats = 0;
      continue;
    }
    const shape = tupletShapeOf(noteData);
    if (group.length === 0) groupSpan = shape.occupied * DURATIONS[noteData.dur];
    group.push(notes[index]);
    groupBeats += noteData.beats;

    if (Math.abs(groupBeats - groupSpan) < BEATS_TOLERANCE) {
      tuplets.push(new VF.Tuplet(group, { num_notes: shape.count, notes_occupied: shape.occupied }));
      group = [];
      groupBeats = 0;
    }
  }
  return tuplets;
}

// гредите между осмините/шестнайсетините; при неравноделен размер — по дялове
function createBeams(notes, lesson, meter) {
  const beamOptions = { stem_direction: VF.Stem.UP };
  if (lesson.parts) {
    beamOptions.groups = lesson.parts.map(part => new VF.Fraction(part, meter.den));
  }
  return VF.Beam.generateBeams(notes, beamOptions);
}

// подрежда нотите по ширината на петолинието
function drawVoice(context, stave, notes, meter) {
  const voice = new VF.Voice({ num_beats: meter.num, beat_value: meter.den });
  voice.setMode(VF.Voice.Mode.SOFT);
  voice.addTickables(notes);

  const formatWidth = stave.getNoteEndX() - stave.getNoteStartX() - FORMAT_PADDING;
  new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
  voice.draw(context, stave);
}

// картинката да се мащабира според ширината на екрана
function fitSvgToWidth(el, width, height) {
  const svg = el.querySelector("svg");
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "100%";
  svg.style.height = "auto";
}

function noteCenters(notes) {
  return notes.map(noteCenter);
}

function noteCenter(note) {
  try {
    return (note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2;
  } catch (error) {
    return note.getAbsoluteX() + REST_CENTER_OFFSET; // паузите нямат глава
  }
}

// над петолинието; малко по-високо при триоли заради скобата
function landingHeight(stave, tuplets) {
  const offset = tuplets.length > 0 ? LANDING_OFFSET_WITH_TUPLET : LANDING_OFFSET;
  return stave.getYForLine(0) - offset;
}

// Малката фигура на всяка кутия в списъка с уроци. Търси се по думи в заглавието
// на урока; печели първото съвпадение. Отзад стои "" — то пасва на всичко.
const FIGURES = [
  ["/8", "8 8 8"],
  ["секстола", "s16 s16 s16 s16 s16 s16"],
  ["двувременна", "tq tq tq"],
  ["осмина + триола", "8 t16 t16 t16"],
  ["осмина и триола", "8 t16 t16 t16"],
  ["триола + осмина", "t16 t16 t16 8"],
  ["триол", "t8 t8 t8"],
  ["четвъртина с точка", "qd 8"],
  ["с точка", "8d 16"],
  ["синкоп", "8 q 8"],
  ["шестнайсетина пауза", "16 16:r 8"],
  ["осмина пауза", "8:r 16 16"],
  ["2 шестнайсетини + осмина", "16 16 8"],
  ["осмина + 2", "8 16 16"],
  ["групите", "8 16 16"],
  ["шестнайсетини и паузи", "16 16:r 16 16"],
  ["шестнайсет", "16 16 16 16"],
  ["осмини паузи", "8:r 8"],
  ["осмин", "8 8"],
  ["цели", "w"],
  ["половин", "q h"],
  ["пауз", "q q:r"],
  ["", "q"],
];

// Връща нотите на фигурата за даден урок
function figureOf(instrument, lesson) {
  const figureText = figureTextFor(lesson.title.toLowerCase());
  const firstVoice = Object.keys(instrument.voices)[0];
  return figureText.split(" ").map(word => parseFigureWord(word, firstVoice, instrument));
}

function figureTextFor(lowerTitle) {
  for (const item of FIGURES) {
    if (lowerTitle.includes(item[0])) return item[1];
  }
  return "q";
}

// ако думата няма удар (няма ":"), слагаме първия удар на инструмента
function parseFigureWord(word, firstVoice, instrument) {
  const full = word.includes(":") ? word : word + ":" + firstVoice;
  return parseNote(full, instrument);
}
