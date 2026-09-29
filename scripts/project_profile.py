#!/usr/bin/env python3
"""project_profile.py - read `.eng/project.yaml` without third-party dependencies.

The control plane has to work in repositories that are not Node, Go or Python: a PHP
plugin, a shell tool, a documentation repository. `detect_cmds()` guessed from file
names and guessed wrong for those (a `tests/` directory looked like pytest). A project
can now declare its own commands once, in `.eng/project.yaml`, and every gate uses them.

Usage:
    python3 scripts/project_profile.py --check
    python3 scripts/project_profile.py --json
    python3 scripts/project_profile.py --shell        # eval-able, quoted
    python3 scripts/project_profile.py --gates        # name|command|required per line
    python3 scripts/project_profile.py --get network.allowed_hosts

Exit codes: 0 ok, 3 no profile (NOT APPLICABLE), 4 malformed profile, 5 parse error.

The parser deliberately implements a small, documented YAML subset:

    key: value
    key:
      nested: value
      list:
        - item
        - name: item with fields
          other: value

Comments start with `#`. Quoted scalars, booleans and numbers are handled. Anything
outside the subset is rejected loudly (exit 5) rather than silently ignored - a profile
that is half-read is worse than no profile.
"""

from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

DEFAULT_PROFILE = ".eng/project.yaml"


class ParseError(Exception):
    """The profile uses something outside the supported subset."""


def strip_comment(line: str) -> str:
    out = []
    quote = None

    for index, char in enumerate(line):
        if quote:
            if char == quote and line[index - 1] != "\\":
                quote = None
            out.append(char)
            continue

        if char in "\"'":
            quote = char
            out.append(char)
            continue

        if char == "#" and (index == 0 or line[index - 1] in " \t"):
            break

        out.append(char)

    return "".join(out)


def scalar(text: str):
    text = text.strip()

    if text.startswith("[") or text.startswith("{"):
        raise ParseError("flow style (`[a, b]`, `{a: b}`) is outside the supported subset")

    if text == "" or text == "~" or text.lower() == "null":
        return None
    if text.lower() in ("true", "yes"):
        return True
    if text.lower() in ("false", "no"):
        return False
    if len(text) >= 2 and text[0] == text[-1] and text[0] in "\"'":
        return text[1:-1]
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if re.fullmatch(r"-?\d*\.\d+", text):
        return float(text)

    return text


def parse(text: str):
    """Parse the documented subset into dicts, lists and scalars."""
    root: dict = {}
    # Each stack entry: (indent, container, pending_key)
    stack: list[tuple[int, object, str | None]] = [(-1, root, None)]
    pending: list[tuple[int, dict, str]] = []

    for number, raw in enumerate(text.splitlines(), 1):
        line = strip_comment(raw.rstrip())

        if not line.strip():
            continue

        leading = line[: len(line) - len(line.lstrip(" \t"))]

        if "\t" in leading:
            raise ParseError(f"line {number}: tabs are not allowed for indentation")

        indent = len(leading)
        body = line.strip()

        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()

        container = stack[-1][1]

        if body.startswith("- "):
            item = body[2:].strip()

            if not isinstance(container, list):
                raise ParseError(f"line {number}: list item outside a list")

            if ":" in item and not item.startswith(("'", '"')) and re.match(r"[A-Za-z_][\w-]*\s*:", item):
                key, _, value = item.partition(":")
                entry: dict = {}
                key = key.strip()

                if value.strip():
                    entry[key] = scalar(value)
                else:
                    entry[key] = None
                    pending.append((indent + 2, entry, key))

                container.append(entry)
                stack.append((indent, entry, key))
            else:
                container.append(scalar(item))
            continue

        if ":" not in body:
            raise ParseError(f"line {number}: expected `key: value`")

        key, _, value = body.partition(":")
        key = key.strip()

        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]*", key):
            raise ParseError(f"line {number}: unsupported key `{key}`")

        if not isinstance(container, dict):
            raise ParseError(f"line {number}: mapping inside a list item without a key")

        if value.strip():
            container[key] = scalar(value)
            continue

        # Empty value: decide between a nested map and a list by looking ahead.
        following = None

        for later in text.splitlines()[number:]:
            if not later.strip() or strip_comment(later).strip().startswith("#"):
                continue
            following = later
            break

        next_is_list = following is not None and following.strip().startswith("- ")
        node: object = [] if next_is_list else {}
        container[key] = node
        stack.append((indent, node, key))

    for _, entry, key in pending:
        if entry.get(key) is None:
            entry[key] = entry.get(key) or {}

    return root


def coerce(value) -> str:
    if value is None:
        return ""
    if value is True:
        return "true"
    if value is False:
        return "false"

    return str(value)


def shell_quote(text: str) -> str:
    return "'" + text.replace("'", "'\\''") + "'"


def lookup(data: dict, path: str):
    node = data

    for part in path.split("."):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]

    return node


def gates(data: dict) -> list[dict]:
    extras = lookup(data, "gates.extras") or []

    if not isinstance(extras, list):
        return []

    out = []

    for item in extras:
        if isinstance(item, str):
            out.append({"name": item, "command": item, "required": True})
            continue

        if not isinstance(item, dict) or not item.get("name") or not item.get("command"):
            raise ParseError("gates.extras entries need `name` and `command`")

        required = item.get("required", True)
        out.append({"name": str(item["name"]), "command": str(item["command"]), "required": bool(required)})

    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default=DEFAULT_PROFILE)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--shell", action="store_true")
    parser.add_argument("--gates", action="store_true")
    parser.add_argument("--get", default="")
    args = parser.parse_args()

    path = pathlib.Path(args.file)

    if not path.exists():
        if not args.check:
            print(f"NOT APPLICABLE: no {args.file}", file=sys.stderr)
        return 3

    try:
        data = parse(path.read_text(encoding="utf-8"))
    except ParseError as error:
        print(f"ERROR: {args.file}: {error}", file=sys.stderr)
        return 5

    if not isinstance(data, dict) or not data:
        print(f"ERROR: {args.file}: empty profile", file=sys.stderr)
        return 4

    if args.check:
        print(f"OK: {path} parsed, project={lookup(data, 'name') or 'unnamed'}, gates={len(gates(data))}")
        return 0

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0

    if args.gates:
        for gate in gates(data):
            print(f"{gate['name']}|{gate['command']}|{'true' if gate['required'] else 'false'}")
        return 0

    if args.get:
        value = lookup(data, args.get)

        if isinstance(value, list):
            print("\n".join(coerce(item) for item in value))
        else:
            print(coerce(value))
        return 0

    # --shell: the contract lib_run.sh evals.
    print(f"PROJECT_NAME={shell_quote(coerce(lookup(data, 'name')))}")
    print(f"PROJECT_KIND={shell_quote(coerce(lookup(data, 'kind')))}")
    print(f"BUILD_CMD={shell_quote(coerce(lookup(data, 'commands.build')))}")
    print(f"TEST_CMD={shell_quote(coerce(lookup(data, 'commands.test')))}")
    print(f"LINT_CMD={shell_quote(coerce(lookup(data, 'commands.lint')))}")
    print(f"SECRET_ALLOW={shell_quote(coerce(lookup(data, 'secret_scan.allow')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
