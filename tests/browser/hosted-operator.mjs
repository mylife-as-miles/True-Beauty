/** Manual server-only verification helper. Never imported by application code. */
import { createInterface } from "node:readline";
const origin = "https://true-beauty-miles.myles4miles.chatgpt.site";

/** The operator token arrives through hidden stdin, never argv or browser code. */
export async function openHostedOperator(site) {
  if (site !== origin)
    throw new Error("Use the explicitly authorized Site origin.");
  process.stdout.write(
    "Ready for server-only operator JSON on hidden stdin.\n",
  );
  const reader = createInterface({ input: process.stdin, terminal: false });
  const configuration = JSON.parse(
    await new Promise((resolve) => reader.once("line", resolve)),
  );
  reader.close();
  if (
    typeof configuration.operatorToken !== "string" ||
    configuration.operatorToken.length < 32
  )
    throw new Error("A server-only operator credential is required.");
  const headers = {
    authorization: "Bearer " + configuration.operatorToken,
    origin,
  };
  const sessionResponse = await fetch(origin + "/api/session", {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!sessionResponse.ok)
    throw new Error(
      "Hosted operator session unavailable: " + sessionResponse.status,
    );
  const cookie = sessionResponse.headers.get("set-cookie")?.split(";")[0];
  const session = await sessionResponse.json();
  if (
    !cookie ||
    !session.hosted ||
    !session.operator ||
    typeof session.csrfToken !== "string"
  )
    throw new Error("The hosted server did not authenticate the operator.");
  async function call(path, body) {
    const response = await fetch(origin + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...headers,
        cookie,
        "content-type": "application/json",
        "x-csrf-token": session.csrfToken,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      signal: AbortSignal.timeout(25000),
    });
    const value = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        "Hosted operator request failed (" +
          response.status +
          "): " +
          (value?.error ?? "unavailable"),
      );
    return value;
  }
  return {
    budget: () => call("/api/operator/budget"),
    initialize: () =>
      call("/api/operator/budget", {
        creditsUsed: 51,
        creditsLimit: 100,
        usdMicroUsed: 111000,
        usdMicroLimit: 5000000,
      }),
    async approve(id, expected) {
      if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid quote ID.");
      const list = await call("/api/operator/approvals");
      const quote = list.requests?.find((item) => item.id === id);
      if (
        !quote ||
        quote.operation !== expected.operation ||
        quote.credits !== expected.credits ||
        quote.usdMicro > (expected.usdMicro ?? 0)
      )
        throw new Error(
          "Pending quote differs from the explicit test authorization.",
        );
      return call("/api/operator/approvals/" + id + "/approve", {});
    },
  };
}

if (process.argv[1]?.endsWith("/hosted-operator.mjs")) {
  const action = process.argv[2];
  if (!["budget", "initialize"].includes(action))
    throw new Error(
      "Specify budget or initialize; no implicit paid operation.",
    );
  const operator = await openHostedOperator(origin);
  console.log(JSON.stringify(await operator[action]()));
}
