import Fastify from "fastify";
import { handleAsNodeRequest } from "cloudflare:node";
let app;
export default {
  async fetch(request) {
    try {
      if (!app) {
        app = Fastify({ logger: false });
        app.get("/health", async () => ({
          ok: true,
          engine: "real-fastify-node-http",
          version: app.version,
        }));
        app.post("/echo", async (req) => ({
          body: req.body,
          header: req.headers["x-probe"],
        }));
        await app.listen({ port: 8789 });
      }
      return await handleAsNodeRequest(8789, request);
    } catch (error) {
      app = undefined;
      return Response.json(
        { name: error.name, error: error.message, stack: error.stack },
        { status: 500 },
      );
    }
  },
};
