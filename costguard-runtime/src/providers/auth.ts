export type CredentialMode = "oauth" | "api-key" | "fixture" | "proxy" | "none";

export type CredentialReferenceInput = {
  mode: CredentialMode;
  envVar?: string;
};

export type CredentialReferenceResult =
  | { status: "PRESENT"; mode: CredentialMode; envVar?: string }
  | { status: "UNKNOWN"; reason: "credential-reference-invalid" };

export function credentialReference(input: CredentialReferenceInput): CredentialReferenceResult {
  if (input.mode === "fixture" || input.mode === "proxy" || input.mode === "none") {
    return { status: "PRESENT", mode: input.mode };
  }
  if (!input.envVar || !/^[A-Z][A-Z0-9_]{2,}$/.test(input.envVar)) {
    return { status: "UNKNOWN", reason: "credential-reference-invalid" };
  }
  return { status: "PRESENT", mode: input.mode, envVar: input.envVar };
}