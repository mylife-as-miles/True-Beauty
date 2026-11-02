/** In-memory HostedStore contract fixture ONLY. Not D1, encryption or durability evidence. */
import {
  HostedError,
  type HostedStore,
  type RecordInput,
  type StoredRecord,
} from "../src/runtime/contracts";
export class MerchantStoreFixture {
  clock = Date.parse("2026-11-02T16:00:00Z");
  records = new Map<string, StoredRecord>();
  private epoch = 0;
  counts = new Map<string, { at: number; count: number }>();
  key(namespace: string, id: string, owner: string) {
    return JSON.stringify([namespace, id, owner]);
  }
  async get<T>(namespace: string, id: string, owner: string) {
    const row = this.records.get(this.key(namespace, id, owner));
    return row && row.expiresAt > this.clock
      ? (structuredClone(row) as StoredRecord<T>)
      : null;
  }
  async insert<T>(input: RecordInput<T>) {
    const key = this.key(input.namespace, input.id, input.owner),
      old = this.records.get(key);
    if (old && old.expiresAt > this.clock)
      throw new HostedError(409, "Fixture duplicate key");
    const row = { ...structuredClone(input), revision: ++this.epoch };
    this.records.set(key, row);
    return structuredClone(row);
  }
  async compareAndSwap<T>(input: RecordInput<T> & { revision: number }) {
    const key = this.key(input.namespace, input.id, input.owner),
      old = this.records.get(key);
    if (!old || old.revision !== input.revision || old.expiresAt <= this.clock)
      return null;
    const row = { ...structuredClone(input), revision: ++this.epoch };
    this.records.set(key, row);
    return structuredClone(row);
  }
  async delete(namespace: string, id: string, owner: string) {
    return this.records.delete(this.key(namespace, id, owner));
  }
  async rateLimit(key: string, limit: number, windowMs: number) {
    const old = this.counts.get(key),
      row =
        old && old.at + windowMs > this.clock
          ? old
          : { at: this.clock, count: 0 };
    row.count++;
    this.counts.set(key, row);
    return row.count <= limit;
  }
  asStore() {
    return this as unknown as HostedStore;
  }
}
