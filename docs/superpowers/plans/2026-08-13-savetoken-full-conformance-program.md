# SaveToken Full Conformance Program

Date: 2026-08-13

This program uses OpenCodex 2.11.0 at `57140d6f06218d604ee139e5909a1b868bf7a84b` as a read-only behavioral reference. It preserves the frozen Sol / Terra / Luna-DeepSeek / GLM hierarchy, does not store provider credentials, and permits only loopback proxy authentication.

## Work packages

1. Protocol conformance: native Responses, Chat, and Messages shaping; stream, cancellation, tool continuation, validation, and redaction E2E.
2. Provider control plane: route identity, availability, cooldown, explicit bounded fallback, health/readiness, usage evidence, and real-route smoke.
3. Isolated Codex integration: owned catalog projection, install/sync/restore/uninstall, journal and user-edit protection.
4. CLI and lifecycle: actual CLI subprocess, management authentication, loopback-only management target, fixed-port lifecycle. OS service install remains external.
5. Sidecar facade: explicit authorization, allowlist, local lifecycle and cancellation; external sidecars remain external.
6. Quality benchmark: fixed task contracts, exact acceptance, real-route identity/usage collection. A failed or absent structured response remains UNKNOWN.
7. Reproducible package: allowlist, privacy scan, archive manifest, clean-room install and gates; hosted CI remains NOT_TESTED until actually run.

Every package requires implementation, focused regression tests, and an isolated E2E before `PRESENT`; external dependency claims additionally require an actual smoke for that behavior.
