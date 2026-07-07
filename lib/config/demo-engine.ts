export type DemoEngine = "mock" | "live";

export function getDefaultEngine(): DemoEngine {
  return process.env.BEACON_DEFAULT_ENGINE === "live" ? "live" : "mock";
}
