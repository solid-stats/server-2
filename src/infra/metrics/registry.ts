import client from "prom-client";

export function createMetricsRegistry(): client.Registry {
  const registry = new client.Registry();
  client.collectDefaultMetrics({
    register: registry,
    prefix: "server2_"
  });
  return registry;
}
