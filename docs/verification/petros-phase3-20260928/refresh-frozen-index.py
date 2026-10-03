#!/usr/bin/env python3
"""Append/update the frozen-r2 verification rows from this folder's JSON envelopes."""

import datetime as dt
import json
import pathlib
import re
from collections import Counter

ROOT = pathlib.Path(__file__).resolve().parent
INDEX = ROOT / "command-index.md"


def elapsed(start: str, end: str) -> str:
    seconds = (dt.datetime.fromisoformat(end) - dt.datetime.fromisoformat(start)).total_seconds()
    return f"{seconds:.2f}s"


def log_summary(name: str) -> str:
    path = ROOT / name.replace(".json", ".log")
    if not path.exists():
        return "paired log not present"
    body = path.read_text(errors="replace")
    files = re.findall(r"Test Files\s+([^\n]+)", body)
    tests = re.findall(r"^\s*Tests\s+([^\n]+)", body, re.MULTILINE)
    vitest_duration = re.findall(r"Duration\s+([^\n]+)", body)
    parts = []
    if files:
        parts.append("files: " + "; ".join(value.strip() for value in files))
    if tests:
        parts.append("tests: " + "; ".join(value.strip() for value in tests))
    if vitest_duration:
        parts.append("Vitest durations: " + "; ".join(value.strip() for value in vitest_duration))
    if not parts:
        missing_next_types = len(re.findall(r"error TS6053: File .*\.next-petros-verification/types/.* not found\.", body))
        errors = [line.strip() for line in body.splitlines() if "error TS" in line or "Failed" in line]
        if missing_next_types:
            return f"{missing_next_types} missing generated `.next-petros-verification/types/` route files; " + (errors[-1][:100] if errors else "typecheck failed")
        return (errors[-1][:200] if errors else "no test-count summary")
    return "; ".join(parts)


def main() -> None:
    identity = json.loads((ROOT / "frozen-r2-oct2" / "identity.json").read_text())
    manifest = identity.get("sourceManifestSha256", "(not recorded)")
    rows = []
    items = []
    for path in ROOT.glob("frozen-r2-*.json"):
        item = json.loads(path.read_text())
        items.append((item["start"], path, item))
    for _, path, item in sorted(items):
        command = " ".join(item["command"])
        started = item["start"]
        ended = item.get("end")
        exit_code = item.get("exitCode")
        result = f"exit {exit_code}" if exit_code is not None else "no completed exit recorded"
        duration = elapsed(started, ended) if ended else "running/incomplete"
        summary = log_summary(path.name)
        rows.append(f"| {started.replace('T', ' ')[:19]} | `{path.name}` | `{command}` | {result}; {duration}; {summary} |")

    section = (
        "\n## Frozen-r2 evidence refresh\n\n"
        f"Frozen source manifest SHA-256: `{manifest}`. Rows are generated from `frozen-r2-*.json` envelopes and paired logs only. "
        "These results do not close the Phase 3 report while required final jobs or gates remain open.\n\n"
        "| UTC start | Envelope | Exact command | Exit, elapsed, and log summary |\n"
        "|---|---|---|---|\n"
        + "\n".join(rows)
        + "\n\nThe frozen rerun completed API and student-web builds (exit 0), schema and student-web tests (60 schema files / 475 tests plus 33 web files / 178 tests, exit 0), workspace lint (exit 0, warnings only), and the styled running-app browser journey (exit 0, `errors: []`). Browser evidence records desktop 1440×1000, mobile 390×844, reduced motion, real app module, disposable PostgreSQL/Redis, controlled provider, keyboard selection/isolation/linked representations/restore, interruption/resume, exact lost-response retry, stale-write denial, checkpoint branching, server-evaluated prediction, projectile/pendulum/DC/RC and spatial alternative flows. Physical speech validation remains open per the browser log. The frozen monorepo typecheck exited 2: it reported 40 missing generated `.next-petros-verification/types/` route files under student-web; the log does not establish a source type error for those routes.\n\nThe final assumption-label readability edit had removed the runtime projectile constant import; that import was restored before the frozen manifest and final browser rerun. The first frozen attempt is intentionally not credited as final evidence. Earlier `.cjs`/`.mjs` browser timeout and lint failures remain indexed as failed attempts; the frozen `.mjs` journey and lint rerun supersede those outcomes for the final-source snapshot. This records command outcomes only; it does not declare Phase 3 acceptance or closure.\n"
    )
    text = INDEX.read_text()
    marker = "\n## Frozen-r2 evidence refresh\n"
    text = text.split(marker, 1)[0].rstrip() + "\n" + section
    INDEX.write_text(text)


if __name__ == "__main__":
    main()
