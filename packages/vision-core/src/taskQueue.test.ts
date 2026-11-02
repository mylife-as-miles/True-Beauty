import { describe, it, expect } from "vitest";
import { SerialTaskQueue } from "./taskQueue";
describe("explicit still-image queue", () => {
  it("runs each new source after pending inference rather than returning a stale snapshot", async () => {
    const q = new SerialTaskQueue();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const order: string[] = [];
    const first = q.enqueue(async () => {
      order.push("old-start");
      await gate;
      order.push("old-end");
      return "old-landmarks";
    });
    const next = q.enqueue(async () => {
      order.push("new-start");
      return "new-landmarks";
    });
    await Promise.resolve();
    expect(order).toEqual(["old-start"]);
    release();
    expect(await first).toBe("old-landmarks");
    expect(await next).toBe("new-landmarks");
    expect(order).toEqual(["old-start", "old-end", "new-start"]);
  });
  it("recovers after a failed old source", async () => {
    const q = new SerialTaskQueue();
    await expect(
      q.enqueue(async () => {
        throw new Error("decode failure");
      }),
    ).rejects.toThrow("decode failure");
    expect(await q.enqueue(async () => 478)).toBe(478);
  });
});
