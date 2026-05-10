import client from "prom-client";

export function createMetricsRegistry(): client.Registry {
  const registry = new client.Registry();
  client.collectDefaultMetrics({
    register: registry,
    prefix: "server2_",
  });
  registerOperationalMetrics(registry);
  return registry;
}

export interface OperationalMetrics {
  parseJobDurationSeconds: client.Histogram<"outcome">;
  parseJobOutcomesTotal: client.Counter<"outcome">;
  parserWorkerFailuresTotal: client.Counter<"category">;
  queueDepth: client.Gauge<"queue">;
}

export function registerOperationalMetrics(
  registry: client.Registry,
): OperationalMetrics {
  return {
    parseJobDurationSeconds: new client.Histogram({
      name: "server2_parse_job_duration_seconds",
      help: "Parser job processing duration in seconds by outcome.",
      labelNames: ["outcome"],
      registers: [registry],
    }),
    parseJobOutcomesTotal: new client.Counter({
      name: "server2_parse_job_outcomes_total",
      help: "Parser job outcomes by status.",
      labelNames: ["outcome"],
      registers: [registry],
    }),
    parserWorkerFailuresTotal: new client.Counter({
      name: "server2_parser_worker_failures_total",
      help: "Parser worker failures by category.",
      labelNames: ["category"],
      registers: [registry],
    }),
    queueDepth: new client.Gauge({
      name: "server2_queue_depth",
      help: "Observed queue depth by queue name.",
      labelNames: ["queue"],
      registers: [registry],
    }),
  };
}
