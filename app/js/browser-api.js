// Учениците, когато програмата е отворена в браузър (сайтът в GitHub Pages).
// Тук няма Python, затова всичко се пази в localStorage на браузъра.
// Функциите са същите като в main.py (класа Api), така че останалият код не знае разликата.
// Всеки браузър има свой списък с ученици.

const BROWSER_STUDENTS_KEY = "percussion-students";
const OLD_BROWSER_PROGRESS_KEY = "percussion-progress"; // старата версия без ученици
const OLD_STUDENT_NAME = "Без име";

// Чете записаното: { last: име или null, students: { име: { "урок/пример": true } } }
function readBrowserData() {
  try {
    const data = JSON.parse(localStorage.getItem(BROWSER_STUDENTS_KEY));
    if (data && data.students) return data;
  } catch (error) {
    // няма достъп до localStorage или записът е повреден
  }
  return { last: null, students: {} };
}

function writeBrowserData(data) {
  try {
    localStorage.setItem(BROWSER_STUDENTS_KEY, JSON.stringify(data));
  } catch (error) {
    // няма достъп до localStorage – промените важат само докато страницата е отворена
  }
}

// Отметките от старата версия (без ученици) отиват на ученик „Без име“ – веднъж
function importOldBrowserProgress() {
  try {
    if (localStorage.getItem(BROWSER_STUDENTS_KEY) !== null) return;
    const old = JSON.parse(localStorage.getItem(OLD_BROWSER_PROGRESS_KEY));
    if (!old || Object.keys(old).length === 0) return;
    const data = { last: OLD_STUDENT_NAME, students: {} };
    data.students[OLD_STUDENT_NAME] = old;
    writeBrowserData(data);
  } catch (error) {
    // нищо за прехвърляне
  }
}

function makeBrowserApi() {
  importOldBrowserProgress();
  let data = readBrowserData();

  function save() {
    writeBrowserData(data);
  }

  return {
    async get_lessons() {
      const response = await fetch("lessons.json");
      return response.json();
    },

    async get_students() {
      const students = [];
      for (const name in data.students) {
        students.push({ name: name, done: Object.keys(data.students[name]).length });
      }
      return { students: students, last: data.last };
    },

    async add_student(name) {
      name = name.trim();
      if (name === "") return "Напиши име.";
      if (data.students[name]) return "Вече има ученик с това име.";
      data.students[name] = {};
      save();
      return "";
    },

    async rename_student(oldName, newName) {
      newName = newName.trim();
      if (newName === "") return "Напиши име.";
      if (newName === oldName) return "";
      if (data.students[newName]) return "Вече има ученик с това име.";
      data.students[newName] = data.students[oldName] || {};
      delete data.students[oldName];
      if (data.last === oldName) data.last = newName;
      save();
      return "";
    },

    async delete_student(name) {
      delete data.students[name];
      if (data.last === name) data.last = null;
      save();
    },

    async select_student(name) {
      if (!data.students[name]) return {};
      data.last = name;
      save();
      return Object.assign({}, data.students[name]);
    },

    async save_progress(name, stars) {
      if (!data.students[name]) return;
      data.students[name] = Object.assign({}, stars);
      save();
    },
  };
}
