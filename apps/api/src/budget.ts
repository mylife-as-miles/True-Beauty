import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname } from "node:path";
export interface BudgetLedger {
  reserve(credits: number, maximum: number): void;
  used(): number;
}
/** Single-process durable conservative spend reservations; no images or credentials. */
export class FileBudgetLedger implements BudgetLedger {
  constructor(
    private readonly path: string,
    private readonly now = () => Date.now(),
  ) {}
  private read(): { date: string; credits: number } {
    const date = new Date(this.now()).toISOString().slice(0, 10);
    try {
      const v = JSON.parse(readFileSync(this.path, "utf8"));
      if (v.date !== date) return { date, credits: 0 };
      if (
        typeof v.credits !== "number" ||
        v.credits < 0 ||
        !Number.isFinite(v.credits)
      )
        throw new Error("Invalid budget ledger.");
      return { date, credits: v.credits };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return { date, credits: 0 };
      throw error;
    }
  }
  reserve(credits: number, maximum: number) {
    const state = this.read();
    if (
      !Number.isFinite(credits) ||
      credits <= 0 ||
      state.credits + credits > maximum
    )
      throw new Error("The server daily credit ceiling has been reached.");
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const next = { date: state.date, credits: state.credits + credits };
    writeFileSync(`${this.path}.tmp`, JSON.stringify(next), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
  used() {
    return this.read().credits;
  }
}
