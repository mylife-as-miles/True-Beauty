/** LOCAL TEST WORKER ONLY: scripted merchant service, genuine local D1/runtime, no external merchant or paid calls. */
import { createMerchantHandler } from "../src/routes/merchant";
import { createHostedStore } from "../src/runtime/store";
import {
  HostedError,
  json,
  type HostedEnv,
  type HostedContext,
} from "../src/runtime/contracts";
interface FixtureEnv extends HostedEnv {
  MERCHANT_FIXTURE: {
    fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  };
}
export default {
  async fetch(
    request: Request,
    env: FixtureEnv,
    execution: { waitUntil(promise: Promise<unknown>): void },
  ) {
    const clock = Number(request.headers.get("x-fixture-clock")) || Date.now();
    const ctx: HostedContext = {
      env,
      store: createHostedStore(env, () => clock),
      session: {
        id: "fixture-session-not-a-browser-login",
        csrfToken: "fixture-csrf",
        expiresAt: clock + 3600000,
      },
      operator: false,
      operatorId: null,
      now: () => clock,
      waitUntil: (p) => execution.waitUntil(p),
    };
    const handler = createMerchantHandler({
      fetcher: (input, init) => env.MERCHANT_FIXTURE.fetch(input, init),
    });
    try {
      return (
        (await handler(request, ctx)) ??
        json({ fixture: true, error: "Not a merchant route" }, 404)
      );
    } catch (error) {
      return json(
        {
          fixture: true,
          error:
            error instanceof Error ? error.message : "Fixture route failure",
        },
        error instanceof HostedError ? error.status : 500,
      );
    }
  },
};
