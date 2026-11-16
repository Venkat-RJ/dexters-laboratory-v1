"""Run one planned experiment and publish a live receipt in its evidence folder."""

import argparse
import json
import math
import os
from collections import deque
from pathlib import Path
import re
import signal
import subprocess
import time


def write_receipt(folder, receipt):
    pending = folder / ".run-status.tmp"
    pending.write_text(json.dumps(receipt, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    pending.replace(folder / "run-status.json")


def comparable_metric(metric):
    if not isinstance(metric, dict):
        return None
    name = metric.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    value = metric.get("value")
    baseline = metric.get("baseline")
    try:
        if any(type(number) not in (int, float) or not math.isfinite(number) for number in (value, baseline)):
            return None
    except OverflowError:
        return None
    result = {"name": name.strip()[:100], "value": value, "baseline": baseline}
    if isinstance(metric.get("unit"), str):
        result["unit"] = metric["unit"].strip()[:40]
    return result


class Progress:
    def __init__(self):
        self.offset = 0
        self.active_case = None
        self.completed_cases = 0
        self.results = deque(maxlen=25)
        self.metric = None

    def read(self, events):
        with events.open("rb") as stream:
            stream.seek(self.offset)
            while line := stream.readline():
                if not line.endswith(b"\n"):
                    break
                self.offset = stream.tell()
                try:
                    event = json.loads(line)
                except (ValueError, UnicodeError):
                    continue
                if not isinstance(event, dict):
                    continue
                if event.get("type") == "summary":
                    metric = comparable_metric(event.get("metric"))
                    if metric is not None:
                        self.metric = metric
                    continue
                if not isinstance(event.get("case"), str):
                    continue
                if event.get("type") == "started":
                    self.active_case = event["case"][:300]
                elif event.get("type") == "result" and isinstance(event.get("result"), str):
                    row = {"case": event["case"][:300], "result": event["result"][:600]}
                    if isinstance(event.get("evidence"), str):
                        row["evidence"] = event["evidence"][:1000]
                    self.results.append(row)
                    self.completed_cases += 1
                    if self.active_case == row["case"]:
                        self.active_case = None


def interrupt_group(process, sig):
    try:
        os.killpg(process.pid, sig)
    except ProcessLookupError:
        pass


def run(folder, limit, command, git_commit=None):
    # A retry receives a new ID so it cannot overwrite an earlier attempt.
    (folder / "run.lock").touch(exist_ok=False)
    events = folder / "cases.jsonl"
    events.touch(exist_ok=False)
    start = time.monotonic()
    progress = Progress()
    interrupted = False
    process = None
    status = "running"

    def stop(_signal, _frame):
        nonlocal interrupted
        interrupted = True

    def publish():
        progress.read(events)
        write_receipt(folder, {
            "status": status,
            "elapsedSeconds": time.monotonic() - start,
            "limitSeconds": limit,
            "updatedAt": time.time(),
            "activeCase": progress.active_case,
            "completedCases": progress.completed_cases,
            "results": list(progress.results),
            "metric": progress.metric,
            "exitCode": None if process is None else process.returncode,
            "command": command,
            "gitCommit": git_commit,
        })

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    env = {**os.environ, "DEXTER_CASE_EVENTS": str(events)}
    with (folder / "stdout.txt").open("x") as output, (folder / "stderr.txt").open("x") as errors:
        publish()
        try:
            process = subprocess.Popen(command, start_new_session=True, env=env, stdout=output, stderr=errors)
            while process.poll() is None:
                remaining = start + limit - time.monotonic()
                if interrupted or remaining <= 0:
                    status = "interrupted" if interrupted else "timed_out"
                    # The wall limit covers the whole process group.
                    interrupt_group(process, signal.SIGKILL)
                    process.wait()
                    break
                publish()
                time.sleep(min(0.25, remaining))
            if status == "running":
                status = "completed" if process.returncode == 0 else "failed"
        except OSError as error:
            status = "failed"
            errors.write(f"{error}\n")
        finally:
            if process is not None:
                interrupt_group(process, signal.SIGKILL)
                process.wait()
            if status == "running":
                status = "failed"
            publish()
    if status == "interrupted":
        return 130
    if status == "timed_out":
        return 124
    return 0 if status == "completed" else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("experiment_id")
    parser.add_argument("seconds", type=float)
    parser.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", args.experiment_id):
        parser.error("Invalid experiment ID.")
    if not math.isfinite(args.seconds) or args.seconds <= 0:
        parser.error("Set a positive wall time limit.")
    command = args.command[1:] if args.command[:1] == ["--"] else args.command
    if not command:
        parser.error("Supply a command after the time limit.")
    project = Path.cwd().resolve()
    folder = project / "experiments" / args.experiment_id
    if folder.resolve() != folder or not folder.is_dir():
        parser.error("Create the experiment directory inside this project and freeze the plan first.")
    journal = json.loads((project / "experiments.json").read_text(encoding="utf-8"))
    if journal["version"] != 1 or not any(row["id"] == args.experiment_id for row in journal["experiments"]):
        parser.error("Record the experiment in experiments.json before launching it.")
    git_commit = os.environ.get("DEXTER_CODE_COMMIT")
    if git_commit:
        if not re.fullmatch(r"(?:[a-f0-9]{40}|[a-f0-9]{64})", git_commit):
            parser.error("Set DEXTER_CODE_COMMIT to the full Git commit ID.")
        try:
            head = subprocess.run(
                ["git", "rev-parse", "--verify", "HEAD"], cwd=project,
                check=True, capture_output=True, text=True, timeout=5,
            ).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            parser.error("Could not verify the experiment Git commit.")
        if git_commit != head:
            parser.error("DEXTER_CODE_COMMIT must match the checked-out commit.")
    return run(folder, args.seconds, command, git_commit)


if __name__ == "__main__":
    raise SystemExit(main())
