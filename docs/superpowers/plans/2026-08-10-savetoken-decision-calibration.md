# SaveToken Decision Calibration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan as one bounded task. Do not split it into additional acceptance stages and do not expand the provider surface.

**Goal:** Decide, with a diverse but bounded execution sample, whether SaveToken should keep one DeepSeek effort default or use a narrowly scoped task-class recommendation without reducing critical acceptance quality.

**Architecture:** Freeze the existing SaveToken → OpenCodex proxy → DeepSeek wiring and the Sol/Terra/execution/GLM hierarchy. Run six synthetic low-risk execution tasks twice through the same DeepSeek route: once at the current default effort and once at `low`. Use explicit acceptance criteria and measured usage; use the existing Sol controls only as historical context, not as a new adapter or new request budget. Produce one evidence-backed decision artifact; do not change runtime policy in this calibration.

**Tech Stack:** Existing Bun/TypeScript SaveToken runtime, OpenCodex 2.11.0 at `http://127.0.0.1:10100`, Responses API, JSON fixtures, SHA-256 evidence, and existing privacy/package gates.

## Global Constraints

- Sol remains reserved for highest-risk decisions and controls; Terra remains medium complexity; Luna and DeepSeek remain peer execution routes; GLM is not used.
- Do not silently downgrade any high-risk or medium-risk task.
- Do not read, print, copy, or persist API keys, OAuth state, cookies, browser state, private paths, or real user data.
- Do not add providers, adapters, auth modes, fallbacks, GUI, service, catalog injection, or parity surfaces.
- Do not modify the current runtime routing policy or global default effort during this calibration.
- Before using a new `reasoning.effort` override, independently confirm Codex has restarted after the catalog change. If restart/readback cannot be confirmed, mark the low-effort comparison `UNKNOWN` and finish the report without guessing.
- Maximum real requests: twelve DeepSeek requests (six default, six low). No additional Sol, Terra, Luna, or GLM requests.
- One request per task/effort combination; no retries or automatic fallback.
- A model catalog entry, response shape, or process health check is not proof of quality, savings, or provider quota behavior.

---

### Task 1: Freeze the baseline and create the six-task fixture set

**Files:**
- Read: `AGENTS.md`
- Read: `SAVETOKEN_SPEC.md`
- Read: `docs/superpowers/evidence/savetoken-phase-d3-execution-wiring-2026-08-10.md`
- Read: `docs/superpowers/evidence/savetoken-calibration-report-2026-08-10.md`
- Read: `docs/superpowers/evidence/savetoken-calibration-2-effort-2026-08-10.md`
- Create: `docs/superpowers/evidence/savetoken-decision-calibration-fixtures-2026-08-10.json`

**Interfaces:**
- Consumes: the frozen DeepSeek adapter and prior Calibration-1/2 evidence.
- Produces: six deterministic execution tasks and exact acceptance predicates.

- [ ] Verify OpenCodex `/healthz`, `/readyz`, and `/v1/models` before any model request.
- [ ] Confirm `deepseek/deepseek-v4-flash` is visible and the running proxy is ready.
- [ ] Create exactly these six synthetic task classes:

```json
[
  {
    "id": "X1-structured-extraction",
    "class": "extraction",
    "prompt": "Extract these four records and return JSON only with fields name, date, status, amount. Preserve every value exactly: Alice | 2026-08-10 | paid | 19.95; Bob | 2026-08-11 | pending | 7.50; Chen | 2026-08-12 | paid | 0.00; Dina | 2026-08-13 | failed | 12.40.",
    "expected": [{"name":"Alice","date":"2026-08-10","status":"paid","amount":"19.95"},{"name":"Bob","date":"2026-08-11","status":"pending","amount":"7.50"},{"name":"Chen","date":"2026-08-12","status":"paid","amount":"0.00"},{"name":"Dina","date":"2026-08-13","status":"failed","amount":"12.40"}],
    "acceptance": ["valid JSON", "exactly four records", "deep equality with expected", "no prose"]
  },
  {
    "id": "X2-schema-tool-call",
    "class": "tool_call",
    "prompt": "Use the get_weather fixture tool for Beijing. Emit one function call and do not execute any real tool.",
    "tool": {"type":"function","name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"],"additionalProperties":false}},
    "expected": {"name":"get_weather","arguments":{"city":"Beijing"}},
    "acceptance": ["one function_call", "name get_weather", "deep equality of arguments", "no prose before call"]
  },
  {
    "id": "X3-classification",
    "class": "classification",
    "prompt": "Classify each record as keep, review, or reject and return JSON only. Rule: paid and amount >= 10 is keep; pending is review; failed is reject. Records: A paid 12; B pending 4; C failed 20; D paid 9; E pending 15; F paid 10.",
    "expected": [{"id":"A","label":"keep"},{"id":"B","label":"review"},{"id":"C","label":"reject"},{"id":"D","label":"review"},{"id":"E","label":"review"},{"id":"F","label":"keep"}],
    "acceptance": ["six outputs", "labels in allowed set", "deep equality with expected", "valid JSON"]
  },
  {
    "id": "X4-transformation",
    "class": "transformation",
    "prompt": "Transform this ordered table into JSON objects with fields id, owner, active, note. Preserve order and nulls exactly: 1|Alice|yes|ok; 2|Bob|no|NULL; 3|Chen|yes|queued; 4|Dina|no|NULL; 5|Eli|yes|done.",
    "expected": [{"id":1,"owner":"Alice","active":true,"note":"ok"},{"id":2,"owner":"Bob","active":false,"note":null},{"id":3,"owner":"Chen","active":true,"note":"queued"},{"id":4,"owner":"Dina","active":false,"note":null},{"id":5,"owner":"Eli","active":true,"note":"done"}],
    "acceptance": ["five rows", "deep equality with expected", "nulls preserved", "ordering preserved"]
  },
  {
    "id": "X5-bounded-code-review",
    "class": "code_review",
    "prompt": "Review this synthetic TypeScript function and return exactly three actionable defects with line references; do not redesign it:\n1 function first(xs: string[]) {\n2   if (xs.length = 0) return undefined;\n3   const value = xs[0].trim();\n4   return value.toUpperCase;\n5 }",
    "expected": [{"line":2,"defect":"assignment used instead of comparison; also mutates xs"},{"line":3,"defect":"xs[0] can be undefined for an empty input"},{"line":4,"defect":"returns the toUpperCase function instead of invoking it"}],
    "acceptance": ["exactly three defects", "line references 2, 3, 4", "actionable fixes", "no unrelated redesign"]
  },
  {
    "id": "X6-bounded-test-design",
    "class": "test_design",
    "prompt": "Design a concise unit-test matrix for parseDate(value: string): Date|null. Include exactly one valid case (2026-08-10), one boundary case (2026-02-28), and one invalid case (2026-02-30). Return a table with input, expected result, and reason.",
    "expected": [{"input":"2026-08-10","expected":"Date","reason":"valid date"},{"input":"2026-02-28","expected":"Date","reason":"last valid February day in 2026"},{"input":"2026-02-30","expected":"null","reason":"invalid calendar date"}],
    "acceptance": ["three rows", "expected values match", "reasons are correct", "no implementation changes"]
  }
]
```

- [ ] Record this exact fixture content in the JSON file.
- [ ] Include the same prompt, tools, and schema for both effort runs of each task.
- [ ] Hash the fixture file and do not modify it after the first request.

Expected result: one immutable six-task fixture file with four execution-critical predicates per task.

### Task 2: Verify the effective effort controls

**Files:**
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-fixtures-2026-08-10.json`
- Create later: `docs/superpowers/evidence/savetoken-decision-calibration-run-2026-08-10.json`

**Interfaces:**
- Consumes: fixture hash and current OpenCodex model/effort readback.
- Produces: an explicit record of the default effort and the low override.

- [ ] Record the actual default effort returned by the current DeepSeek route; if absent, write `UNKNOWN`.
- [ ] Confirm Codex restart/readback before sending any `low` override.
- [ ] Use the provider-supported exact effort spelling already confirmed in the active catalog; do not invent a parameter.
- [ ] If the default or low effort cannot be read from the request/response evidence, continue only with status `UNKNOWN` and do not make a policy recommendation.

Expected result: each run records the requested effort and the adapter/provider response effort, or explicitly records UNKNOWN.

### Task 3: Run the twelve-request paired sample

**Files:**
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-fixtures-2026-08-10.json`
- Modify: `docs/superpowers/evidence/savetoken-decision-calibration-run-2026-08-10.json`

**Interfaces:**
- Consumes: six fixtures, frozen DeepSeek adapter, default/low effort controls.
- Produces: twelve redacted run records and response hashes.

- [ ] For each X1–X6, send one request through SaveToken at the current default effort.
- [ ] For each X1–X6, send one identical request through SaveToken with `reasoning.effort=low`.
- [ ] Use fresh request context for every run; do not reuse hidden conversation state.
- [ ] Record HTTP status, requested/response model, requested/response effort, status, usage fields, response hash, and all acceptance booleans.
- [ ] Do not record request headers or credentials.
- [ ] If a model mismatch, safety error, missing usage, invalid output, or timeout occurs, record the failure once and continue only with independent remaining fixture pairs; do not retry the failed pair.

Expected result: at most twelve real requests, all routed through the existing DeepSeek SaveToken adapter, with no other provider calls.

### Task 4: Compute the decision without changing policy

**Files:**
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-run-2026-08-10.json`
- Create: `docs/superpowers/evidence/savetoken-decision-calibration-report-2026-08-10.md`
- Optional create: `docs/superpowers/evidence/savetoken-effort-policy-recommendation-2026-08-10.json`

**Interfaces:**
- Consumes: paired acceptance and usage records.
- Produces: one decision-grade recommendation; no runtime modification.

- [ ] For each task, mark quality as pass only when all four critical predicates pass.
- [ ] Compute per-task delta and median delta: `low_total - default_total`.
- [ ] Compute class-level results only when at least two tasks exist in that class; otherwise mark class generalization UNKNOWN.
- [ ] Recommend low effort for a class only if every low-effort task in that class passes all critical predicates and the class median total-token delta is at most `-10%`.
- [ ] Recommend default effort for a class if low effort fails any critical predicate, increases median usage, or has insufficient evidence.
- [ ] Never recommend a global default change from this calibration alone.
- [ ] Treat prior Sol controls as context only; do not merge their usage into the paired DeepSeek effort comparison.
- [ ] Do not create the optional policy file unless at least one class meets the explicit recommendation gate; if created, label it `recommendation_only`.

Decision outcomes:

- `PASS`: all six default/low pairs have confirmed identities and usage, all quality predicates pass, and at least one class meets the low-effort gate without any class regression.
- `PARTIAL`: some pairs are valid but effort readback, quality, or class evidence is incomplete; keep the current default.
- `UNKNOWN`: identity, effort, or usage cannot be confirmed for the comparison.
- `BLOCKED`: privacy, authorization, or route safety prevents the bounded run.

### Task 5: Run final gates and publish the bounded handoff

**Files:**
- Read: `docs/superpowers/evidence/savetoken-decision-calibration-report-2026-08-10.md`
- Verify: `savetoken-runtime/`

**Interfaces:**
- Consumes: calibration artifacts.
- Produces: reproducible verification and final report.

- [ ] Run `bun run typecheck`.
- [ ] Run `bun test`.
- [ ] Run `bun run lint`.
- [ ] Run `bun run privacy:scan` over source and calibration artifacts.
- [ ] Run `bun run package:check`.
- [ ] Hash all new artifacts.
- [ ] State explicitly that no source routing policy changed, no provider was added, and no broad quality or savings claim is made.
- [ ] Return one final report with `FACT`, `INFERENCE`, `UNKNOWN`, request count, token deltas, policy recommendation, hashes, and next action.

## Non-goals

- No new provider, adapter, auth mode, fallback chain, service, GUI, catalog injection, or Sol OAuth integration.
- No global default effort change during this task.
- No automatic deployment of a class-specific recommendation.
- No claim that six task classes generalize to all projects or prove replacement of ChatGPT Pro.

## Final acceptance

The task is complete only when the paired sample, decision report, privacy scan, package check, and hashes are delivered. The final policy remains the frozen hierarchy unless the evidence artifact explicitly supports a future, separately approved policy change.
