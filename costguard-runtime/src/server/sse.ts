import { terminalState, type TerminalState } from "./protocol";

export type SseFrame = {
  event?: string;
  id?: string;
  retry?: number;
  data: string;
};

function fieldValue(line: string, field: string): string | undefined {
  if (!line.startsWith(field)) return undefined;
  const suffix = line.slice(field.length);
  if (suffix === "") return "";
  if (!suffix.startsWith(":")) return undefined;
  return suffix.startsWith(": ") ? suffix.slice(2) : suffix.slice(1);
}

/** Parse buffered text/event-stream content without requiring a trailing blank line. */
export function parseSseText(source: string): SseFrame[] {
  const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const frames: SseFrame[] = [];
  let event: string | undefined;
  let id: string | undefined;
  let retry: number | undefined;
  let data: string[] = [];

  const dispatch = (): void => {
    if (data.length === 0) {
      event = undefined;
      id = undefined;
      retry = undefined;
      return;
    }
    frames.push({
      ...(event !== undefined ? { event } : {}),
      ...(id !== undefined ? { id } : {}),
      ...(retry !== undefined ? { retry } : {}),
      data: data.join("\n"),
    });
    event = undefined;
    id = undefined;
    retry = undefined;
    data = [];
  };

  for (const line of lines) {
    if (line === "") {
      dispatch();
      continue;
    }
    if (line.startsWith(":")) continue;
    const nextEvent = fieldValue(line, "event");
    if (nextEvent !== undefined) {
      event = nextEvent;
      continue;
    }
    const nextId = fieldValue(line, "id");
    if (nextId !== undefined) {
      id = nextId;
      continue;
    }
    const nextRetry = fieldValue(line, "retry");
    if (nextRetry !== undefined) {
      const parsed = Number.parseInt(nextRetry, 10);
      if (Number.isInteger(parsed) && parsed >= 0) retry = parsed;
      continue;
    }
    const nextData = fieldValue(line, "data");
    if (nextData !== undefined) data.push(nextData);
  }
  dispatch();
  return frames;
}

export function classifySseFrame(frame: Pick<SseFrame, "event" | "data">): TerminalState {
  if (frame.data === "[DONE]") return "completed";
  const eventType = frame.event ?? (() => {
    try {
      const parsed = JSON.parse(frame.data) as { type?: unknown };
      return typeof parsed.type === "string" ? parsed.type : "";
    } catch {
      return "";
    }
  })();
  return terminalState({ type: eventType });
}
