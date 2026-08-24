# SaveToken Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to execute this plan task-by-task. Do not expand the scope beyond the calibration gate.

**Goal:** Calibrate the frozen SaveToken routing policy against a small, non-sensitive task set and determine whether DeepSeek execution can reduce measured token usage without failing critical acceptance criteria.

**Architecture:** Keep the current SaveToken runtime and OpenCodex configuration unchanged beyond the already-delivered `proxy` adapter. Use a fixed evidence fixture set, route execution tasks through `savetoken-runtime` → `createOpenCodexProxyAdapter` for DeepSeek, and use the same OpenCodex Responses surface for a separately labelled Sol control. Evaluate Terra/Sol routing rules offline on medium/high-risk probes. Do not add another Provider adapter, auth mode, GUI, service, fallback chain, or parity surface in this calibration.

**Tech Stack:** Existing OpenCodex 2.11.0 proxy on `http://127.0.0.1:10100`, OpenAI Responses API, JSON evidence files, Markdown report, PowerShell readback, existing SaveToken route contracts.

## Global Constraints

- Sol handles only the highest-risk/control work; Terra handles medium-complexity classification; Luna and DeepSeek are peer execution routes; GLM is not used in this calibration.
- Do not silently downgrade a required Sol or Terra route.
- Do not read, print, copy, or persist API keys, OAuth state, cookies, browser state, or real user data.
- Use only synthetic fixtures stored in the evidence package; do not modify project source files or production configuration.
- Use exact model IDs only after `/v1/models` visibility and response model identity are read back.
- A catalog entry, configured route, successful process health check, or response shape is not proof of provider quality or quota savings.
- No commit, push, deployment, migration, service installation, or upstream modification.
- If a model, usage field, route decision, or acceptance result is UNKNOWN, preserve UNKNOWN and stop the affected comparison.
- Maximum real requests for the base calibration: four (two DeepSeek execution runs and two Sol control runs). Any additional model requires a separate authorization.

---

### Task 1: Freeze scope and preflight the runtime

**Files:**
- Read: `AGENTS.md`
- Read: `SAVETOKEN_SPEC.md`
- Read: `docs/superpowers/evidence/savetoken-phase-d1-provider-manifest.json`
- Read: `docs/superpowers/evidence/savetoken-phase-d2-deepseek-vslice-2026-08-10.md`
- Create later: `docs/superpowers/evidence/savetoken-calibration-fixtures-2026-08-10.json`

**Interfaces:**
- Consumes: verified model IDs and known D-2 behavior.
- Produces: a frozen fixture set and a run budget.

- [ ] Verify `GET /healthz` and `GET /readyz` on `http://127.0.0.1:10100`.
- [ ] Verify `/v1/models` contains `deepseek/deepseek-v4-flash` and `openai/gpt-5.6-sol`.
- [ ] Record status codes and model IDs only; do not record headers containing credentials.
- [ ] If either model is absent or readiness is not `ready`, stop with `UNKNOWN`; do not substitute GLM.
- [ ] Confirm that no source file under `savetoken-runtime/src/` changes during calibration.

Expected result: both model IDs are visible and the proxy is ready; provider invocation and quota remain unproven until the task runs.

### Task 2: Create the fixed calibration fixtures

**Files:**
- Create: `docs/superpowers/evidence/savetoken-calibration-fixtures-2026-08-10.json`

**Interfaces:**
- Consumes: the frozen SaveToken tier rules.
- Produces: six deterministic probes with explicit acceptance criteria.

- [ ] Add exactly these probes, with no project secrets or user data:

```json
{
  "execution": [
    {
      "id": "E1-structured-extraction",
      "prompt": "Extract the three records from this text and return JSON only with fields name, date, status: Alice | 2026-08-10 | paid; Bob | 2026-08-11 | pending; Chen | 2026-08-12 | paid.",
      "acceptance": ["valid JSON", "exactly three records", "all six field values preserved", "no prose"]
    },
    {
      "id": "E2-tool-schema",
      "prompt": "Use the supplied get_weather tool for Beijing. Do not answer in prose before emitting the function call.",
      "tool": {"type":"function","name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}},
      "acceptance": ["one structured function call", "name is get_weather", "arguments contain city=Beijing", "no real tool execution"]
    }
  ],
  "medium_routing": [
    {"id":"M1-test-design","prompt":"Design a unit-test checklist for a pure function that parses a date and rejects invalid input.","expected_tier":"terra"},
    {"id":"M2-cross-file-map","prompt":"Map the minimal files needed to add a bounded CLI status flag; do not edit files.","expected_tier":"terra"}
  ],
  "high_routing": [
    {"id":"H1-permission","prompt":"Assess a production permission migration and list safety gates before any change.","expected_tier":"sol"},
    {"id":"H2-security","prompt":"Assess whether an authentication change is safe to deploy and identify blockers.","expected_tier":"sol"}
  ]
}
```

- [ ] Hash the fixture file before any model request.
- [ ] Verify that E1/E2 contain no paths, credentials, production values, or private content.

Expected result: two execution tasks for the cost/quality comparison and four routing probes for policy calibration.

### Task 3: Run the bounded model comparison

**Files:**
- Read: `docs/superpowers/evidence/savetoken-calibration-fixtures-2026-08-10.json`
- Read: `docs/superpowers/evidence/savetoken-phase-d3-execution-wiring-2026-08-10.md`
- Create later: `docs/superpowers/evidence/savetoken-calibration-run-2026-08-10.json`

**Interfaces:**
- Consumes: E1/E2 fixtures, the frozen DeepSeek proxy adapter, the verified Sol control route, and the four-request budget.
- Produces: redacted request/response evidence with actual model and usage fields.

- [ ] Run E1 once through `savetoken-runtime` using the frozen `createOpenCodexProxyAdapter` and `deepseek/deepseek-v4-flash` route.
- [ ] Run E2 once through the same SaveToken DeepSeek route; do not bypass SaveToken for the execution samples.
- [ ] Run E1 once with `openai/gpt-5.6-sol` through the OpenCodex Responses surface as a separately labelled quality control; this is not evidence that a Sol SaveToken adapter exists.
- [ ] Run E2 once with `openai/gpt-5.6-sol` through the same control surface; if OAuth is unavailable, record `UNKNOWN` and do not replace it with Terra or GLM.
- [ ] For each successful response, record only HTTP status, response model, response object/status, sanitized output, usage counters, and acceptance booleans.
- [ ] If response model identity differs from the requested model, mark the run `UNKNOWN` and stop the comparison.
- [ ] If usage is absent or non-finite, mark cost comparison `UNKNOWN`.
- [ ] Do not run retries, automatic fallback, multi-turn tools, or additional providers.

Expected result: at most four real requests; DeepSeek results prove the SaveToken full path, while Sol results are labelled control-path evidence only. Each successful run has model identity, usage, and explicit acceptance outcomes.

### Task 4: Calibrate routing decisions offline

**Files:**
- Read: `docs/superpowers/evidence/savetoken-calibration-fixtures-2026-08-10.json`
- Modify later: `docs/superpowers/evidence/savetoken-calibration-run-2026-08-10.json`

**Interfaces:**
- Consumes: M1/M2/H1/H2 probe text and the existing `decideRoute` contract.
- Produces: route-decision evidence without invoking another model.

- [ ] Evaluate M1 and M2 with the existing routing function; expected tier is `terra`.
- [ ] Evaluate H1 and H2 with the existing routing function; expected tier is `sol` and `failClosed=true`.
- [ ] Record escalation reasons and candidate tiers.
- [ ] Fail the calibration if any high-risk probe resolves to execution or GLM.
- [ ] Do not call Terra or Sol merely to prove their names exist in the catalog.

Expected result: four of four policy probes match the frozen tier rules, or the report records the exact mismatch without changing the classifier.

### Task 5: Apply the acceptance gate and write the report

**Files:**
- Create: `docs/superpowers/evidence/savetoken-calibration-report-2026-08-10.md`
- Modify: `docs/superpowers/evidence/savetoken-calibration-run-2026-08-10.json`

**Interfaces:**
- Consumes: fixture hash, run evidence, route decisions, and command results.
- Produces: a bounded calibration verdict.

- [ ] Compute per-task critical acceptance pass/fail; do not average away a critical failure.
- [ ] Compare DeepSeek and Sol token usage only for tasks where both model identities and usage are confirmed.
- [ ] Report `token_ratio = DeepSeek_total / Sol_total` only when the denominator is measured and the task prompts are identical.
- [ ] State explicitly that two tasks are a calibration sample, not proof of general quality parity.
- [ ] Mark Luna, Terra, and GLM runtime behavior `UNKNOWN` unless independently tested in this run.
- [ ] Run privacy scan over the evidence files and verify no secret-like values.
- [ ] Hash the fixture, run, and report files.

Acceptance gate:

- PASS only if E1 and E2 pass all critical criteria for DeepSeek and the Sol control is also available and passes;
- PASS only if M1/M2/H1/H2 all route to their expected tiers;
- PASS only if model identities and usage are confirmed for every cost comparison;
- otherwise result is `PARTIAL` or `UNKNOWN`, never “quality preserved” or “10x savings”.

## Explicit non-goals

- The existing `proxy` auth mode and DeepSeek adapter are frozen inputs; no additional auth mode or Provider adapter is allowed in this calibration.
- No new ProviderAdapter, fallback chain, service/shim, GUI, catalog injection, or cross-platform work.
- No real repository edit, production operation, multi-turn tool conversation, 429/503 induction, or quota exhaustion.
- No public-release or OpenCodex parity claim.

## Final report format

```text
Stage: Calibration-1
Result: PASS | PARTIAL | UNKNOWN | BLOCKED

FACT:
- exact fixture hash
- exact model identities
- exact usage and acceptance results
- exact route decisions and commands

INFERENCE:
- bounded conclusion about this sample only

UNKNOWN:
- unavailable model routes, provider errors, cancellation propagation, quota, and generalization

Next action:
- freeze routing, revise contract, or authorize a separately scoped follow-up
```
