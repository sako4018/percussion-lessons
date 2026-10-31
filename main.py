"""Уроци по ударни инструменти — програма с прозорец.

Прозорецът е малък „браузър“ (pywebview), който показва страницата от папка app.
Тук е само Python частта: зарежда уроците и записва напредъка.

Напредъкът се пази на две места:
- progress.json — основният, обикновен вариант (от него програмата чете);
- progress.db (SQLite) + progress.sql — вариантът с база данни.
  progress.sql се отваря в phpMyAdmin (XAMPP -> Import).
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path

import webview

FOLDER = Path(__file__).resolve().parent
LESSONS_FILE = FOLDER / "app" / "lessons.json"
PROGRESS_FILE = FOLDER / "progress.json"
DB_FILE = FOLDER / "progress.db"
SQL_FILE = FOLDER / "progress.sql"
STUDENT = "."  # засега има един ученик


def open_database():
    """Отваря базата и създава таблиците, ако ги няма."""
    db = sqlite3.connect(DB_FILE)
    db.execute("CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)")
    db.execute(
        "CREATE TABLE IF NOT EXISTS done ("
        "student_id INTEGER NOT NULL, lesson INTEGER NOT NULL, example INTEGER NOT NULL, "
        "done_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')), "
        "PRIMARY KEY (student_id, lesson, example))"
    )
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)")
    return db


def sql_text(value):
    """Прави текст безопасен за SQL файл (кавичките се удвояват)."""
    return "'" + str(value).replace("\\", "\\\\").replace("'", "''") + "'"


def write_sql_dump(db):
    """Записва цялата база като SQL файл за phpMyAdmin."""
    now = datetime.now().strftime("%d.%m.%Y в %H:%M")
    lines = [
        "-- Уроци по ударни инструменти — SQL Dump",
        "-- Записва се автоматично от програмата след всяка промяна. Не го редактирай на ръка.",
        "-- Време на генериране: " + now,
        "--",
        "-- Как се отваря в phpMyAdmin: пусни XAMPP (MySQL), отвори phpMyAdmin → Import → този файл.",
        "-- Базата `percussion_lessons` се създава сама; старите таблици в нея се заменят.",
        "",
        'SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";',
        "START TRANSACTION;",
        "SET NAMES utf8mb4;",
        "",
        "CREATE DATABASE IF NOT EXISTS `percussion_lessons` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;",
        "USE `percussion_lessons`;",
        "",
        "DROP TABLE IF EXISTS `students`;",
        "CREATE TABLE `students` (`id` int(11) NOT NULL, `name` varchar(100) NOT NULL, "
        "PRIMARY KEY (`id`), UNIQUE KEY `name` (`name`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
    ]
    rows = [f"({r[0]}, {sql_text(r[1])})" for r in db.execute("SELECT id, name FROM students")]
    if rows:
        lines.append("INSERT INTO `students` (`id`, `name`) VALUES\n" + ",\n".join(rows) + ";")

    lines += [
        "",
        "-- урок и пример се броят от 0",
        "DROP TABLE IF EXISTS `done`;",
        "CREATE TABLE `done` (`student_id` int(11) NOT NULL, `lesson` int(11) NOT NULL, `example` int(11) NOT NULL, "
        "`done_at` datetime NOT NULL, PRIMARY KEY (`student_id`, `lesson`, `example`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
    ]
    rows = [
        f"({r[0]}, {r[1]}, {r[2]}, {sql_text(r[3])})"
        for r in db.execute("SELECT student_id, lesson, example, done_at FROM done ORDER BY lesson, example")
    ]
    if rows:
        lines.append("INSERT INTO `done` (`student_id`, `lesson`, `example`, `done_at`) VALUES\n" + ",\n".join(rows) + ";")

    lines += [
        "",
        "DROP TABLE IF EXISTS `settings`;",
        "CREATE TABLE `settings` (`key` varchar(50) NOT NULL, `value` varchar(100) DEFAULT NULL, "
        "PRIMARY KEY (`key`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
    ]
    rows = [f"({sql_text(r[0])}, {sql_text(r[1])})" for r in db.execute("SELECT key, value FROM settings")]
    if rows:
        lines.append("INSERT INTO `settings` (`key`, `value`) VALUES\n" + ",\n".join(rows) + ";")
    lines += ["", "COMMIT;", ""]
    SQL_FILE.write_text("\n".join(lines), encoding="utf-8")


def save_to_database(stars):
    """Копира напредъка в базата (само новите примери) и обновява SQL файла."""
    db = open_database()
    try:
        db.execute("INSERT OR IGNORE INTO students (name) VALUES (?)", (STUDENT,))
        student_id = db.execute("SELECT id FROM students WHERE name = ?", (STUDENT,)).fetchone()[0]
        for key, finished in stars.items():
            if finished:
                lesson, example = key.split("/")
                db.execute(
                    "INSERT OR IGNORE INTO done (student_id, lesson, example) VALUES (?, ?, ?)",
                    (student_id, int(lesson), int(example)),
                )
        db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('last', ?)", (STUDENT,))
        db.commit()
        write_sql_dump(db)
    finally:
        db.close()


class Api:
    """Функциите тук могат да се викат от JavaScript през window.pywebview.api."""

    def get_lessons(self):
        text = LESSONS_FILE.read_text(encoding="utf-8")
        return json.loads(text)

    def get_progress(self):
        # ако файлът още го няма (първо пускане) или е повреден — започваме начисто
        try:
            text = PROGRESS_FILE.read_text(encoding="utf-8")
            return json.loads(text)
        except (OSError, ValueError):
            return {}

    def save_progress(self, stars):
        PROGRESS_FILE.write_text(json.dumps(stars), encoding="utf-8")
        # вторият вариант: същото в базата. Ако се счупи, основният файл вече е записан.
        try:
            save_to_database(stars)
        except (sqlite3.Error, ValueError, OSError) as error:
            print("Базата не се записа:", error)


def main():
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
