// Рисуване на нотите с библиотеката VexFlow.

// Рисува един такт в елемента el.
// options: width, height — размер; top — колко отгоре да е петолинието;
//          showSig — да се покажат ли ключът и размерът; active — коя нота да е синя
// Връща къде са нотите по хоризонтала (xs) и на каква височина каца топчето (landY).
function drawMeasure(el, lesson, notesData, options) {
  const width = options.width;
  const height = options.height;
  const top = options.top === undefined ? 10 : options.top;
  const active = options.active === undefined ? -1 : options.active;

  el.innerHTML = "";
  const renderer = new VF.Renderer(el, VF.Renderer.Backends.SVG);
  renderer.resize(width, height);
  const ctx = renderer.getContext();

  // петолинието
  const stave = new VF.Stave(10, top, width - 20);
  if (options.showSig) {
    stave.addClef("percussion").addTimeSignature(timeSignatureOf(lesson, state.example));
  }
  stave.setContext(ctx).draw();

  // нотите
  const notes = [];
  for (let idx = 0; idx < notesData.length; idx++) {
    const n = notesData[idx];

    let keys = ["b/4"]; // за паузите
    if (!n.rest) {
      keys = n.voices.map(v => v.key);
    }
    const note = new VF.StaveNote({
      keys: keys,
      duration: n.dur + (n.dotted ? "d" : "") + (n.rest ? "r" : ""),
      clef: "percussion",
      stem_direction: VF.Stem.UP,
      auto_stem: false,
    });

    if (n.dotted) VF.Dot.buildAndAttach([note], { all: true });

    // надпис под нотата (R / L)
    if (n.label) {
      const annotation = new VF.Annotation(n.label);
      annotation.setFont("Arial", 12, "bold");
      annotation.setVerticalJustification(VF.Annotation.VerticalJustify.BOTTOM);
      note.addModifier(annotation, 0);
    }

    // изсвирената нота е синя
    if (idx === active) {
      const style = { fillStyle: ACCENT, strokeStyle: ACCENT };
      note.setStyle(style);
      note.setStemStyle(style);
      note.setFlagStyle(style);
      for (let k = 0; k < note.keys.length; k++) {
        note.setKeyStyle(k, style);
      }
    }
    notes.push(note);
  }

  // Скобите на триолите и секстолите.
  // Триола (t): 3 ноти на мястото на 2. Секстола (s): 6 ноти на мястото на 4.
  const tuplets = [];
  let group = [];       // нотите от текущата скоба
  let groupBeats = 0;   // колко четвъртини е събрала скобата досега
  let groupSpan = 0;    // колко четвъртини трябва да събере, за да е пълна
  for (let idx = 0; idx < notesData.length; idx++) {
    const n = notesData[idx];
    if (!n.tuplet) {
      group = [];
      groupBeats = 0;
      continue;
    }
    let count = 3;
    let occupied = 2;
    if (n.tuplet === "s") {
      count = 6;
      occupied = 4;
    }
    if (group.length === 0) groupSpan = occupied * DURATIONS[n.dur];
    group.push(notes[idx]);
    groupBeats += n.beats;
    if (Math.abs(groupBeats - groupSpan) < 0.000001) {
      tuplets.push(new VF.Tuplet(group, { num_notes: count, notes_occupied: occupied }));
      group = [];
      groupBeats = 0;
    }
  }

  // подрежда нотите по ширината на петолинието
  const meter = getMeter(lesson, state.example);
  const voice = new VF.Voice({ num_beats: meter.num, beat_value: meter.den });
  voice.setMode(VF.Voice.Mode.SOFT);
  voice.addTickables(notes);

  // гредите между осмините/шестнайсетините; при неравноделен размер — по дялове
  const beamOptions = { stem_direction: VF.Stem.UP };
  if (lesson.parts) {
    beamOptions.groups = lesson.parts.map(p => new VF.Fraction(p, meter.den));
  }
  const beams = VF.Beam.generateBeams(notes, beamOptions);

  const formatWidth = stave.getNoteEndX() - stave.getNoteStartX() - 16;
  new VF.Formatter().joinVoices([voice]).format([voice], formatWidth);
  voice.draw(ctx, stave);
  for (const beam of beams) beam.setContext(ctx).draw();
  for (const tuplet of tuplets) tuplet.setContext(ctx).draw();

  // картинката да се мащабира според ширината на екрана
  const svg = el.querySelector("svg");
  svg.setAttribute("viewBox", "0 0 " + width + " " + height);
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.style.width = "100%";
  svg.style.height = "auto";

  // къде е средата на всяка нота
  const xs = [];
  for (const note of notes) {
    try {
      xs.push((note.getNoteHeadBeginX() + note.getNoteHeadEndX()) / 2);
    } catch (e) {
      xs.push(note.getAbsoluteX() + 6); // паузите нямат глава
    }
  }

  // линията, на която каца топчето (над петолинието; малко по-високо при триоли заради скобата)
  let landY = stave.getYForLine(0) - 28;
  if (tuplets.length > 0) landY = stave.getYForLine(0) - 44;

  return { xs: xs, landY: landY };
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
  const title = lesson.title.toLowerCase();
  let figureText = "q";
  for (const item of FIGURES) {
    if (title.includes(item[0])) {
      figureText = item[1];
      break;
    }
  }
  const firstVoice = Object.keys(instrument.voices)[0];
  const notes = [];
  for (const word of figureText.split(" ")) {
    // ако думата няма удар (няма ":"), слагаме първия удар на инструмента
    const full = word.includes(":") ? word : word + ":" + firstVoice;
    notes.push(parseNote(full, instrument));
  }
  return notes;
}
