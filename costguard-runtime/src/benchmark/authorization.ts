export type BenchmarkAuthorization =
  | { status: "PRESENT" }
  | { status: "UNKNOWN"; failClosed: true; reason: "real-provider-benchmark-not-authorized" };

/** A separate, explicit user authorization is required for any live benchmark request. */
export function benchmarkAuthorization(env: Record<string, string | undefined>): BenchmarkAuthorization {
  return env.COSTGUARD_ALLOW_REAL_BENCHMARK === "1"
    ? { status: "PRESENT" }
    : { status: "UNKNOWN", failClosed: true, reason: "real-provider-benchmark-not-authorized" };
}
