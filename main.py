"""Уроци по перкусии — прозорец за компютър."""
import json
import os
from pathlib import Path

import webview

BASE = Path(__file__).resolve().parent
LESSONS_FILE = BASE / "app" / "lessons.json"


class Api:
    """Функции, които страницата вика през window.pywebview.api."""

    def get_lessons(self):
        return json.loads(LESSONS_FILE.read_text(encoding="utf-8"))


def main():
    os.chdir(BASE)
    webview.create_window(
        "Уроци по перкусии",
        "app/index.html",
        js_api=Api(),
        width=1200,
        height=860,
        min_size=(900, 650),
    )
    webview.start(http_server=True)


if __name__ == "__main__":
    main()
