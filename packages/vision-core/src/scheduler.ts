export type ScheduledFeature = "face" | "hair" | "hands";
/** Budget adaptation based on measured inference time, not guessed device class. */
export class InferenceScheduler {
  private last: Record<ScheduledFeature, number> = {
    face: -Infinity,
    hair: -Infinity,
    hands: -Infinity,
  };
  private cost: Record<ScheduledFeature, number> = {
    face: 0,
    hair: 0,
    hands: 0,
  };
  private runs: Record<ScheduledFeature, number> = {
    face: 0,
    hair: 0,
    hands: 0,
  };
  private active: Partial<Record<ScheduledFeature, boolean>> = {};
  constructor(
    private hz: Record<ScheduledFeature, number>,
    private budget = 0.65,
  ) {}
  setActive(active: Partial<Record<ScheduledFeature, boolean>>) {
    this.active = active;
  }
  get slowdown() {
    const workload = (Object.keys(this.hz) as ScheduledFeature[]).reduce(
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
    this.last = { face: -Infinity, hair: -Infinity, hands: -Infinity };
    this.cost = { face: 0, hair: 0, hands: 0 };
    this.runs = { face: 0, hair: 0, hands: 0 };
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
