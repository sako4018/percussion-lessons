// Прозорецът „Браво“ – показва се, когато примерът е изсвирен докрай.

// Запомня напредъка и слага звезда на бутона на примера
function markExampleDone(lessonIndex, exampleIndex) {
  state.stars[lessonIndex + "/" + exampleIndex] = true;
  if (state.api) state.api.save_progress(state.stars);
  const exampleButton = appEl.querySelector('[data-example="' + exampleIndex + '"]');
  if (exampleButton) exampleButton.classList.add("star");
}

// Бутонът вдясно предлага: следващ пример, следващ урок или връщане към списъка
function nextStepButtonHtml(instrument, lesson, lessonIndex, exampleIndex) {
  const hasNextExample = exampleIndex < lesson.parsedExamples.length - 1;
  const hasNextLesson = lessonIndex < instrument.lessons.length - 1;
  if (hasNextExample) {
    return `<button class="primary" data-next-example>Пример ${exampleIndex + 2} ›</button>`;
  }
  if (hasNextLesson) {
    return `<button class="primary" data-next-lesson>Урок ${lessonIndex + 2} ›</button>`;
  }
  return `<button class="primary" data-list>Към уроците</button>`;
}

function dialogHtml(lesson, lessonIndex, exampleIndex, look, nextButtonHtml) {
  return `
    <div class="dialog">
      <div class="hero-shape">${shapeSvg(look)}</div>
      <h2>Браво!</h2>
      <p class="muted">Край на пример ${exampleIndex + 1} · Урок ${lessonIndex + 1} · ${esc(lesson.title)}.</p>
      <div class="dialog-actions">
        <button class="pill" data-again>Още веднъж</button>
        ${nextButtonHtml}
      </div>
    </div>`;
}

function createDialog(html) {
  const dialog = document.createElement("div");
  dialog.className = "overlay";
  dialog.innerHTML = html;
  document.body.appendChild(dialog);
  return dialog;
}

// Закача действие към бутон вътре в прозореца; затваря прозореца преди него.
// Някои бутони ги няма (зависи от следващата стъпка) – тогава нищо не се прави.
function connectDialogButton(dialog, selector, action) {
  const button = dialog.querySelector(selector);
  if (!button) return;
  button.onclick = () => {
    dialog.remove();
    action();
  };
}

function connectDialogButtons(dialog, lessonIndex, exampleIndex) {
  connectDialogButton(dialog, "[data-again]", () => setMeasure(0));
  connectDialogButton(dialog, "[data-next-example]", () => {
    go("practice", { example: exampleIndex + 1, measure: 0, active: -1 });
  });
  connectDialogButton(dialog, "[data-next-lesson]", () => openLesson(lessonIndex + 1));
  connectDialogButton(dialog, "[data-list]", () => go("instrument"));
}

function finishLesson() {
  const instrument = getInstrument();
  const lessonIndex = state.lessonIdx;
  const exampleIndex = state.example;
  const lesson = getLesson();

  markExampleDone(lessonIndex, exampleIndex);

  const look = lessonLook(lessonIndex);
  const nextButtonHtml = nextStepButtonHtml(instrument, lesson, lessonIndex, exampleIndex);
  const dialog = createDialog(dialogHtml(lesson, lessonIndex, exampleIndex, look, nextButtonHtml));
  celebrate(look.color);
  playTada();

  connectDialogButtons(dialog, lessonIndex, exampleIndex);
}
