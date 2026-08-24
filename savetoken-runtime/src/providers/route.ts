export type ProviderRouteInput = {
  defaultProvider: string;
  providers: Record<string, string[]>;
  requestedModel?: string;
};

export type ProviderRouteResult = {
  status: "PRESENT" | "UNKNOWN";
  provider?: string;
  model?: string;
  failClosed: boolean;
  reason?: string;
};

export function resolveProviderModel(input: ProviderRouteInput): ProviderRouteResult {
  const requested = input.requestedModel?.trim();
  const slash = requested?.indexOf("/") ?? -1;
  if (slash > 0) {
    const provider = requested!.slice(0, slash);
    const model = requested!.slice(slash + 1);
    const models = input.providers[provider];
    if (!models || !model || !models.includes(model)) return { status: "UNKNOWN", failClosed: true, reason: "provider-or-model-unverified" };
    return { status: "PRESENT", provider, model, failClosed: false };
  }
  if (requested) {
    const matches = Object.entries(input.providers).filter(([, models]) => models.includes(requested));
    if (matches.length !== 1) return { status: "UNKNOWN", failClosed: true, reason: matches.length > 1 ? "provider-model-ambiguous" : "provider-or-model-unverified" };
    return { status: "PRESENT", provider: matches[0][0], model: requested, failClosed: false };
  }
  const provider = input.defaultProvider;
  const model = input.providers[provider]?.[0];
  const models = input.providers[provider];

  if (!models || !model || !models.includes(model)) {
    return { status: "UNKNOWN", failClosed: true, reason: "provider-default-unconfigured" };
  }
  return { status: "PRESENT", provider, model, failClosed: false };
}
