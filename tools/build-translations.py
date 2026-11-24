#!/usr/bin/env python3
"""The plugin's translations: the template from the code, the compiled files from each .po.

Silex Cave Embed writes every word of its admin screens in English, through WordPress's
translation functions under the text domain `silexgis-caveview-3d`, and keeps its translations in
`plugin/silexgis-caveview-3d/languages/`. No gettext tools are installed on the machines this
is built on, so this file is the whole tool chain, with nothing but Python's standard library:

  - it reads the plugin's PHP and writes `languages/silexgis-caveview-3d.pot`, every string the
    code hands to an i18n function with the plugin's text domain (and the header's
    Description), with the translators' comments the code carries;
  - it reads every `languages/silexgis-caveview-3d-<locale>.po` and writes beside it the two files
    WordPress loads: `<…>.mo`, the GNU binary catalogue (read by every WordPress), and
    `<…>.l10n.php`, the PHP array WordPress 6.5 and later read first.

    python3 build-translations.py            # write what is out of date, and say what it did
    python3 build-translations.py --check    # write nothing; fail if anything is out of date

`--check` fails when the template or a compiled file is not what the sources make of it, and
when a .po does not translate every string of the code: a string missing, left empty or marked
fuzzy, a plural without all of its language's forms, a translation whose placeholders (%s,
%1$d, …) are not the original's, or an entry for a string the code no longer has. A further
argument names another plugin directory (the default is the one beside this tree).

Adding a language: copy the .pot to `silexgis-caveview-3d-<locale>.po` (e.g. `-de_DE.po`), fill in
the header's Language and Plural-Forms, translate every msgstr, and run this file.
"""
import os
import re
import struct
import sys

DOMAIN = "silexgis-caveview-3d"
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PLUGIN = os.path.normpath(os.path.join(HERE, "..", "plugin", "silexgis-caveview-3d"))

# What each i18n function's arguments are, in order: the parts of an entry, None for the number.
FUNCTIONS = {
    "__": ("msgid", "domain"), "esc_html__": ("msgid", "domain"), "esc_attr__": ("msgid", "domain"),
    "_e": ("msgid", "domain"), "esc_html_e": ("msgid", "domain"), "esc_attr_e": ("msgid", "domain"),
    "_x": ("msgid", "msgctxt", "domain"), "_ex": ("msgid", "msgctxt", "domain"),
    "esc_html_x": ("msgid", "msgctxt", "domain"), "esc_attr_x": ("msgid", "msgctxt", "domain"),
    "_n": ("msgid", "msgid_plural", None, "domain"), "_n_noop": ("msgid", "msgid_plural", "domain"),
    "_nx": ("msgid", "msgid_plural", None, "msgctxt", "domain"), "_nx_noop": ("msgid", "msgid_plural", "msgctxt", "domain"),
}


class Fault(Exception):
    pass


# ---------------------------------------------------------------- reading PHP

def php_tokens(text):
    """The PHP of a file as tokens: (kind, value, line). Inline HTML is skipped whole."""
    out, i, n, line = [], 0, len(text), 1
    php = False
    while i < n:
        if not php:
            j = text.find("<?php", i)
            k = text.find("<?=", i)
            starts = [x for x in (j, k) if x >= 0]
            if not starts:
                break
            at = min(starts)
            line += text.count("\n", i, at)
            i = at + (5 if at == j else 3)
            php = True
            continue
        c = text[i]
        if c == "\n":
            line += 1; i += 1; continue
        if c in " \t\r":
            i += 1; continue
        if text.startswith("?>", i):
            php = False; i += 2; continue
        if text.startswith("/*", i):
            end = text.find("*/", i + 2)
            end = n if end < 0 else end + 2
            body = text[i:end]
            out.append(("comment", body, line + body.count("\n")))
            line += body.count("\n"); i = end; continue
        if text.startswith("//", i) or c == "#":
            end = i
            while end < n and text[end] != "\n" and not text.startswith("?>", end):
                end += 1
            out.append(("comment", text[i:end], line)); i = end; continue
        if c == "'":
            j, buf = i + 1, []
            while j < n and text[j] != "'":
                if text[j] == "\\" and j + 1 < n and text[j + 1] in "'\\":
                    buf.append(text[j + 1]); j += 2; continue
                buf.append(text[j]); j += 1
            raw = text[i:j + 1]
            out.append(("str", "".join(buf), line)); line += raw.count("\n"); i = j + 1; continue
        if c == '"':
            j = i + 1
            while j < n and text[j] != '"':
                j += 2 if text[j] == "\\" else 1
            raw = text[i + 1:j]
            value = unescape_double(raw)
            out.append(("str" if value is not None else "expr", value, line))
            line += raw.count("\n"); i = j + 1; continue
        m = re.compile(r"[A-Za-z_\x80-\uffff][A-Za-z0-9_\x80-\uffff]*").match(text, i)
        if m:
            out.append(("id", m.group(0), line)); i = m.end(); continue
        if c == "$":
            m = re.compile(r"\$[A-Za-z_][A-Za-z0-9_]*").match(text, i)
            if m:
                out.append(("var", m.group(0), line)); i = m.end(); continue
        for op in ("->", "::", "=>"):
            if text.startswith(op, i):
                out.append(("op", op, line)); i += len(op); break
        else:
            out.append(("op", c, line)); i += 1
    return out


def unescape_double(raw):
    """A double-quoted PHP string's value, or None when it interpolates a variable."""
    out, i = [], 0
    while i < len(raw):
        c = raw[i]
        if c == "$" and i + 1 < len(raw) and (raw[i + 1].isalpha() or raw[i + 1] in "_{"):
            return None
        if c == "{" and i + 1 < len(raw) and raw[i + 1] == "$":
            return None
        if c != "\\" or i + 1 == len(raw):
            out.append(c); i += 1; continue
        e = raw[i + 1]
        simple = {"n": "\n", "t": "\t", "r": "\r", "v": "\v", "e": "\x1b", "f": "\f", "\\": "\\", "$": "$", '"': '"'}
        if e in simple:
            out.append(simple[e]); i += 2; continue
        m = re.compile(r"[0-7]{1,3}").match(raw, i + 1)
        if m:
            out.append(chr(int(m.group(0), 8) & 0xFF)); i = m.end(); continue
        m = re.compile(r"x([0-9A-Fa-f]{1,2})").match(raw, i + 1)
        if m:
            out.append(chr(int(m.group(1), 16))); i = m.end(); continue
        m = re.compile(r"u\{([0-9A-Fa-f]+)\}").match(raw, i + 1)
        if m:
            out.append(chr(int(m.group(1), 16))); i = m.end(); continue
        out.append(c); i += 1
    return "".join(out)


def call_arguments(tokens, at):
    """The arguments of the call whose "(" is tokens[at]: each a string or None, and the index after ")"."""
    args, depth, current, i = [], 0, [], at + 1
    while i < len(tokens):
        kind, value, _ = tokens[i]
        if kind == "op" and value in "([{":
            depth += 1
        elif kind == "op" and value in ")]}":
            if depth == 0:
                if current:
                    args.append(current)
                break
            depth -= 1
        elif kind == "op" and value == "," and depth == 0:
            args.append(current); current = []; i += 1; continue
        if kind != "comment":
            current.append(tokens[i])
        i += 1

    def literal(parts):
        # One string, or strings joined with "." — anything else is not a literal.
        if not parts or parts[0][0] != "str":
            return None
        text, expect_dot = parts[0][1], True
        for kind, value, _ in parts[1:]:
            if expect_dot and kind == "op" and value == ".":
                expect_dot = False
            elif not expect_dot and kind == "str":
                text += value; expect_dot = True
            else:
                return None
        return text if expect_dot else None
    return [literal(a) for a in args], i + 1


def translators_note(comment):
    body = re.sub(r"^\s*(/\*+|//|#)", "", comment)
    body = re.sub(r"\*+/\s*$", "", body)
    body = " ".join(part.strip().lstrip("*").strip() for part in body.split("\n")).strip()
    return body if body.lower().startswith("translators:") else None


def extract(plugin):
    """Every string of the plugin's text domain: {(msgctxt, msgid, msgid_plural): {refs, notes}}."""
    entries = {}

    def add(key, ref, note):
        e = entries.setdefault(key, {"refs": [], "notes": []})
        e["refs"].append(ref)
        if note and note not in e["notes"]:
            e["notes"].append(note)

    files = ["silexgis-caveview-3d.php"]
    files += sorted("includes/" + f for f in os.listdir(os.path.join(plugin, "includes")) if f.endswith(".php"))
    files += ["uninstall.php"]
    for rel in files:
        with open(os.path.join(plugin, rel), encoding="utf-8") as fh:
            text = fh.read()
        if rel == "silexgis-caveview-3d.php":
            m = re.search(r"^[ \t/*#@]*Description:(.*)$", text[:8192], re.M)
            if m:
                add((None, m.group(1).strip(), None), rel + ":" + str(text[:m.start()].count("\n") + 1), "Description of the plugin")
        tokens = php_tokens(text)
        note, note_line = None, -10
        for i, (kind, value, line) in enumerate(tokens):
            if kind == "comment":
                found = translators_note(value)
                if found:
                    note, note_line = found, line
                continue
            if kind != "id" or value not in FUNCTIONS:
                continue
            if i + 1 >= len(tokens) or tokens[i + 1][:2] != ("op", "("):
                continue
            previous = tokens[i - 1] if i else None
            if previous and ((previous[0] == "op" and previous[1] in ("->", "::")) or previous[:2] == ("id", "function")):
                continue
            args, _ = call_arguments(tokens, i + 1)
            roles = FUNCTIONS[value]
            if len(args) < len(roles):
                continue
            parts = dict((role, args[k]) for k, role in enumerate(roles) if role)
            if parts.get("domain") != DOMAIN:
                continue
            for role in ("msgid", "msgid_plural", "msgctxt"):
                if role in parts and parts[role] is None:
                    raise Fault("%s:%d: %s() is given something other than a literal text for its %s" % (rel, line, value, role))
            add((parts.get("msgctxt"), parts["msgid"], parts.get("msgid_plural")), "%s:%d" % (rel, line),
                note if line - note_line <= 3 else None)
            note, note_line = None, -10
    return entries


# ---------------------------------------------------------------- .po and .pot

def po_quote(text):
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n").replace("\t", "\\t").replace("\r", "\\r") + '"'


def po_unquote(s, where):
    s = s.strip()
    if len(s) < 2 or s[0] != '"' or s[-1] != '"':
        raise Fault("%s: not a quoted text: %s" % (where, s[:60]))
    out, i, body = [], 0, s[1:-1]
    while i < len(body):
        c = body[i]
        if c == "\\" and i + 1 < len(body):
            e = body[i + 1]
            out.append({"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\"}.get(e, "\\" + e)); i += 2; continue
        out.append(c); i += 1
    return "".join(out)


def parse_po(path):
    """The entries of a .po: list of dicts with msgctxt, msgid, msgid_plural, msgstr (list), flags."""
    entries, current, field = [], None, None
    name = os.path.basename(path)

    def finish():
        if current is not None and current.get("msgid") is not None:
            entries.append(current)

    with open(path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for number, raw in enumerate(lines, 1):
        line = raw.strip()
        where = "%s:%d" % (name, number)
        if not line:
            continue
        if line.startswith("#~"):
            continue
        if line.startswith("#"):
            if current is not None and current.get("msgid") is not None and field != "comment":
                finish(); current = None
            if current is None:
                current = {"msgctxt": None, "msgid": None, "msgid_plural": None, "msgstr": {}, "flags": set()}
            if line.startswith("#,"):
                current["flags"].update(f.strip() for f in line[2:].split(","))
            field = "comment"
            continue
        m = re.match(r'(msgctxt|msgid_plural|msgid|msgstr(?:\[(\d+)\])?)\s+(".*")$', line)
        if m:
            key = m.group(1)
            if key in ("msgctxt", "msgid") and current is not None and current.get("msgid") is not None and field not in ("msgctxt", "comment"):
                finish(); current = None
            if current is None:
                current = {"msgctxt": None, "msgid": None, "msgid_plural": None, "msgstr": {}, "flags": set()}
            value = po_unquote(m.group(3), where)
            if key.startswith("msgstr"):
                index = int(m.group(2)) if m.group(2) else 0
                current["msgstr"][index] = value
                field = ("msgstr", index)
            else:
                current[key] = value
                field = key
            continue
        if line.startswith('"') and current is not None and field and field != "comment":
            value = po_unquote(line, where)
            if isinstance(field, tuple):
                current["msgstr"][field[1]] += value
            else:
                current[field] += value
            continue
        raise Fault("%s: cannot read this line" % where)
    finish()
    for e in entries:
        e["msgstr"] = [e["msgstr"].get(k, "") for k in range(max(e["msgstr"].keys(), default=-1) + 1)]
    return entries


def headers_of(entries):
    for e in entries:
        if e["msgid"] == "" and e["msgctxt"] is None:
            out = {}
            for line in (e["msgstr"][0] if e["msgstr"] else "").split("\n"):
                if ":" in line:
                    k, v = line.split(":", 1)
                    out[k.strip().lower()] = v.strip()
            return e["msgstr"][0], out
    return None, {}


def plugin_version(plugin):
    with open(os.path.join(plugin, "silexgis-caveview-3d.php"), encoding="utf-8") as fh:
        m = re.search(r"^[ \t/*#@]*Version:(.*)$", fh.read()[:8192], re.M)
    return m.group(1).strip() if m else "?"


def ordered(entries):
    def first(item):
        ref = item[1]["refs"][0]
        f, l = ref.rsplit(":", 1)
        return (FILE_ORDER(f), int(l), item[0][1])
    return sorted(entries.items(), key=first)


def FILE_ORDER(f):
    return (0 if f == "silexgis-caveview-3d.php" else 2 if f == "uninstall.php" else 1, f)


def make_pot(plugin, entries):
    out = [
        "# The strings of Silex Cave Embed's admin screens, for translating into another language.",
        "# Written by tools/build-translations.py from the plugin's PHP; do not edit by hand.",
        "# This file is distributed under the same licence as the plugin (GPL-3.0-or-later).",
        'msgid ""',
        'msgstr ""',
        po_quote("Project-Id-Version: SilexGIS CaveView 3D %s\n" % plugin_version(plugin)),
        po_quote("MIME-Version: 1.0\n"),
        po_quote("Content-Type: text/plain; charset=UTF-8\n"),
        po_quote("Content-Transfer-Encoding: 8bit\n"),
        po_quote("Language: \n"),
        po_quote("Plural-Forms: nplurals=INTEGER; plural=EXPRESSION;\n"),
        po_quote("X-Domain: %s\n" % DOMAIN),
        "",
    ]
    for (ctx, msgid, plural), info in ordered(entries):
        for note in info["notes"]:
            out.append("#. " + note)
        out.append("#: " + " ".join(info["refs"]))
        if re.search(r"%(\d+\$)?[-+ 0#']*\d*(\.\d+)?[bcdeEfFgGosuxX]", msgid + (plural or "")):
            out.append("#, php-format")
        if ctx is not None:
            out.append("msgctxt " + po_quote(ctx))
        out.append("msgid " + po_quote(msgid))
        if plural is not None:
            out.append("msgid_plural " + po_quote(plural))
            out += ['msgstr[0] ""', 'msgstr[1] ""']
        else:
            out.append('msgstr ""')
        out.append("")
    return "\n".join(out)


# ---------------------------------------------------------------- the compiled forms

def compiled_pairs(po_entries):
    """(key, value) as both compiled forms hold them, sorted by key; the header first."""
    pairs = {}
    for e in po_entries:
        if "fuzzy" in e["flags"] and e["msgid"] != "":
            continue
        if not e["msgstr"] or not all(e["msgstr"]):
            continue
        key = e["msgid"] if e["msgid_plural"] is None else e["msgid"] + "\0" + e["msgid_plural"]
        if e["msgctxt"] is not None:
            key = e["msgctxt"] + "\4" + key
        pairs[key] = "\0".join(e["msgstr"])
    return sorted(pairs.items(), key=lambda kv: kv[0].encode("utf-8"))


def make_mo(pairs):
    """GNU .mo, little-endian, revision 0, no hash table."""
    keys = [k.encode("utf-8") for k, _ in pairs]
    values = [v.encode("utf-8") for _, v in pairs]
    count = len(pairs)
    originals_at = 28
    translations_at = originals_at + 8 * count
    data_at = translations_at + 8 * count
    table_o, table_t, blob = [], [], b""
    for k in keys:
        table_o.append((len(k), data_at + len(blob)))
        blob += k + b"\0"
    for v in values:
        table_t.append((len(v), data_at + len(blob)))
        blob += v + b"\0"
    out = struct.pack("<7I", 0x950412DE, 0, count, originals_at, translations_at, 0, data_at)
    for length, offset in table_o + table_t:
        out += struct.pack("<2I", length, offset)
    return out + blob


def php_string(text):
    if not re.search(r"[\x00-\x1f\x7f]", text):
        return "'" + text.replace("\\", "\\\\").replace("'", "\\'") + "'"
    out = []
    for c in text:
        if c in '\\"$':
            out.append("\\" + c)
        elif c == "\n":
            out.append("\\n")
        elif c == "\t":
            out.append("\\t")
        elif ord(c) < 0x20 or ord(c) == 0x7F:
            out.append("\\x%02X" % ord(c))
        else:
            out.append(c)
    return '"' + "".join(out) + '"'


def make_l10n_php(pairs, headers):
    messages = ",".join(php_string(k) + "=>" + php_string(v) for k, v in pairs if k != "")
    return ("<?php\n// Written by tools/build-translations.py from the .po beside it; do not edit by hand.\n"
            "return ['domain'=>" + php_string(DOMAIN)
            + ",'plural-forms'=>" + php_string(headers.get("plural-forms", ""))
            + ",'language'=>" + php_string(headers.get("language", ""))
            + ",'messages'=>[" + messages + "]];\n")


# ---------------------------------------------------------------- judging a translation

PLACEHOLDER = re.compile(r"%(?:(\d+)\$)?[-+ 0#']*\d*(?:\.\d+)?([bcdeEfFgGosuxX%])")


def placeholders(text):
    found, position = set(), 0
    for m in PLACEHOLDER.finditer(text):
        if m.group(2) == "%":
            continue
        position += 1
        found.add((int(m.group(1)) if m.group(1) else position, m.group(2).replace("i", "d")))
    return found


def judge(name, po_entries, code_entries):
    problems = []
    header, headers = headers_of(po_entries)
    if header is None:
        problems.append("%s: no header entry" % name)
    m = re.match(r"\s*nplurals\s*=\s*(\d+)\s*;", headers.get("plural-forms", ""))
    nplurals = int(m.group(1)) if m else None
    if not nplurals:
        problems.append("%s: the header gives no Plural-Forms with nplurals" % name)
    if not headers.get("language"):
        problems.append("%s: the header gives no Language" % name)
    have = {}
    for e in po_entries:
        if e["msgid"] == "" and e["msgctxt"] is None:
            continue
        have[(e["msgctxt"], e["msgid"], e["msgid_plural"])] = e
    for key in code_entries:
        e = have.get(key)
        label = repr(key[1][:70])
        if e is None:
            problems.append("%s: no translation of %s" % (name, label)); continue
        if "fuzzy" in e["flags"]:
            problems.append("%s: the translation of %s is marked fuzzy" % (name, label))
        forms = e["msgstr"]
        wanted = nplurals if key[2] is not None else 1
        if len(forms) != wanted or not all(forms):
            problems.append("%s: %s has %d of %d forms translated" % (name, label, sum(1 for f in forms if f), wanted)); continue
        allowed = [placeholders(key[1])] + ([placeholders(key[2])] if key[2] is not None else [])
        for index, form in enumerate(forms):
            if placeholders(form) not in allowed:
                problems.append("%s: the placeholders of %s are not the original's in form %d" % (name, label, index))
    for key in have:
        if key not in code_entries:
            problems.append("%s: an entry for a string the code no longer has: %r" % (name, key[1][:70]))
    return problems


# ---------------------------------------------------------------- the run

def main(argv):
    check = "--check" in argv
    rest = [a for a in argv if a != "--check"]
    plugin = os.path.abspath(rest[0]) if rest else DEFAULT_PLUGIN
    languages = os.path.join(plugin, "languages")
    try:
        code = extract(plugin)
    except Fault as e:
        print("FAIL  " + str(e)); return 1

    wanted = {os.path.join(languages, DOMAIN + ".pot"): make_pot(plugin, code).encode("utf-8")}
    problems = []
    pos = sorted(f for f in os.listdir(languages) if f.startswith(DOMAIN + "-") and f.endswith(".po")) if os.path.isdir(languages) else []
    summary = []
    for po in pos:
        try:
            entries = parse_po(os.path.join(languages, po))
        except Fault as e:
            problems.append(str(e)); continue
        problems += judge(po, entries, code)
        _, headers = headers_of(entries)
        pairs = compiled_pairs(entries)
        stem = os.path.join(languages, po[:-3])
        wanted[stem + ".mo"] = make_mo(pairs)
        wanted[stem + ".l10n.php"] = make_l10n_php(pairs, headers).encode("utf-8")
        done = set(k for k, _ in pairs)
        def compiled_key(key):
            k = key[1] if key[2] is None else key[1] + "\0" + key[2]
            return k if key[0] is None else key[0] + "\4" + k
        translated = sum(1 for key in code if compiled_key(key) in done)
        summary.append("%s: %d of %d translated" % (headers.get("language", po), translated, len(code)))

    stale = []
    for path, data in wanted.items():
        old = open(path, "rb").read() if os.path.exists(path) else None
        if old != data:
            stale.append(path)
            if not check:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "wb") as fh:
                    fh.write(data)

    print("%d translatable strings in the code; %s" % (len(code), "; ".join(summary) or "no .po"))
    for p in problems:
        print("FAIL  " + p)
    if check:
        for path in stale:
            print("FAIL  out of date: %s (run build-translations.py)" % os.path.relpath(path, plugin))
        if not problems and not stale:
            print("ok    the template and the compiled files are what the sources make of them, and every language translates every string")
        return 1 if problems or stale else 0
    for path in stale:
        print("wrote " + os.path.relpath(path, plugin))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
