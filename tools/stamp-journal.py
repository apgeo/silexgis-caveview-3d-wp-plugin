#!/usr/bin/env python3
"""Writes into cave-trips.js the stamp cave-journal.js is asked for under.

cave-journal.js is brought in by cave-trips.js itself, so WordPress never versions its
address and the site caches scripts for a week: a reader would go on running last week's
copy. cave-trips.js therefore asks for it under a stamp, and the stamp is the first twelve
characters of the file's own SHA-256, so that it changes exactly when the file does.

    python3 stamp-journal.py           # rewrite the stamp if it is stale; prints what it did
    python3 stamp-journal.py --check   # exit 1, changing nothing, when it is stale

deploy-trips.py runs the check and refuses to upload either file with a stale stamp.
"""
import hashlib, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
JS = os.path.join(os.path.dirname(HERE), "plugin", "silexgis-caveview-3d", "assets", "js")
JOURNAL, TRIPS = os.path.join(JS, "cave-journal.js"), os.path.join(JS, "cave-trips.js")
LINE = re.compile(r"var JOURNAL_STAMP = '([^']*)';")


def wanted():
    with open(JOURNAL, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()[:12]


def held():
    with open(TRIPS, encoding="utf-8") as f:
        found = LINE.findall(f.read())
    if len(found) != 1:
        sys.exit("cave-trips.js: expected exactly one JOURNAL_STAMP line, found %d" % len(found))
    return found[0]


def stale():
    return held() != wanted()


if __name__ == "__main__":
    want, have = wanted(), held()
    if want == have:
        print("stamp is current:", have)
    elif "--check" in sys.argv[1:]:
        sys.exit("stale: cave-trips.js asks for cave-journal.js under %s, the file is %s — run stamp-journal.py" % (have, want))
    else:
        with open(TRIPS, encoding="utf-8") as f:
            text = f.read()
        with open(TRIPS, "w", encoding="utf-8") as f:
            f.write(LINE.sub("var JOURNAL_STAMP = '%s';" % want, text))
        print("stamp %s -> %s" % (have, want))
