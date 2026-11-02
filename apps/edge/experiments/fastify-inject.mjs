import Fastify from "fastify";
let app;
export default {
  async fetch(request) {
    try {
      if (!app) {
        app = Fastify({ logger: false });
        app.get("/health", async () => ({
          ok: true,
          engine: "real-fastify-inject",
          version: app.version,
        }));
        app.post("/echo", async (req) => ({
          body: req.body,
          header: req.headers["x-probe"],
        }));
        await app.ready();
      }
      const started = performance.now(),
        url = new URL(request.url);
      const response = await app.inject({
        method: request.method,
        url: url.pathname + url.search,
        headers: Object.fromEntries(request.headers),
        ...(request.method === "GET" || request.method === "HEAD"
          ? {}
          : { payload: await request.text() }),
      });
      return new Response(response.rawPayload, {
        status: response.statusCode,
        headers: {
          ...response.headers,
          "x-probe-ms": String(performance.now() - started),
        },
      });
    } catch (error) {
      app = undefined;
      return Response.json(
        { name: error.name, error: error.message, stack: error.stack },
        { status: 500 },
      );
    }
  },
};
