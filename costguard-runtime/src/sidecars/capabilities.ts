export type SidecarKind = "images" | "vision" | "web-search";

const SIDECAR_KINDS = new Set<SidecarKind>(["images", "vision", "web-search"]);

function isSidecarKind(value: unknown): value is SidecarKind {
  return typeof value === "string" && SIDECAR_KINDS.has(value as SidecarKind);
}

export type SidecarSelection =
  | { status: "PRESENT"; kind: SidecarKind }
  | { status: "MISSING"; reason: "capability-not-requested" }
  | { status: "UNKNOWN"; failClosed: true; reason: "sidecar-unavailable" };

export function selectSidecar(kind: SidecarKind, requested: boolean, available: Set<SidecarKind>): SidecarSelection {
  if (!requested) return { status: "MISSING", reason: "capability-not-requested" };
  if (!isSidecarKind(kind) || !available.has(kind)) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" };
  return { status: "PRESENT", kind };
}

export type SidecarInvocation = (kind: SidecarKind, message: unknown, signal: AbortSignal) => Promise<unknown>;

export type SidecarSessionResult =
  | { status: "PRESENT"; result: unknown }
  | { status: "UNKNOWN"; failClosed: true; reason: "sidecar-session-closed" | "sidecar-session-cancelled" | "sidecar-invocation-failed" | "sidecar-message-invalid" | "sidecar-message-internal-field" };

export type SidecarSession = {
  send: (message: unknown) => Promise<SidecarSessionResult>;
  close: () => { status: "PRESENT"; state: "closed" };
  cancel: () => { status: "PRESENT"; state: "cancelled" };
};

export type SidecarConnection =
  | { status: "PRESENT"; session: SidecarSession }
  | { status: "UNKNOWN"; failClosed: true; reason: "sidecar-authorization-required" | "sidecar-unavailable" };

function sidecarMessageFailure(message: unknown): Extract<SidecarSessionResult, { status: "UNKNOWN" }> | undefined {
  if (typeof message !== "object" || message === null || Array.isArray(message)) {
    return { status: "UNKNOWN", failClosed: true, reason: "sidecar-message-invalid" };
  }
  if (Object.keys(message).some((key) => key.toLowerCase().startsWith("costguard"))) {
    return { status: "UNKNOWN", failClosed: true, reason: "sidecar-message-internal-field" };
  }
  return undefined;
}

/** Local lifecycle facade only. It does not imply an external sidecar is configured or reachable. */
export class SidecarFacade {
  constructor(private readonly options: { capabilities: Set<SidecarKind>; authorized: boolean; invoke: SidecarInvocation }) {}

  connect(kind: SidecarKind): SidecarConnection {
    if (!this.options.authorized) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-authorization-required" };
    if (!isSidecarKind(kind) || !this.options.capabilities.has(kind)) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-unavailable" };
    const controller = new AbortController();
    let state: "open" | "closed" | "cancelled" = "open";
    const invoke = this.options.invoke;
    return {
      status: "PRESENT",
      session: {
        async send(message) {
          if (state === "closed") return { status: "UNKNOWN", failClosed: true, reason: "sidecar-session-closed" };
          if (state === "cancelled" || controller.signal.aborted) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-session-cancelled" };
          const invalid = sidecarMessageFailure(message);
          if (invalid) return invalid;
          try {
            const result = await invoke(kind, message, controller.signal);
            if (controller.signal.aborted) return { status: "UNKNOWN", failClosed: true, reason: "sidecar-session-cancelled" };
            return { status: "PRESENT", result };
          } catch {
            return { status: "UNKNOWN", failClosed: true, reason: "sidecar-invocation-failed" };
          }
        },
        close() { state = "closed"; return { status: "PRESENT", state: "closed" }; },
        cancel() { state = "cancelled"; controller.abort(); return { status: "PRESENT", state: "cancelled" }; },
      },
    };
  }
}
