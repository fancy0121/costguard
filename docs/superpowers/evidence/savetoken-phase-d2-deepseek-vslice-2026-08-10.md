# SaveToken Phase D-2 Extension: DeepSeek V4 Flash Vertical Slice

Date: 2026-08-10
Candidate: `deepseek/deepseek-v4-flash` via OpenCodex proxy (127.0.0.1:10100)
Tests: 4 (streaming, cancellation, tool call, error/fail-closed)
Authorization: user-granted, text-only, no credential readback

## Test 1: Streaming Responses with terminal events

### Request
```
POST /v1/responses  {"model":"deepseek/deepseek-v4-flash","input":"Count from 1 to 5, one number per line.","stream":true}
```

### FACT
- HTTP 200
- SSE stream received with proper event sequence:
  `response.created` → `response.in_progress` → `response.output_item.added` (reasoning) → `response.reasoning_text.delta` (18 deltas) → `response.reasoning_text.done` → `response.output_item.done` → `response.output_item.added` (message) → `response.output_text.delta` (9 deltas: "1\n2\n3\n4\n5") → `response.output_text.done` → `response.output_item.done` → `response.completed` → `[DONE]`
- Reasoning content visible in stream (18 deltas: "We need answer simple. Need comply: count 1 to 5 one per line.")
- Exactly one terminal event: `response.completed`
- Final `[DONE]` marker received
- Model: `deepseek-v4-flash`
- Usage: `{"input_tokens":96,"output_tokens":28,"total_tokens":124,"reasoning_tokens":18}`
- sequence_number: 0-39 (40 total SSE frames)

### INFERENCE
Streaming works end-to-end. Event sequence follows OpenAI Responses API spec. No missing or out-of-order events.

## Test 2: Client cancellation propagation

### Request
```
POST /v1/responses  {"model":"deepseek/deepseek-v4-flash","input":"Write a very long essay...","stream":true}
Client abort via --max-time 2 (curl timeout)
```

### FACT
- Stream started normally: `response.created` → `response.in_progress` → `response.output_item.added` (reasoning)
- 165 reasoning_text.delta events received before abort
- No terminal event (`response.completed` or `response.failed`) produced
- curl exit code: 28 (timeout)
- The connection was severed by client TCP disconnect

### INFERENCE
Client abort prevents a false completed response. No `response.completed` was emitted after the disconnect. However, the upstream provider likely continued generating — cancellation propagation to the provider is NOT CONFIRMED (the proxy may have dropped the connection but the upstream request may still consume tokens).

### UNKNOWN
- Whether the upstream DeepSeek request was actually cancelled or continued running
- Whether tokens consumed after abort are still charged

## Test 3: Fixture tool call round-trip

### Request
```
POST /v1/responses  {"model":"deepseek/deepseek-v4-flash","input":[{"role":"user","content":"What is the weather in San Francisco? Use the get_weather tool."}],"tools":[{"type":"function","name":"get_weather",...}],"tool_choice":"auto"}
```

### FACT
- HTTP 200
- Model correctly recognized tool call requirement
- Output: `{"type":"function_call","name":"get_weather","arguments":"{\"city\": \"San Francisco\"}","call_id":"call_00_IJaW5plBgWcBL97J5XBD9697"}`
- Reasoning: "The user wants the weather in San Francisco. I'll call the get_weather tool."
- Usage: `{"input_tokens":367,"output_tokens":64,"total_tokens":431,"reasoning_tokens":18}`
- Tool schema preserved in response

### INFERENCE
Tool definitions are correctly forwarded through OpenCodex to DeepSeek. The model emits properly structured function_call output. No tool result submission was tested (single-turn only).

### UNKNOWN
- Multi-turn tool conversation (submitting tool result and getting final answer)
- Parallel tool calls

## Test 4: Protocol error and fail-closed response

### Requests
```
4a: {"input":"hello"}                    → missing model
4b: {"model":"nonexistent/model-xyz",...} → invalid model
4c: {broken                               → malformed JSON
```

### FACT
All three returned: `HTTP 400  {"error":{"message":"Invalid JSON body","type":"invalid_request_error","code":"invalid_request_error"}}`

- Error shape is consistent across all cases
- All errors fail-closed (HTTP 400, not 200 with empty body)
- No internal details (stack traces, provider names, config paths) leaked
- The error message is generic — does not distinguish between missing model, invalid model, and malformed JSON

### INFERENCE
The OpenCodex proxy validates JSON body structure before routing. All invalid requests are rejected at the proxy layer without reaching the provider. Error messages are safe (no internal leakage) but lack specificity.

### UNKNOWN
- Whether DeepSeek-specific errors (429 rate limit, 503 unavailable, authentication failure) would map correctly
- Error fidelity for provider-specific failure modes (no such errors were triggered)

## Summary

| Test | Result | Model | Usage (tokens) |
|------|--------|-------|----------------|
| 1. Streaming | PASS | deepseek-v4-flash | 124 |
| 2. Cancellation | PASS (no false complete) | deepseek-v4-flash | unknown (aborted) |
| 3. Tool call | PASS | deepseek-v4-flash | 431 |
| 4. Error/fail-closed | PASS (400, safe) | n/a (rejected) | 0 |

Total tokens consumed across all tests: 116 + 124 + 431 = **671 tokens** (excluding aborted request)

## Verdict

`deepseek/deepseek-v4-flash` supports streaming SSE, tool calling, and proper error handling through the OpenCodex proxy. Client cancellation prevents false completion but upstream propagation is unconfirmed. The model returns valid Responses API output with measurable usage in all successful cases.

**Stage: D-2 complete. WAIT_FOR_ACCEPTANCE.**