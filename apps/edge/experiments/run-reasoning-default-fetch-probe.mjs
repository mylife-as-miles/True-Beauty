import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const tooling = process.argv[2];
if (!tooling) throw new Error("Pass the absolute isolated tooling directory.");
const require = createRequire(resolve(tooling, "package.json"));
const { Miniflare } = require("miniflare");
const esbuild = require("esbuild");
const assertions = [];
const check = (condition, label) => {
  assert.ok(condition, label);
  assertions.push(label);
};
const fixtureKey = "fixture-only-default-fetch-key-never-a-real-credential";
const model = "workerd-default-fetch-fixture-model";
const entry = resolve(
  "apps/edge/experiments/reasoning-default-fetch-fixture.ts",
);
const baseBuild = {
  entryPoints: [entry],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
};
const fixedOutput = resolve(tooling, "reasoning-default-fetch-r07-fixed.mjs");
const priorOutput = resolve(
  tooling,
  "reasoning-default-fetch-r07-prior-control.mjs",
);
await esbuild.build({ ...baseBuild, outfile: fixedOutput });
// A virtual negative control restores only the previous two default-binding
// expressions. Repository/provider source is never modified by this probe.
await esbuild.build({
  ...baseBuild,
  outfile: priorOutput,
  plugins: [
    {
      name: "prior-default-fetch-binding-negative-control",
      setup(build) {
        build.onLoad(
          { filter: /\/apps\/api\/src\/reasoningProvider\.ts$/ },
          async ({ path }) => {
            const source = await readFile(path, "utf8");
            const expression =
              /options\.fetchImpl \?\? \(\(input, init\) => fetch\(input, init\)\)/g;
            assert.equal(
              [...source.matchAll(expression)].length,
              2,
              "Both fixed provider defaults must be present before constructing the prior-binding control.",
            );
            return {
              contents: source.replace(
                expression,
                "options.fetchImpl ?? fetch",
              ),
              loader: "ts",
              resolveDir: resolve("apps/api/src"),
            };
          },
        );
      },
    },
  ],
});

async function runtime(code, name) {
  const outgoing = [];
  const mf = new Miniflare({
    workers: [
      {
        config: {
          name,
          domains: ["localhost"],
          compatibilityDate: "2026-11-01",
          manifest: {
            mainModule: "index.mjs",
            modulesRoot: "/",
            modules: { "index.mjs": { type: "esm", contents: code } },
          },
        },
        dev: {
          outboundService: {
            type: "fetcher",
            handler: async (request) => {
              const url = new URL(request.url);
              const body = await request.json().catch(() => null);
              const headers = Object.fromEntries(request.headers);
              outgoing.push({
                url: url.href,
                method: request.method,
                headers,
                body,
              });
              // This handler never calls fetch, connects a socket or forwards a request.
              // Unexpected destinations fail closed inside the local HTTP fixture.
              if (body?.model === model + "-redirect")
                return new Response(null, {
                  status: 302,
                  headers: {
                    location: "https://must-not-follow.invalid/provider",
                  },
                });
              if (url.href === "https://api.anthropic.com/v1/messages") {
                const feedback =
                  body.messages.at(-1)?.content?.[0]?.type === "tool_result";
                return Response.json({
                  stop_reason: feedback ? "end_turn" : "tool_use",
                  content: feedback
                    ? [
                        {
                          type: "text",
                          text: "Native fixture callback failed; no action success is invented.",
                        },
                      ]
                    : [
                        {
                          type: "tool_use",
                          id: "native-actual-tool-19",
                          name: "setLipColor",
                          input: { color: "#b35b6b" },
                        },
                      ],
                  usage: { input_tokens: 90, output_tokens: 30 },
                });
              }
              if (url.href === "https://api.openai.com/v1/chat/completions") {
                const feedback = body.messages.at(-1)?.role === "tool";
                return Response.json({
                  choices: [
                    {
                      finish_reason: feedback ? "stop" : "tool_calls",
                      message: feedback
                        ? {
                            content:
                              "Compatible fixture callback failed; no action success is invented.",
                          }
                        : {
                            content: "",
                            tool_calls: [
                              {
                                id: "compatible-actual-tool-23",
                                type: "function",
                                function: {
                                  name: "setLipColor",
                                  arguments: JSON.stringify({
                                    color: "#b35b6b",
                                  }),
                                },
                              },
                            ],
                          },
                    },
                  ],
                  usage: { prompt_tokens: 90, completion_tokens: 30 },
                });
              }
              return Response.json(
                { error: "Unexpected fixture outbound destination" },
                { status: 500 },
              );
            },
          },
        },
      },
    ],
    cf: false,
  });
  const worker = await mf.getWorker(name);
  async function probe(input) {
    const response = await worker.fetch("https://localhost/probe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return { status: response.status, body: await response.json() };
  }
  return { mf, outgoing, probe };
}

const prior = await runtime(
  await readFile(priorOutput, "utf8"),
  "reasoning-prior-binding-control",
);
try {
  for (const compatible of [false, true]) {
    const result = await prior.probe({ compatible });
    check(
      result.status === 500 &&
        result.body.name === "TypeError" &&
        /illegal invocation/i.test(result.body.error),
      `${compatible ? "compatible" : "Anthropic"} prior property-bound native fetch reproduces actual workerd Illegal invocation`,
    );
  }
  check(
    prior.outgoing.length === 0,
    "prior-binding control fails before any outbound HTTP dispatch",
  );
} finally {
  await prior.mf.dispose();
}

const code = await readFile(fixedOutput, "utf8");
const fixed = await runtime(code, "reasoning-default-fetch-fixed");
try {
  const native = await fixed.probe({});
  assert.equal(native.status, 200, JSON.stringify(native.body));
  check(
    native.status === 200 &&
      native.body.result.calls[0].id === "native-actual-tool-19",
    "actual Anthropic provider default global fetch reaches scripted HTTP and parses tool_use in workerd",
  );
  const nativeRequest = fixed.outgoing.at(-1);
  check(
    nativeRequest.url === "https://api.anthropic.com/v1/messages" &&
      nativeRequest.method === "POST" &&
      nativeRequest.headers["x-api-key"] === fixtureKey &&
      nativeRequest.headers["anthropic-version"] === "2026-10-21",
    "default native endpoint and actual authentication/version headers reach the local outbound HTTP service",
  );
  check(
    nativeRequest.body.model === model &&
      nativeRequest.body.max_tokens === 256 &&
      nativeRequest.body.thinking.type === "disabled" &&
      nativeRequest.body.tools[0].input_schema.properties.color.pattern ===
        "^#[0-9a-f]{6}$" &&
      nativeRequest.body.tool_choice.disable_parallel_tool_use === true,
    "native default-fetch HTTP payload preserves model/token/tool schema and single-tool policy",
  );
  const nativeFeedback = await fixed.probe({ feedback: true });
  check(
    nativeFeedback.status === 200 &&
      nativeFeedback.body.result.calls.length === 0 &&
      fixed.outgoing.at(-1).body.messages.at(-1).content[0].tool_use_id ===
        "native-actual-tool-19" &&
      fixed.outgoing.at(-1).body.messages.at(-1).content[0].is_error === true,
    "native default-fetch continuation preserves actual tool_result ID and callback failure",
  );
  const compatible = await fixed.probe({ compatible: true });
  check(
    compatible.status === 200 &&
      compatible.body.result.calls[0].id === "compatible-actual-tool-23",
    "actual compatible provider default global fetch reaches scripted HTTP and parses tool_calls in workerd",
  );
  const compatibleRequest = fixed.outgoing.at(-1);
  check(
    compatibleRequest.url === "https://api.openai.com/v1/chat/completions" &&
      compatibleRequest.headers.authorization === `Bearer ${fixtureKey}` &&
      compatibleRequest.body.model === model &&
      compatibleRequest.body.max_completion_tokens === 256 &&
      compatibleRequest.body.store === false &&
      compatibleRequest.body.parallel_tool_calls === false,
    "compatible default endpoint/authentication and bounded nonstored single-tool payload reach local HTTP",
  );
  const compatibleFeedback = await fixed.probe({
    compatible: true,
    feedback: true,
  });
  check(
    compatibleFeedback.status === 200 &&
      compatibleFeedback.body.result.calls.length === 0 &&
      fixed.outgoing.at(-1).body.messages.at(-1).tool_call_id ===
        "compatible-actual-tool-23",
    "compatible default-fetch continuation preserves actual tool-call ID",
  );
  check(
    fixed.outgoing.length === 4,
    "four completions produce exactly four local HTTP requests with no automatic retries",
  );
  for (const compatible of [false, true]) {
    const before = fixed.outgoing.length;
    const redirected = await fixed.probe({ compatible, redirect: true });
    check(
      redirected.status === 500 &&
        /could not complete/.test(redirected.body.error) &&
        fixed.outgoing.length === before + 1,
      `${compatible ? "compatible" : "Anthropic"} default native fetch rejects a scripted HTTP redirect without following it`,
    );
  }

  const evidence = {
    executedAt: new Date().toISOString(),
    runtime: "actual local workerd via Miniflare",
    scope:
      "default native global-fetch binding regression for both actual reasoning provider classes; outboundService scripts HTTP responses locally; no injected fetchImpl and no external traffic",
    externalProviderCalls: 0,
    personalImages: 0,
    realCredentialsUsed: false,
    defaultFetchInjected: false,
    defaultEndpointsOverridden: false,
    priorBindingNegativeControl: {
      expectedIllegalInvocationFailures: 2,
      outboundRequests: prior.outgoing.length,
      repositorySourceMutated: false,
    },
    localScriptedHttpRequests: fixed.outgoing.length,
    assertions,
    passingAssertions: assertions.length,
    bundleBytes: Buffer.byteLength(code),
  };
  await writeFile(
    resolve("apps/edge/evidence/reasoning-default-fetch-workerd.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await fixed.mf.dispose();
}
