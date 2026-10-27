"""Уроци по ударни инструменти — програма с прозорец.

Прозорецът е малък „браузър“ (pywebview), който показва страницата от папка app.
Тук е само Python частта: зарежда уроците и записва напредъка.
"""
import json
from pathlib import Path

import webview

FOLDER = Path(__file__).resolve().parent
LESSONS_FILE = FOLDER / "app" / "lessons.json"
PROGRESS_FILE = FOLDER / "progress.json"


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
