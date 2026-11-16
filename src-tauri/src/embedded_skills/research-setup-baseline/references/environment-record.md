# Environment evidence

Use `setup/environment.json` for the current setup and keep check outputs under `setup/`. This is a project evidence file read by the agent, not a new runner receipt or scheduler. Preserve previous evidence when replacing a setup. Copy the environment record into each attempt before launching so later changes cannot rewrite its provenance.

Record only observed values. Use `null` for unmeasured or unavailable information. An example structure follows; adapt dependency and compute fields to the actual language and backend.

```json
{
  "version": 1,
  "status": "ready",
  "checkedAt": "ISO-8601 timestamp",
  "runtime": {"executable": "/absolute/project/.venv/bin/python", "version": "observed version"},
  "dependencies": {"manifest": "requirements.txt", "lock": "requirements.lock", "lockSha256": "observed hash"},
  "compute": {"backend": "local", "device": "cpu", "architecture": "observed", "availableMemoryBytes": null, "availableDiskBytes": null},
  "inputs": [{"path": "inputs/reference.json", "sha256": "observed hash"}],
  "evaluator": {"path": "evaluate.py", "sha256": "observed hash"},
  "checks": [{"attemptId": "S-001", "command": ["/absolute/project/.venv/bin/python", "setup/smoke.py"], "exitCode": 0, "evidence": "setup/smoke-output.json"}],
  "baseline": {"attemptId": "B-001", "evaluationId": "comparison-setup-v1", "metric": "objective", "direction": "lower", "value": 1.0, "unit": "observed unit", "receipt": "experiments/B-001/run-status.json"},
  "blockers": []
}
```

`ready` requires successful end-to-end environment smoke checks through the campaign worker. Baseline validity is separate. Use `baseline: null` until a baseline attempt has independently passed validation. Candidates require that validated baseline in addition to ready setup. Use `blocked` or `checking` while required checks are incomplete, explain the exact failed requirement in `blockers`, and omit unobserved baseline values. If no scalar metric applies, record the reference check and its evidence in the baseline field.

The candidate note identifies the baseline attempt, setup snapshot and changes since the checks. Use the literal verified interpreter path in the campaign argv command, without resolving virtualenv symlinks. The coordinator checks it against the setup runtime and linked passed setup attempt. Baseline attempts require ready smoke evidence but no earlier baseline. Setup attempts can run while status is checking and must retain control outputs and readback evidence. Enqueue through the campaign interface; do not invoke the legacy runner for a new investigation.

Keep credentials out of the environment record and command evidence. Record service names and required access without copying secret values.
