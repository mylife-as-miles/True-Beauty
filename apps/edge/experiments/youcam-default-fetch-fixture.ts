/** Pure provider runtime fixture. Miniflare outboundService supplies every response.
 * Constructors intentionally use production DEFAULT fetch: no injected transport. */
import { YouCamTransport } from "../../api/src/youcamTransport";
import { PerfectCorpProvider } from "../../api/src/youcamSkinProvider";
import { YouCamGenerationProvider } from "../../api/src/generationProvider";
const KEY = "non-secret-default-fetch-fixture";
const bytes = new Uint8Array(120);
bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/redirect-check") {
      try {
        await new YouCamTransport(KEY).json("/s2s/v2.0/redirect-fixture");
        return Response.json({ redirectRejected: false });
      } catch {
        return Response.json({ redirectRejected: true });
      }
    }
    if (new URL(request.url).pathname === "/negative-control") {
      // Reproduce the old receiver bug, without editing the production transport.
      const wrong = { request: fetch };
      try {
        await wrong.request(
          "https://yce-api-01.makeupar.com/s2s/v2.0/credit/feature-cost",
        );
        return Response.json({ illegalReceiverRejected: false });
      } catch (error) {
        return Response.json({
          illegalReceiverRejected:
            error instanceof TypeError &&
            /Illegal invocation/i.test(error.message),
        });
      }
    }
    const transport = new YouCamTransport(KEY);
    const prices = await transport.pricing("/s2s/v2.1/task/skin-analysis");
    const file = await transport.upload(bytes, "image/png");
    const status = await transport.json(
      "/s2s/v2.1/task/skin-analysis/fixture-task",
    );
    const image = await transport.image(
      "https://yce-us.s3-accelerate.amazonaws.com/fixture-output.png",
    );
    const skin = new PerfectCorpProvider(KEY);
    const skinPrices = await skin.pricing();
    const skinId = await skin.create(bytes, "image/png", ["texture"], false);
    const skinStatus = await skin.status(skinId);
    const generation = new YouCamGenerationProvider(KEY);
    const hairPrices = await generation.pricing("hair");
    const hairId = await generation.create({
      source: { bytes, contentType: "image/png" },
      spec: { feature: "hair", hairColor: "src", templateId: "fixture-bob" },
    });
    const hairStatus = await generation.status("hair", hairId);
    const hairImage = await generation.image(hairStatus.url!);
    const clothingId = await generation.create({
      source: { bytes, contentType: "image/png" },
      reference: { bytes, contentType: "image/png" },
      spec: {
        feature: "clothing",
        garmentCategory: "upper_body",
        changeShoes: false,
        filterMultiPerson: "strict",
      },
    });
    const clothingStatus = await generation.status("clothing", clothingId);
    return Response.json({
      defaultFetch: true,
      injectedFetch: false,
      transport: {
        pricingRows: prices.length,
        fileRegistered: file.startsWith("fixture-file-"),
        taskStatus: (status.data as Record<string, unknown>).task_status,
        imageType: image.contentType,
        imageBytes: image.bytes.length,
      },
      skin: {
        pricingRows: skinPrices.length,
        taskCreated: skinId === "fixture-created-skin",
        status: skinStatus.task_status,
      },
      hair: {
        pricingRows: hairPrices.length,
        taskCreated: hairId === "fixture-created-hair",
        status: hairStatus.status,
        imageType: hairImage.contentType,
        imageBytes: hairImage.bytes.length,
      },
      clothing: {
        taskCreated: clothingId === "fixture-created-clothing",
        status: clothingStatus.status,
      },
    });
  },
};
