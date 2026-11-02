import { createServer } from "node:http";
import { httpServerHandler } from "cloudflare:node";
const server = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.end(
    JSON.stringify({
      ok: true,
      engine: "actual-cloudflare-node-http",
      method: req.method,
      url: req.url,
    }),
  );
});
export default httpServerHandler(server);
