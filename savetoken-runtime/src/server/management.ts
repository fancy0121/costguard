export type ManagementLifecycleResult = {
  status: "PRESENT" | "UNKNOWN" | "MISSING";
  reason?: string;
};

export type DoctorResult = {
  status: "PRESENT" | "UNKNOWN";
  findings: string[];
  stalePid?: boolean;
  journalResidue?: boolean;
  orphanOwners?: boolean;
};

export type ManagementHandlerOptions = {
  managementToken?: string;
  health: () => unknown;
  ready: () => unknown;
  catalog: () => unknown;
  providers?: () => unknown;
  usage?: () => unknown;
  logs?: () => unknown;
  modelDiscovery?: () => Promise<unknown>;
  modelDiscoveryCache?: () => Promise<unknown>;
  restore: () => Promise<ManagementLifecycleResult>;
  uninstall: () => Promise<ManagementLifecycleResult>;
  install?: () => Promise<ManagementLifecycleResult>;
  sync?: () => Promise<ManagementLifecycleResult>;
  doctor?: () => Promise<DoctorResult>;
};

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function lifecycleHttpStatus(result: ManagementLifecycleResult): number {
  if (result.status === "PRESENT") return 200;
  if (result.status === "MISSING") return 404;
  return 503;
}

function controlPlaneHttpStatus(result: unknown): number {
  return typeof result === "object" && result !== null && (result as { status?: unknown }).status === "UNKNOWN" ? 503 : 200;
}

function authorized(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false;
  return request.headers.get("authorization") === `Bearer ${expectedToken}`;
}

export function createManagementHandler(options: ManagementHandlerOptions): (request: Request) => Promise<Response | undefined> {
  return async (request) => {
    try {
      const url = new URL(request.url);
      if (!url.pathname.startsWith("/api/")) return undefined;
      if (request.signal.aborted) return json({ status: "cancelled", failClosed: true }, 499);
      if (!authorized(request, options.managementToken)) {
        return json({ status: "UNKNOWN", failClosed: true, reason: "management-auth-required" }, options.managementToken ? 401 : 503);
      }

    if (url.pathname === "/api/status" && request.method === "GET") {
      return json({ health: options.health(), ready: options.ready() });
    }
    if (url.pathname === "/api/ready" && request.method === "GET") return json(options.ready());
    if (url.pathname === "/api/health" && request.method === "GET") return json(options.health());
    if (url.pathname === "/api/catalog" && request.method === "GET") return json(options.catalog());
    if (url.pathname === "/api/providers" && request.method === "GET") {
      return json(options.providers?.() ?? { status: "UNKNOWN", reason: "provider-control-plane-not-configured" });
    }
    if (url.pathname === "/api/usage" && request.method === "GET") {
      return json(options.usage?.() ?? { status: "UNKNOWN", reason: "usage-not-configured" });
    }
    if (url.pathname === "/api/logs" && request.method === "GET") {
      return json(options.logs?.() ?? { status: "UNKNOWN", reason: "logs-not-configured" });
    }
    if (url.pathname === "/api/model-discovery" && request.method === "GET") {
      const result = await options.modelDiscovery?.() ?? { status: "UNKNOWN", failClosed: true, reason: "model-discovery-not-configured" };
      return json(result, controlPlaneHttpStatus(result));
    }
    if (url.pathname === "/api/model-discovery-cache" && request.method === "GET") {
      const result = await options.modelDiscoveryCache?.() ?? { status: "UNKNOWN", failClosed: true, reason: "model-discovery-cache-not-configured" };
      return json(result, controlPlaneHttpStatus(result));
    }
    if (url.pathname === "/api/restore" && request.method === "POST") {
      const result = await options.restore();
      return json(result, lifecycleHttpStatus(result));
    }
    if (url.pathname === "/api/uninstall" && request.method === "POST") {
      const result = await options.uninstall();
      return json(result, lifecycleHttpStatus(result));
    }
    if (url.pathname === "/api/install" && request.method === "POST") {
      if (!options.install) return json({ status: "UNKNOWN", failClosed: true, reason: "install-not-configured" }, 503);
      const result = await options.install();
      return json(result, lifecycleHttpStatus(result));
    }
    if (url.pathname === "/api/sync" && request.method === "POST") {
      if (!options.sync) return json({ status: "UNKNOWN", failClosed: true, reason: "sync-not-configured" }, 503);
      const result = await options.sync();
      return json(result, lifecycleHttpStatus(result));
    }
    if (url.pathname === "/api/doctor" && request.method === "GET") {
      if (!options.doctor) return json({ status: "UNKNOWN", failClosed: true, reason: "doctor-not-configured" }, 503);
      const result = await options.doctor();
      return json(result, result.status === "PRESENT" ? 200 : 503);
    }
      return json({ error: "not-found" }, 404);
    } catch {
      return json({ status: "UNKNOWN", failClosed: true, reason: "management-operation-failed" }, 503);
    }
  };
}
