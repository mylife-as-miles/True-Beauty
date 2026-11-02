/** LOCAL TEST WORKER ONLY. This method dispatcher is not a deployable application route. */
import { createHostedStore } from "../src/runtime/store";
import {
  HostedError,
  type HostedEnv,
  type RecordInput,
  type QuoteInput,
  type ConsumeQuoteInput,
} from "../src/runtime/contracts";
export default {
  async fetch(request: Request, env: HostedEnv) {
    const body = (await request.json()) as {
        method: string;
        args: unknown[];
        now: number;
      },
      store = createHostedStore(env, () => body.now),
      a = body.args;
    try {
      let value: unknown;
      switch (body.method) {
        case "initialize":
          value = await store.initializeBudget(
            a[0] as Parameters<typeof store.initializeBudget>[0],
            a[1] as string,
          );
          break;
        case "budget":
          value = await store.budget();
          break;
        case "insert":
          value = await store.insert(a[0] as RecordInput);
          break;
        case "get":
          value = await store.get(
            a[0] as string,
            a[1] as string,
            a[2] as string,
          );
          break;
        case "cas":
          value = await store.compareAndSwap(
            a[0] as RecordInput & { revision: number },
          );
          break;
        case "delete":
          value = await store.delete(
            a[0] as string,
            a[1] as string,
            a[2] as string,
          );
          break;
        case "quote":
          value = await store.createQuote(a[0] as QuoteInput);
          break;
        case "approve":
          value = await store.approveQuote(a[0] as string, a[1] as string);
          break;
        case "revoke":
          value = await store.revokeQuote(a[0] as string, a[1] as string);
          break;
        case "consume":
          value = await store.consumeQuoteAndCreate(a[0] as ConsumeQuoteInput);
          break;
        case "continue":
          value = await store.assertContinuation(
            a[0] as string,
            a[1] as string,
            a[2] as boolean,
          );
          break;
        case "cleanup":
          value = await store.cleanup();
          break;
        case "rate":
          value = await store.rateLimit(
            a[0] as string,
            a[1] as number,
            a[2] as number,
          );
          break;
        default:
          throw new HostedError(400, "Unknown local test method");
      }
      return Response.json({ value: value ?? null });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Fixture failure" },
        { status: error instanceof HostedError ? error.status : 500 },
      );
    }
  },
};
