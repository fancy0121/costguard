# SaveToken Phase D-1.1: Provider Preflight Report (Revised)

Date: 2026-08-10
Revision: D-1.1 — corrected service status, actual readbacks, full model list
Scope: Read-only provider discovery from running OpenCodex service and active catalog

## FACT

### Running OpenCodex service

```
GET http://127.0.0.1:10100/healthz → 200
{"status":"ok","service":"opencodex","version":"2.11.0","pid":24744,"port":10100}

GET http://127.0.0.1:10100/readyz → 200
{"status":"ready","service":"opencodex","version":"2.11.0","pid":24744,"port":10100}

GET http://127.0.0.1:10100/v1/models → 200
27 models returned across 5 providers
```

### Upstream source copy (separate)

Location: `work/opencodex-upstream`
Package: `@bitkyc08/opencodex` 2.11.0, commit `57140d6f06218d604ee139e5909a1b868bf7a84b`, MIT
Status: NOT RUNNING (no node_modules installed, Bun CLI not available)
This is a read-only reference clone, distinct from the installed service on port 10100.

### /v1/models — complete listing (27 models)

| # | Model ID | Provider | Reasoning Efforts |
|---|----------|----------|-------------------|
| 1 | gpt-5.3-codex-spark | openai | low, medium, high, xhigh |
| 2 | gpt-5.6-sol | openai | low, medium, high, xhigh, max, ultra |
| 3 | gpt-5.6-terra | openai | low, medium, high, xhigh, max, ultra |
| 4 | gpt-5.6-luna | openai | low, medium, high, xhigh, max |
| 5 | deepseek/deepseek-v4-flash | deepseek | low, high, max |
| 6 | deepseek/deepseek-v4-pro | deepseek | high, max |
| 7 | kimi/k3 | kimi | low, high, max |
| 8 | kimi/k3[1m] | kimi | low, high, max |
| 9 | kimi/kimi-for-coding | kimi | none |
| 10 | kimi/kimi-k2.5 | kimi | none |
| 11 | kimi/kimi-k2.6 | kimi | none |
| 12 | kimi/kimi-k2.7-code | kimi | none |
| 13 | kimi/kimi-k2.7-code-highspeed | kimi | none |
| 14 | xai/grok-4.20-0309-non-reasoning | xai | none |
| 15 | xai/grok-4.20-0309-reasoning | xai | none |
| 16 | xai/grok-4.3 | xai | none |
| 17 | xai/grok-4.5 | xai | low, medium, high |
| 18 | xai/grok-build-0.1 | xai | none |
| 19 | xai/grok-composer-2.5-fast | xai | none |
| 20 | zhipu-bigmodel/glm-4.5 | zhipu-bigmodel | none |
| 21 | zhipu-bigmodel/glm-4.5-air | zhipu-bigmodel | none |
| 22 | zhipu-bigmodel/glm-4.6 | zhipu-bigmodel | low, medium, high, xhigh, max |
| 23 | zhipu-bigmodel/glm-4.7 | zhipu-bigmodel | low, medium, high, xhigh, max |
| 24 | zhipu-bigmodel/glm-5 | zhipu-bigmodel | low, medium, high, xhigh, max |
| 25 | zhipu-bigmodel/glm-5-turbo | zhipu-bigmodel | none |
| 26 | zhipu-bigmodel/glm-5.1 | zhipu-bigmodel | low, medium, high, xhigh, max |
| 27 | zhipu-bigmodel/glm-5.2 | zhipu-bigmodel | none |

### SaveToken tier-to-model mapping (from live catalog)

| Tier | Primary Candidate | Provider | Reasoning Efforts | Auth Mode |
|------|-------------------|----------|-------------------|-----------|
| sol | gpt-5.6-sol | openai | low→ultra | oauth (Codex) |
| terra | gpt-5.6-terra | openai | low→ultra | oauth (Codex) |
| execution | gpt-5.6-luna | openai | low→max | oauth (Codex) |
| execution | deepseek/deepseek-v4-flash | deepseek | low/high/max | key |
| glm-backup | zhipu-bigmodel/glm-5.2 | zhipu-bigmodel | none listed | key |

### Active Codex config

- `CODEX_HOME\config.toml`: `model = "gpt-5.6-luna"`, `model_reasoning_effort = "max"`
- `opencodex-catalog.json`: 27 models, all `comp_hash: opencodex`

## INFERENCE

- OpenCodex 2.11.0 is running and ready on port 10100, serving 27 models.
- Each SaveToken tier has at least one candidate model visible in the live catalog.
- The health/ready/version data confirms the running service matches the upstream reference version.
- `deepseek/deepseek-v4-flash` is the best D-2 candidate: key-auth (no OAuth session needed), text-only, thinking efforts supported, and listed as the default model in the upstream registry.

## UNKNOWN

- Provider reachability beyond model listing (health check does not prove model invocation)
- API key validity for deepseek, zhipu-bigmodel, or any key-auth provider
- OAuth token validity for openai, kimi, xai
- Quota, cooldown, rate-limit state
- Real streaming, tool-call, image, or vision behavior
- Actual model response identity (model ID in response vs catalog entry)
- Latency, cost, token usage

## STOP CONDITIONS (unchanged)

No real model requests sent. No API keys or OAuth tokens read. D-2 requires explicit authorization.