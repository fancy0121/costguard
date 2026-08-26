export type DashboardInput = {
  health: unknown;
  ready: unknown;
  catalog: Array<{ id: string; provider: string }>;
};

export function buildDashboardModel(input: DashboardInput): DashboardInput & { actualRuntimeModel: "UNKNOWN" } {
  return {
    health: input.health,
    ready: input.ready,
    catalog: input.catalog.map((entry) => ({ ...entry })),
    actualRuntimeModel: "UNKNOWN",
  };
}
