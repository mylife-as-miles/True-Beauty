export type ScheduledFeature = "face" | "hair" | "hands" | "body" | "pose";
const FEATURES: ScheduledFeature[] = ["face", "hair", "hands", "body", "pose"];
const record = (value: number) =>
  Object.fromEntries(FEATURES.map((key) => [key, value])) as Record<
    ScheduledFeature,
    number
  >;
/** Budget adaptation based on measured inference time, not guessed device class. */
export class InferenceScheduler {
  private last = record(-Infinity);
  private cost = record(0);
  private runs = record(0);
  private active: Partial<Record<ScheduledFeature, boolean>> = {};
  private hz: Record<ScheduledFeature, number>;
  constructor(
    hz: Record<"face" | "hair" | "hands", number> &
      Partial<Record<"body" | "pose", number>>,
    private budget = 0.65,
  ) {
    this.hz = { body: 4, pose: 8, ...hz };
  }
  setActive(active: Partial<Record<ScheduledFeature, boolean>>) {
    this.active = active;
  }
  get slowdown() {
    const workload = FEATURES.reduce(
      (sum, key) =>
        sum + (this.active[key] ? (this.cost[key] * this.hz[key]) / 1000 : 0),
      0,
    );
    return Math.max(1, workload / this.budget);
  }
  due(key: ScheduledFeature, timestamp: number) {
    return (
      !!this.active[key] &&
      timestamp - this.last[key] >= (1000 / this.hz[key]) * this.slowdown
    );
  }
  record(key: ScheduledFeature, timestamp: number, duration: number) {
    this.runs[key]++;
    this.last[key] = timestamp;
    this.cost[key] = this.cost[key]
      ? this.cost[key] * 0.75 + duration * 0.25
      : duration;
  }
  reset() {
    this.last = record(-Infinity);
    this.cost = record(0);
    this.runs = record(0);
  }
  getMetrics() {
    return {
      slowdown: this.slowdown,
      meanCostMs: { ...this.cost },
      targetHz: { ...this.hz },
      runs: { ...this.runs },
    };
  }
}
