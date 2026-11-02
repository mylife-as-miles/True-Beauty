/** Transport-independent, bounded public merchant documents. No Node or storage imports. */
import {
  parseMerchantHtml,
  type MerchantSource,
  type MerchantReference,
} from "../../../packages/commerce-engine/src/merchant";
const USER_AGENT =
  "TrueBeautyReference/0.1 (user-initiated public product fact lookup)";
const MAX_BYTES = 2500000;
/** Minimal robots matching for the actual fixed product paths; most-specific applicable agent and path rule wins. */
export function robotsAllows(
  text: string,
  path: string,
  agent = "TrueBeautyReference",
): boolean {
  const groups: Array<{
    agents: string[];
    rules: Array<{ allow: boolean; path: string }>;
  }> = [];
  let group = {
    agents: [] as string[],
    rules: [] as Array<{ allow: boolean; path: string }>,
  };
  let hasRules = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const key = match[1].trim().toLowerCase(),
      value = match[2].trim();
    if (key === "user-agent") {
      if (hasRules) {
        groups.push(group);
        group = { agents: [], rules: [] };
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
    } else if ((key === "allow" || key === "disallow") && group.agents.length) {
      hasRules = true;
      if (value) group.rules.push({ allow: key === "allow", path: value });
    }
  }
  if (group.agents.length) groups.push(group);
  const id = agent.toLowerCase();
  const matches = groups.flatMap((g) =>
    g.agents
      .filter((a) => a === "*" || id.includes(a))
      .map((a) => ({ group: g, weight: a === "*" ? 0 : a.length })),
  );
  if (!matches.length) return true;
  const best = Math.max(...matches.map((m) => m.weight));
  const rules = matches
    .filter((m) => m.weight === best)
    .flatMap((m) => m.group.rules)
    .filter((rule) => {
      const escaped = rule.path
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*")
        .replace(/\\\$$/, "$");
      try {
        return new RegExp("^" + escaped).test(path);
      } catch {
        return false;
      }
    })
    .sort(
      (a, b) =>
        b.path.replace(/\*/g, "").length - a.path.replace(/\*/g, "").length ||
        Number(b.allow) - Number(a.allow),
    );
  return rules[0]?.allow ?? true;
}
async function boundedText(
  response: Response,
  limit = MAX_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > limit) {
    await response.body?.cancel();
    throw new Error("Page exceeds size limit");
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new Error("Page exceeds size limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(joined);
}

export async function getMerchantDocument(
  url: string,
  options: { fetcher?: typeof fetch; limit?: number } = {},
) {
  const response = await (options.fetcher ?? fetch)(url, {
    method: "GET",
    redirect: "manual",
    credentials: "omit",
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html, text/plain;q=0.9",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new Error(
      "The official source redirected; its new URL requires review",
    );
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Official source returned HTTP ${response.status}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (type && !/text\/(?:html|plain)|application\/xhtml\+xml/i.test(type)) {
    await response.body?.cancel();
    throw new Error("The official source returned an unsupported document");
  }
  return boundedText(response, options.limit ?? MAX_BYTES);
}
export async function readMerchantReference(
  source: MerchantSource,
  reference: MerchantReference,
  options: { robotsText: string; fetcher?: typeof fetch; now?: () => number },
) {
  const url = new URL(reference.url);
  if (
    !source.enabled ||
    url.protocol !== "https:" ||
    url.origin !== source.origin ||
    url.username ||
    url.password ||
    url.port ||
    url.search ||
    url.hash ||
    !source.references.some(
      (r) => r.id === reference.id && r.url === reference.url,
    )
  )
    throw new Error(
      "This merchant product is not on the reviewed source list.",
    );
  if (!robotsAllows(options.robotsText, url.pathname))
    throw new Error(
      "The official source robots policy does not permit this product lookup",
    );
  const html = await getMerchantDocument(reference.url, {
    fetcher: options.fetcher,
  });
  const fetchedAt = new Date((options.now ?? Date.now)()).toISOString();
  return {
    fetchedAt,
    observations: parseMerchantHtml(html, source, reference, fetchedAt),
  };
}
