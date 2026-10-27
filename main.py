"""Уроци по ударни инструменти — програма с прозорец.

Прозорецът е малък „браузър“ (pywebview), който показва страницата от папка app.
Тук е само Python частта: зарежда уроците и пази напредъка на всеки ученик в база данни.

Базата е SQLite — един файл progress.db до програмата, без сървър. Таблиците:
    students — учениците (id, име)
    done     — кой ученик кой пример е изсвирил докрай и кога (урок и пример се броят от 0)
    settings — общи настройки, засега само последно избраният ученик ("last")

След всяка промяна програмата сама записва и progress.sql — същите данни като файл за MySQL,
като „Export“ от phpMyAdmin. Ако искаш да ги видиш там: XAMPP → phpMyAdmin → Import → progress.sql.
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path

import webview

FOLDER = Path(__file__).resolve().parent
LESSONS_FILE = FOLDER / "app" / "lessons.json"
DB_FILE = FOLDER / "progress.db"
SQL_FILE = FOLDER / "progress.sql"  # копие на базата за phpMyAdmin (записва се само)
SQL_DATABASE = "percussion_lessons"  # името на базата при Import в phpMyAdmin
OLD_FILE = FOLDER / "progress.json"  # напредъкът от старата версия без база
OLD_NAME = "Без име"  # ученикът, който получава отметките от старата версия без ученици


def connect():
    """Отваря базата и създава таблиците, ако ги няма (при първо пускане)."""
    db = sqlite3.connect(DB_FILE)
    db.execute("""
        CREATE TABLE IF NOT EXISTS students (
            id   INTEGER PRIMARY KEY,
            name TEXT NOT NULL UNIQUE
        )""")
    db.execute("""
        CREATE TABLE IF NOT EXISTS done (
            student_id INTEGER NOT NULL,
            lesson     INTEGER NOT NULL,
            example    INTEGER NOT NULL,
            done_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
            PRIMARY KEY (student_id, lesson, example)
        )""")
    db.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT
        )""")
    return db


def find_student(db, name):
    """Връща id на ученика или None, ако няма такъв."""
    row = db.execute("SELECT id FROM students WHERE name = ?", (name,)).fetchone()
    if row is None:
        return None
    return row[0]


def get_last(db):
    row = db.execute("SELECT value FROM settings WHERE key = 'last'").fetchone()
    if row is None:
        return None
    return row[0]


def set_last(db, name):
    db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last', ?)", (name,))


def add_done(db, student_id, stars):
    """Записва изсвирените примери. stars е {"урок/пример": true}. Вече записаните не се пипат."""
    for key in stars:
        lesson, example = key.split("/")
        db.execute(
            "INSERT OR IGNORE INTO done (student_id, lesson, example) VALUES (?, ?, ?)",
            (student_id, int(lesson), int(example)),
        )


def sql_text(value):
    """Текст в кавички за MySQL ('O'Neil' -> 'O''Neil'), а None -> NULL."""
    if value is None:
        return "NULL"
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def export_sql():
    """Записва цялата база в progress.sql във вида, в който phpMyAdmin прави Export."""
    db = connect()
    students = db.execute("SELECT id, name FROM students ORDER BY id").fetchall()
    done = db.execute(
        "SELECT student_id, lesson, example, done_at FROM done ORDER BY student_id, lesson, example"
    ).fetchall()
    settings = db.execute("SELECT key, value FROM settings ORDER BY key").fetchall()
    db.close()

    now = datetime.now().strftime("%d.%m.%Y в %H:%M")
    lines = [
        "-- Уроци по ударни инструменти — SQL Dump",
        "-- Записва се автоматично от програмата след всяка промяна. Не го редактирай на ръка.",
        "-- Време на генериране: " + now,
        "--",
        "-- Как се отваря в phpMyAdmin: пусни XAMPP (MySQL), отвори phpMyAdmin → Import → този файл.",
        "-- Базата `" + SQL_DATABASE + "` се създава сама; старите таблици в нея се заменят.",
        "",
        'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";',
        "START TRANSACTION;",
        "SET NAMES utf8mb4;",
        "",
        "CREATE DATABASE IF NOT EXISTS `" + SQL_DATABASE + "` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;",
        "USE `" + SQL_DATABASE + "`;",
        "",
        "-- --------------------------------------------------------",
        "-- Структура на таблица `students` — учениците",
        "",
        "DROP TABLE IF EXISTS `students`;",
        "CREATE TABLE `students` (",
        "  `id` int(11) NOT NULL,",
        "  `name` varchar(100) NOT NULL,",
        "  PRIMARY KEY (`id`),",
        "  UNIQUE KEY `name` (`name`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;",
        "",
    ]
    if students:
        lines.append("INSERT INTO `students` (`id`, `name`) VALUES")
        rows = []
        for student_id, name in students:
            rows.append("(" + str(student_id) + ", " + sql_text(name) + ")")
        lines.append(",\n".join(rows) + ";")
        lines.append("")

    lines += [
        "-- --------------------------------------------------------",
        "-- Структура на таблица `done` — кой ученик кой пример е изсвирил докрай и кога",
        "-- (урок и пример се броят от 0: lesson 0, example 0 = урок 1, пример 1)",
        "",
        "DROP TABLE IF EXISTS `done`;",
        "CREATE TABLE `done` (",
        "  `student_id` int(11) NOT NULL,",
        "  `lesson` int(11) NOT NULL,",
        "  `example` int(11) NOT NULL,",
        "  `done_at` datetime NOT NULL,",
        "  PRIMARY KEY (`student_id`, `lesson`, `example`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;",
        "",
    ]
    if done:
        lines.append("INSERT INTO `done` (`student_id`, `lesson`, `example`, `done_at`) VALUES")
        rows = []
        for student_id, lesson, example, done_at in done:
            rows.append("(" + str(student_id) + ", " + str(lesson) + ", " + str(example) + ", " + sql_text(done_at) + ")")
        lines.append(",\n".join(rows) + ";")
        lines.append("")

    lines += [
        "-- --------------------------------------------------------",
        "-- Структура на таблица `settings` — последно избраният ученик",
        "",
        "DROP TABLE IF EXISTS `settings`;",
        "CREATE TABLE `settings` (",
        "  `key` varchar(50) NOT NULL,",
        "  `value` varchar(100) DEFAULT NULL,",
        "  PRIMARY KEY (`key`)",
        ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;",
        "",
    ]
    if settings:
        lines.append("INSERT INTO `settings` (`key`, `value`) VALUES")
        rows = []
        for key, value in settings:
            rows.append("(" + sql_text(key) + ", " + sql_text(value) + ")")
        lines.append(",\n".join(rows) + ";")
        lines.append("")

    lines.append("COMMIT;")
    SQL_FILE.write_text("\n".join(lines) + "\n", encoding="utf-8")


def import_old_file():
    """Прехвърля progress.json от старата версия в базата (само ако базата още я няма)."""
    if DB_FILE.exists() or not OLD_FILE.exists():
        return
    try:
        data = json.loads(OLD_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return

    # най-старата версия пазеше само {"урок/пример": true}, без ученици
    if "students" not in data:
        data = {"last": OLD_NAME, "students": {OLD_NAME: data}} if data else {"students": {}}

    with connect() as db:
        for name in data["students"]:
            cursor = db.execute("INSERT INTO students (name) VALUES (?)", (name,))
            add_done(db, cursor.lastrowid, data["students"][name])
        if data.get("last"):
            set_last(db, data["last"])


class Api:
    """Функциите тук могат да се викат от JavaScript през window.pywebview.api.
    Всяка функция отваря базата наново — pywebview може да ги вика от различни нишки."""

    def get_lessons(self):
        text = LESSONS_FILE.read_text(encoding="utf-8")
        return json.loads(text)

    def get_students(self):
        """Списък с учениците (име и брой изсвирени примери) и последно избрания."""
        with connect() as db:
            rows = db.execute("""
                SELECT students.name, COUNT(done.lesson)
                FROM students LEFT JOIN done ON done.student_id = students.id
                GROUP BY students.id
                ORDER BY students.id""").fetchall()
            students = []
            for name, count in rows:
                students.append({"name": name, "done": count})
            return {"students": students, "last": get_last(db)}

    def add_student(self, name):
        """Добавя ученик. Връща текст с грешка или празен текст, ако е наред."""
        name = name.strip()
        if name == "":
            return "Напиши име."
        with connect() as db:
            if find_student(db, name) is not None:
                return "Вече има ученик с това име."
            db.execute("INSERT INTO students (name) VALUES (?)", (name,))
        export_sql()
        return ""

    def rename_student(self, old_name, new_name):
        """Преименува ученик. Връща текст с грешка или празен текст, ако е наред."""
        new_name = new_name.strip()
        if new_name == "":
            return "Напиши име."
        if new_name == old_name:
            return ""
        with connect() as db:
            if find_student(db, new_name) is not None:
                return "Вече има ученик с това име."
            db.execute("UPDATE students SET name = ? WHERE name = ?", (new_name, old_name))
            if get_last(db) == old_name:
                set_last(db, new_name)
        export_sql()
        return ""

    def delete_student(self, name):
        with connect() as db:
            student_id = find_student(db, name)
            if student_id is None:
                return
            db.execute("DELETE FROM done WHERE student_id = ?", (student_id,))
            db.execute("DELETE FROM students WHERE id = ?", (student_id,))
            if get_last(db) == name:
                db.execute("DELETE FROM settings WHERE key = 'last'")
        export_sql()

    def select_student(self, name):
        """Запомня ученика като последно избран и връща неговия напредък: {"урок/пример": true}."""
        with connect() as db:
            student_id = find_student(db, name)
            if student_id is None:
                return {}
            set_last(db, name)
            stars = {}
            for lesson, example in db.execute(
                "SELECT lesson, example FROM done WHERE student_id = ?", (student_id,)
            ):
                stars[str(lesson) + "/" + str(example)] = True
        export_sql()
        return stars

    def save_progress(self, name, stars):
        with connect() as db:
            student_id = find_student(db, name)
            if student_id is not None:
                add_done(db, student_id, stars)
        export_sql()


def main():
    import_old_file()
    export_sql()  # файлът да го има още от първото пускане
    webview.create_window(
        "Уроци по ударни инструменти",
        str(FOLDER / "app" / "index.html"),
        js_api=Api(),
        width=1200,
        height=860,
        min_size=(900, 650),
    )
    webview.start(http_server=True)


if __name__ == "__main__":
    main()
