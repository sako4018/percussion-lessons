"""Генерира app/lessons.json — всеки урок има 4 примера по 8 такта.

    python tools/gen_lessons.py        всички уроци
    python tools/gen_lessons.py 12     само първите 12

Запис на такт: w h q qd 8 16 t8 (t8 = осмина в триола); „r“ накрая = пауза (qr, 8r, t8r).
Тактовете се сглобяват от „клетки“ — парче за 1–2 удара (4/4) или за един дял (/8).
Случайността е с фиксиран seed, затова всяко пускане дава същия резултат.
"""
import json
import random
import sys
from fractions import Fraction as F
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "app" / "lessons.json"
EXAMPLES = 4
BARS = 8
BEATS = {"w": F(4), "h": F(2), "qd": F(3, 2), "q": F(1), "8": F(1, 2), "16": F(1, 4), "t8": F(1, 3)}
LONG = {"q", "h", "w"}

SIXTEENTHS = "16 16 16 16"
G1 = "8 16 16"  # осмина + 2 шестнайсетини
G2 = "16 16 8"  # 2 шестнайсетини + осмина
TRIPLET = "t8 t8 t8"
TRIPLETS_REST = ["t8 t8r t8", "t8r t8 t8", "t8 t8 t8r"]

# клетки за дял от 2 и 3 осмини
P2, P2R = ["8 8", "q"], ["8 8r", "8r 8", "qr"]
P3, P3R = ["8 8 8", "q 8", "8 q"], ["8 8r 8", "8r 8 8", "8 8 8r", "qr 8", "8 qr"]


def base(tok):
    return tok[:-1] if tok.endswith("r") else tok


def is_rest(tok):
    return tok.endswith("r")


def length(cell):
    return sum(BEATS[base(t)] for t in cell.split())


def rest_only(cell):
    return all(is_rest(t) for t in cell.split())


def has_rest(cell):
    return any(is_rest(t) for t in cell.split())


def lesson(title, learn, tempo, *, first=None, focus=(), easy=(), extra=(),
           ts="4/4", parts=None, rest_from=None, no_q=False, max_rest=1):
    """first — готов пример 1; focus — групи клетки, от всяка трябва да има поне една в такта;
    rest_from — от кой пример (0 = първия) в /8 размерите влизат паузи."""
    return dict(title=title, learn=learn, tempo=tempo, first=first, focus=[list(g) for g in focus],
                easy=list(easy), extra=list(extra), ts=ts, parts=parts, rest_from=rest_from,
                no_q=no_q, max_rest=max_rest)


def odd(title, ts, parts, learn, tempo, **kw):
    return lesson(title, learn, tempo, ts=ts, parts=parts, **kw)


LESSONS = [
    # 1–12: пример 1 е вече одобреният
    lesson("Четвъртини и четвъртини паузи",
           ["Четвъртина нота – един удар", "Четвъртина пауза – един удар тишина", "Броене 1, 2, 3, 4"], 60,
           first=["q q q q", "q qr q qr", "q q qr q", "qr q qr q", "q qr q q", "qr q q q", "q q q qr", "qr qr q q"],
           focus=[["qr"]], easy=["q"], max_rest=2),
    lesson("Четвъртини и половинки",
           ["Половинка нота – трае 2 удара", "Удряш веднъж, броиш две", "Смесване с четвъртини"], 60,
           first=["q q q q", "h h", "h q q", "q q h", "q h q", "q q q q", "h q q", "h h"],
           focus=[["h"]], easy=["q"]),
    lesson("Четвъртини, половинки и паузи",
           ["Половинка пауза – 2 удара тишина", "Паузите също се броят", "Всичко досега заедно"], 60,
           first=["h qr q", "q qr h", "hr q q", "q q hr", "q hr q", "hr h", "q q qr q", "h hr"],
           focus=[["qr", "hr"]], easy=["q", "h"]),
    lesson("Цели, половинки и четвъртини",
           ["Цяла нота – трае 4 удара", "Сравнение: цяла, половинка, четвъртина", "Броене през целия такт"], 60,
           first=["q q q q", "w", "h q q", "w", "h h", "w", "q q h", "w"],
           focus=[["w", "h"]], easy=["q"]),
    lesson("Осмини с четвъртини",
           ["Осмина нота – половин удар", "Броене „1 и 2 и 3 и 4 и“", "Две осмини = една четвъртина"], 70,
           first=["q q q q", "8 8 8 8 8 8 8 8", "q 8 8 q 8 8", "8 8 q 8 8 q", "8 8 8 8 q q", "q q 8 8 8 8",
                  "8 8 q q 8 8", "q 8 8 8 8 q"],
           focus=[["8 8"]], easy=["q"]),
    lesson("Осмини, четвъртини и четвъртини паузи",
           ["Осмини след пауза", "Точно влизане след четвъртина пауза", "Смесване на осмини и четвъртини"], 70,
           first=["8 8 qr 8 8 qr", "q qr 8 8 8 8", "8 8 8 8 qr q", "qr 8 8 q qr", "qr q 8 8 qr", "8 8 qr qr 8 8",
                  "q 8 8 qr 8 8", "8 8 8 8 8 8 qr"],
           focus=[["qr"]], easy=["q", "8 8"]),
    lesson("Осмини паузи",
           ["Осмина пауза – половин удар тишина", "Удар на „и“", "Осмини и четвъртини с паузи"], 70,
           first=["8 8r 8 8r q qr", "8r 8 8r 8 q q", "q 8 8r qr 8r 8", "8 8 8r 8 qr q", "8r 8 q 8r 8 q",
                  "q 8r 8 8 8r qr", "8 8r 8 8r 8 8r 8 8r", "qr 8r 8 q 8 8"],
           focus=[["8 8r", "8r 8"]], easy=["q", "8 8"], extra=["qr"]),
    lesson("Шестнайсетини",
           ["Шестнайсетина – четвърт удар", "Броене „1 е и а“", "Четири шестнайсетини = една четвъртина"], 60,
           first=["16 16 16 16 16 16 16 16 q q", "8 8 16 16 16 16 q 8 8", "q 16 16 16 16 8 8 q",
                  "16 16 16 16 16 16 16 16 16 16 16 16 q", "16 16 16 16 q 16 16 16 16 q",
                  "8 8 8 8 16 16 16 16 16 16 16 16", "q q 16 16 16 16 q", "16 16 16 16 8 8 16 16 16 16 q"],
           focus=[[SIXTEENTHS]], easy=["q", "8 8"]),
    lesson("Шестнайсетини и паузи",
           ["Шестнайсетини между паузи", "Точно спиране и влизане", "Всички дължини и паузи досега"], 60,
           first=["16 16 16 16 8 8r q qr", "8r 8 16 16 16 16 qr q", "q 8 8r 16 16 16 16 qr",
                  "16 16 16 16 qr 8 8r 8 8", "qr 16 16 16 16 8r 8 q", "16 16 16 16 8r 8 16 16 16 16 qr",
                  "8 8r qr 16 16 16 16 q", "16 16 16 16 16 16 16 16 8 8r qr"],
           focus=[[SIXTEENTHS], ["qr", "8 8r", "8r 8"]], easy=["q", "8 8"]),
    lesson("Група: осмина + 2 шестнайсетини",
           ["Групата се свири в един удар", "Броене „1 и а“", "Групата между четвъртини и осмини"], 60,
           first=["8 16 16 q 8 16 16 q", "8 8 8 16 16 q q", "8 16 16 8 16 16 8 8 16 16 16 16",
                  "8 16 16 8 16 16 8 16 16 q", "q 8 16 16 q 8 16 16", "8 16 16 8 8 8 16 16 q",
                  "8 16 16 16 16 16 16 8 16 16 q", "8 16 16 8 16 16 q q"],
           focus=[[G1]], easy=["q", "8 8", SIXTEENTHS]),
    lesson("Група: 2 шестнайсетини + осмина",
           ["Групата се свири в един удар", "Броене „1 е и“", "Разлика с групата от урок 10"], 60,
           first=["16 16 8 q 16 16 8 q", "q 16 16 8 8 8 16 16 16 16", "16 16 8 16 16 8 16 16 8 8 8",
                  "16 16 8 16 16 8 16 16 8 q", "q 16 16 8 q 16 16 8", "16 16 8 8 8 16 16 8 q",
                  "16 16 16 16 16 16 8 16 16 8 q", "16 16 8 16 16 8 q q"],
           focus=[[G2]], easy=["q", "8 8", SIXTEENTHS]),
    lesson("Комбинация на групите",
           ["Смесване на двете групи", "Осмина пауза преди група", "Четене на по-сложен ритъм"], 60,
           first=["8 16 16 16 16 8 8 16 16 16 16 8", "8r 16 16 8 16 16 8r 8 q", "16 16 8 8r 8 8 16 16 8r 8",
                  "8 16 16 16 16 8 8r 16 16 q", "8 16 16 16 16 8 qr 8 16 16", "16 16 8 8r 16 16 8 16 16 q",
                  "8r 8 8 16 16 16 16 8 8r 8", "8 16 16 16 16 8 8 16 16 q"],
           focus=[[G1], [G2]], easy=["q", "8 8", SIXTEENTHS], extra=["8r 8", "8 8r", "8r 16 16"]),

    # 13–19
    lesson("Осмина пауза и 2 шестнайсетини",
           ["Група „осмина пауза + 2 шестнайсетини“", "Група „2 шестнайсетини + осмина пауза“",
            "Смесване с четвъртини, осмини, шестнайсетини и паузите им"], 60,
           focus=[["8r 16 16", "16 16 8r"]], easy=["q", "8 8", SIXTEENTHS],
           extra=["qr", "8 8r", "8r 8", G1, G2, "16r 16 16 16"]),
    lesson("Синкоп",
           ["Синкоп: осмина – четвъртина – осмина", "Удар между ударите на метронома",
            "Синкопът заедно с групите и паузите"], 60,
           focus=[["8 q 8"]], easy=["q", "8 8", G1, G2],
           extra=["qr", "8 8r", "8r 8", SIXTEENTHS, "8r 16 16", "16 16 8r", "16r 16 16 16"]),
    lesson("Четвъртина с точка",
           ["Точката удължава нотата с половината ѝ", "Четвъртина с точка + осмина = 2 удара",
            "Смесване с всички дължини и паузи"], 60,
           focus=[["qd 8"]], easy=["q", "8 8"],
           extra=["qr", "8 8r", "8r 8", SIXTEENTHS, G1, G2, "16r 16 16 16"]),
    lesson("Триола",
           ["Триола – 3 равни осмини в един удар", "Броене „1 три о ла“", "Триола и четвъртина"], 60,
           focus=[[TRIPLET]], easy=["q"]),
    lesson("Триоли и паузи",
           ["Триолата е главното – и с пауза вътре", "Триоли между четвъртини, осмини и шестнайсетини",
            "Паузите на всички дължини"], 60,
           focus=[[TRIPLET] + TRIPLETS_REST], easy=["q", "8 8"],
           extra=["qr", "8 8r", "8r 8", SIXTEENTHS, "16r 16 16 16"]),
    lesson("Триоли и шестнайсетини",
           ["Смяна от триола към шестнайсетини", "3 или 4 удара в един удар",
            "Четвъртини, осмини и паузи между тях"], 60,
           focus=[[TRIPLET, "t8 t8r t8"], [SIXTEENTHS]], easy=["q", "8 8"],
           extra=["qr", "8 8r", "8r 8", "16r 16 16 16"]),
    lesson("Триоли и групи",
           ["Триола до група „осмина + 2 шестнайсетини“", "Триола до група „2 шестнайсетини + осмина“",
            "Бързо превключване между деленията"], 60,
           focus=[[TRIPLET], [G1, G2]], easy=["q", "8 8"], extra=["qr", SIXTEENTHS, "8r 8"]),

    # 20–33: неравноделни размери
    odd("5/8 — втори удължен дял", "5/8", [2, 3],
        ["Неравноделен размер 5/8 = 2 + 3", "Броене „1 2 | 1 2 3“", "Осмини и четвъртини"], 80),
    odd("5/8 с паузи", "5/8", [2, 3],
        ["5/8 = 2 + 3", "Четвъртина пауза и осмина пауза", "Осмини"], 80, rest_from=0, no_q=True),
    odd("5/8 — първи удължен дял", "5/8", [3, 2],
        ["5/8 = 3 + 2", "Броене „1 2 3 | 1 2“", "Осмини, четвъртини и паузи"], 80, rest_from=1),
    odd("7/8 — втори удължен дял", "7/8", [2, 3, 2],
        ["Неравноделен размер 7/8 = 2 + 3 + 2", "Броене „1 2 | 1 2 3 | 1 2“", "Осмини и четвъртини"], 80),
    odd("7/8 с паузи", "7/8", [2, 3, 2],
        ["7/8 = 2 + 3 + 2", "Четвъртина пауза и осмина пауза", "Осмини"], 80, rest_from=0, no_q=True),
    odd("7/8 — първи удължен дял", "7/8", [3, 2, 2],
        ["7/8 = 3 + 2 + 2", "Броене „1 2 3 | 1 2 | 1 2“", "Осмини, четвъртини и паузи"], 80, rest_from=1),
    odd("8/8 — първи и трети удължен дял", "8/8", [3, 2, 3],
        ["8/8 = 3 + 2 + 3", "Не е 4/4 — дяловете са неравни", "Осмини, четвъртини и паузи"], 80, rest_from=1),
    odd("8/8 — втори и трети удължен дял", "8/8", [2, 3, 3],
        ["8/8 = 2 + 3 + 3", "Броене „1 2 | 1 2 3 | 1 2 3“", "Осмини, четвъртини и паузи"], 80, rest_from=1),
    odd("8/8 — първи и втори удължен дял", "8/8", [3, 3, 2],
        ["8/8 = 3 + 3 + 2", "Броене „1 2 3 | 1 2 3 | 1 2“", "Осмини, четвъртини и паузи"], 80, rest_from=1),
    odd("9/8 — четвърти удължен дял", "9/8", [2, 2, 2, 3],
        ["9/8 = 2 + 2 + 2 + 3", "Примери 1–2: четвъртини и осмини", "Примери 3–4: и паузите им"], 90, rest_from=2),
    odd("9/8 — втори удължен дял", "9/8", [2, 3, 2, 2],
        ["9/8 = 2 + 3 + 2 + 2", "Примери 1–2: четвъртини и осмини", "Примери 3–4: и паузите им"], 90, rest_from=2),
    odd("9/8 — първи удължен дял", "9/8", [3, 2, 2, 2],
        ["9/8 = 3 + 2 + 2 + 2", "Примери 1–2: четвъртини и осмини", "Примери 3–4: и паузите им"], 90, rest_from=2),
    odd("10/8 — първи и четвърти удължен дял", "10/8", [3, 2, 2, 3],
        ["10/8 = 3 + 2 + 2 + 3", "Примери 1–2: четвъртини и осмини", "Примери 3–4: и паузите им"], 90, rest_from=2),
    odd("11/8 — трети удължен дял", "11/8", [2, 2, 3, 2, 2],
        ["11/8 = 2 + 2 + 3 + 2 + 2", "Примери 1–2: четвъртини и осмини", "Примери 3–4: и паузите им"], 90,
        rest_from=2),
]


def pool_44(s, e):
    focus = [c for g in s["focus"] for c in g]
    cells = list(dict.fromkeys(focus + s["easy"] + (s["extra"] if e >= 1 else [])))
    return cells, [3 if c in focus else 1 for c in cells]


def gen_44(rng, cells, weights):
    for _ in range(100):
        out, left = [], F(4)
        while left > 0:
            opts = [(c, w) for c, w in zip(cells, weights) if length(c) <= left]
            if not opts:
                break
            c = rng.choices([o[0] for o in opts], [o[1] for o in opts])[0]
            out.append(c)
            left -= length(c)
        if left == 0:
            return out
    raise RuntimeError("не мога да напълня такт")


def pools_8(s, e):
    with_rests = s["rest_from"] is not None and e >= s["rest_from"]
    pools = {2: ["8 8"] if s["no_q"] else list(P2), 3: ["8 8 8"] if s["no_q"] else list(P3)}
    weights = {k: [2] * len(v) for k, v in pools.items()}
    if with_rests:
        for k, extra in ((2, P2R), (3, P3R)):
            pools[k] += extra
            weights[k] += [1] * len(extra)
    return pools, weights, with_rests


def valid(s, cells, need_rest):
    if sum(rest_only(c) for c in cells) > s["max_rest"]:
        return False
    if not all(any(c in g for c in cells) for g in s["focus"]):
        return False
    return not need_rest or any(has_rest(c) for c in cells)


def strong_end(cells):
    return not has_rest(cells[-1]) and cells[-1].split()[-1] in LONG


def starts_rest(cells):
    return cells[0].split()[0].endswith("r")


def ends_rest(cells):
    return cells[-1].split()[-1].endswith("r")


def build(s, e, rng):
    if s["parts"]:
        pools, weights, need_rest = pools_8(s, e)
        make = lambda: [rng.choices(pools[p], weights[p])[0] for p in s["parts"]]
    else:
        cells, weights = pool_44(s, e)
        need_rest = False
        make = lambda: gen_44(rng, cells, weights)

    used = []
    prev_ends_rest = False  # не позволява пауза веднага след пауза през чертата на такта
    for i in range(BARS):
        chosen = None
        chosen_cand = None
        for attempt in range(3000):
            cand = make()
            if not valid(s, cand, need_rest):
                continue
            if prev_ends_rest and starts_rest(cand) and attempt < 2500:
                continue
            if i == BARS - 1:  # краят: дълга нота, а ако няма такава — поне без пауза
                if not (strong_end(cand) if attempt < 1500 else not has_rest(cand[-1])):
                    continue
            key = " ".join(cand)
            if used and key == used[-1]:
                continue
            if key in used and attempt < 2000:
                continue
            chosen = key
            chosen_cand = cand
            break
        if chosen is None:
            raise RuntimeError(f"„{s['title']}“: пример {e + 1}, такт {i + 1}")
        used.append(chosen)
        prev_ends_rest = ends_rest(chosen_cand)
    return used


def to_tokens(src, total):
    """„8 16 16 qr“ → токени с R/L; ръцете се редуват, от R във всеки такт."""
    out, hand, beats = [], "R", F(0)
    for t in src.split():
        beats += BEATS[base(t)]
        if is_rest(t):
            out.append(f"{base(t)}:r")
        else:
            out.append(f"{t}:sd:{hand}")
            hand = "L" if hand == "R" else "R"
    assert beats == total, f"„{src}“ = {beats}, трябва {total}"
    return " ".join(out)


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else len(LESSONS)
    lessons = []
    for n, s in enumerate(LESSONS[:limit], 1):
        num, den = map(int, s["ts"].split("/"))
        total = F(num * 4, den)
        if s["parts"]:
            assert sum(s["parts"]) == num, s["title"]
        examples = []
        for e in range(EXAMPLES):
            bars = s["first"] if e == 0 and s["first"] else build(s, e, random.Random(n * 100 + e))
            assert len(bars) == BARS, s["title"]
            examples.append([to_tokens(b, total) for b in bars])
        item = {"id": f"l{n}", "title": s["title"], "learn": s["learn"], "tempo": s["tempo"], "timeSignature": s["ts"]}
        if s["parts"]:
            item["parts"] = s["parts"]
        item["examples"] = examples
        lessons.append(item)

    data = {"instruments": [{
        "id": "snare",
        "name": "Малък барабан",
        "subtitle": "Четене на ритъм",
        "voices": {"sd": {"name": "Малък барабан", "hint": "R = дясна, L = лява ръка", "key": "c/5", "sound": "snare"}},
        "lessons": lessons,
    }]}
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(lessons)} урока × {EXAMPLES} примера × {BARS} такта → {OUT.name}")


if __name__ == "__main__":
    main()
