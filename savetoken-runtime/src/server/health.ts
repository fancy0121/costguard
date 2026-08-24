export type HealthResponse =
  | { status: "healthy" }
  | { status: "unhealthy"; reason: string };

export type ReadyResponse =
  | { status: "pending" }
  | { status: "ready" }
  | { status: "failed"; reason: string };

export class HealthState {
  private readyState: "pending" | "ready" | "failed" = "pending";
  private failureReason: string | undefined;

  health(): HealthResponse {
    return this.readyState === "failed"
      ? { status: "unhealthy", reason: this.failureReason ?? "unknown" }
      : { status: "healthy" };
  }

  ready(): ReadyResponse {
    if (this.readyState === "failed") return { status: "failed", reason: this.failureReason ?? "unknown" };
    return { status: this.readyState };
  }

  markReady(): void {
    this.readyState = "ready";
    this.failureReason = undefined;
  }

  markFailed(reason: string): void {
    this.readyState = "failed";
    this.failureReason = reason;
  }
}
