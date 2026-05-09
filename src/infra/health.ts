export type HealthStatus = "ok" | "error";

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
}

export interface HealthCheckable {
  check(): Promise<HealthCheckResult>;
  close(): Promise<void>;
}

export interface HealthSummary {
  ready: boolean;
  checks: Record<string, HealthCheckResult>;
}

export async function checkAll(checks: Record<string, HealthCheckable>): Promise<HealthSummary> {
  const entries = await Promise.all(
    Object.entries(checks).map(async ([name, checkable]) => {
      try {
        return [name, await checkable.check()] as const;
      } catch {
        return [name, { status: "error", message: "health check failed" }] as const;
      }
    })
  );

  const results = Object.fromEntries(entries);
  return {
    ready: Object.values(results).every((result) => result.status === "ok"),
    checks: results
  };
}

export function createStaticHealthCheck(status: HealthStatus = "ok"): HealthCheckable {
  return {
    async check() {
      return { status };
    },
    async close() {}
  };
}
