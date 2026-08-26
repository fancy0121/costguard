export type ProviderClientError = {
  status: "UNKNOWN";
  httpStatus: 429 | 502 | 503;
  code: "provider_rate_limited" | "provider_unavailable" | "provider_request_failed";
  message: "provider request unavailable";
};

export function mapProviderError(error: unknown): ProviderClientError {
  const status = typeof error === "object" && error !== null && "status" in error
    ? (error as { status?: unknown }).status
    : undefined;
  if (status === 429) return { status: "UNKNOWN", httpStatus: 429, code: "provider_rate_limited", message: "provider request unavailable" };
  if (status === 503) return { status: "UNKNOWN", httpStatus: 503, code: "provider_unavailable", message: "provider request unavailable" };
  return { status: "UNKNOWN", httpStatus: 502, code: "provider_request_failed", message: "provider request unavailable" };
}
