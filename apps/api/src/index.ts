import { createApi } from "./server";
const app = createApi();
await app.listen({
  host: process.env.API_HOST ?? "127.0.0.1",
  port: Number(process.env.API_PORT ?? 3001),
});
console.log(
  "True Beauty API ready. Paid features require configured pricing and explicit consent.",
);
