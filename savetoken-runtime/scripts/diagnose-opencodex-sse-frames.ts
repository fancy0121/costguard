import { parseSseText } from "../src/server/sse";
import { parseOpenAiResponsesSse } from "../src/providers/opencodex-proxy";

const response = await fetch("http://127.0.0.1:10100/v1/responses", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ model: "gpt-5.6-luna", input: [{ role: "user", content: "Return exactly beta" }], stream: true, store: false }),
});
const text = await response.text();
const frames = parseSseText(text).map((frame) => {
  let parsed: Record<string, unknown> | undefined;
  try { parsed = JSON.parse(frame.data) as Record<string, unknown>; } catch {}
  return { event: frame.event ?? "", type: typeof parsed?.type === "string" ? parsed.type : "", keys: parsed ? Object.keys(parsed).sort() : [], dataLength: frame.data.length, done: frame.data === "[DONE]" };
});
const parsed = parseOpenAiResponsesSse(text);
console.log(JSON.stringify({ httpStatus: response.status, contentType: response.headers.get("content-type"), frameCount: frames.length, parsedShape: { model: parsed.model ?? "", outputCount: parsed.output.length, firstOutputType: parsed.output[0]?.type ?? "", firstContentType: Array.isArray(parsed.output[0]?.content) ? (parsed.output[0]?.content as Array<Record<string, unknown>>)[0]?.type ?? "" : "" }, frames }));
