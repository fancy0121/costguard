export type WebSocketAdmission =
  | { status: "PRESENT"; protocol: "websocket" }
  | { status: "MISSING"; reason: "websocket-not-requested" }
  | { status: "UNKNOWN"; failClosed: true; reason: "websocket-unavailable" };

export function admitWebSocket(requested: boolean, capabilities: Set<string>): WebSocketAdmission {
  if (!requested) return { status: "MISSING", reason: "websocket-not-requested" };
  if (!capabilities.has("websocket")) return { status: "UNKNOWN", failClosed: true, reason: "websocket-unavailable" };
  return { status: "PRESENT", protocol: "websocket" };
}
