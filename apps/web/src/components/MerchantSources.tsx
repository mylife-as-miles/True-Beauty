import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowUpRight,
  RefreshCw,
  Clock,
  Plus,
  ShieldCheck,
} from "lucide-react";
import {
  MERCHANT_SOURCES,
  trustedObservation,
  observationState,
  formatPrice,
  type MerchantObservation,
  type MerchantRefreshResult,
} from "../../../../packages/commerce-engine/src";
import { db } from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import "./MerchantSources.css";
export default function MerchantSources({
  productId,
  onAddQuote,
}: {
  productId?: string;
  onAddQuote?: (quote: MerchantObservation) => Promise<unknown>;
}) {
  const first =
    MERCHANT_SOURCES.flatMap((s) => s.references).find(
      (r) => r.catalogProductId === productId,
    ) ?? MERCHANT_SOURCES[0]?.references[0];
  const [referenceId, setReferenceId] = useState(first?.id ?? ""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [sourceUrl, setSourceUrl] = useState("");
  const notify = useApp((s) => s.notify);
  const all = useLiveQuery(() => db.priceSnapshots.toArray(), []) ?? [];
  const reference = MERCHANT_SOURCES.flatMap((s) => s.references).find(
      (r) => r.id === referenceId,
    ),
    source = MERCHANT_SOURCES.find((s) => s.id === reference?.sourceId);
  const rows = useMemo(() => {
    const safe = all
      .map((record) => trustedObservation(record.observation))
      .filter(
        (o): o is MerchantObservation => !!o && o.referenceId === referenceId,
      );
    const latest = safe.reduce(
      (value, o) => (o.fetchedAt > value ? o.fetchedAt : value),
      "",
    );
    return safe
      .filter((o) => o.fetchedAt === latest)
      .map((o) => ({
        ...o,
        imported:
          o.imported || all.find((row) => row.id === o.id)?.imported === true,
      }));
  }, [all, referenceId]);
  const refresh = async () => {
    if (!reference) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sessionResponse = await fetch("/api/session", {
        credentials: "same-origin",
      });
      if (!sessionResponse.ok)
        throw new Error(
          "Source service unavailable. Your saved observations remain on this device.",
        );
      const session = await sessionResponse.json();
      if (typeof session.csrfToken !== "string")
        throw new Error("The source service session could not be opened.");
      const response = await fetch("/api/merchants/refresh", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({
          sourceId: reference.sourceId,
          referenceId: reference.id,
        }),
      });
      const result = (await response.json()) as MerchantRefreshResult & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(
          result.error ?? "The merchant source could not be checked.",
        );
      if (!Array.isArray(result.observations) || !result.observations.length)
        throw new Error("The source returned no supported observation.");
      const checked = result.observations.map((o) => trustedObservation(o));
      if (checked.some((o) => !o || o.referenceId !== reference.id))
        throw new Error(
          "The source response did not match the reviewed product.",
        );
      await db.transaction("rw", db.priceSnapshots, async () => {
        for (const observation of checked) {
          if (!observation) continue;
          await db.priceSnapshots.put({
            id: observation.id,
            productId: `merchant:${observation.sourceId}:${observation.referenceId}`,
            observedAt: observation.fetchedAt,
            createdAt: Date.parse(observation.fetchedAt),
            kind: "merchant-observation",
            observation,
            imported: false,
          });
        }
        const records = await db.priceSnapshots
          .filter(
            (r) =>
              r.kind === "merchant-observation" &&
              (r.observation as MerchantObservation)?.referenceId ===
                reference.id,
          )
          .toArray();
        const times = [...new Set(records.map((r) => String(r.observedAt)))]
          .sort()
          .reverse();
        const keep = new Set(times.slice(0, 5));
        await db.priceSnapshots.bulkDelete(
          records
            .filter((r) => !keep.has(String(r.observedAt)))
            .map((r) => r.id),
        );
      });
      setMessage(
        result.cached
          ? "Saved source observation reused from the service cache. Its original fetch time is shown."
          : "Public product-page facts checked and saved on this device.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to reach the merchant source.",
      );
    } finally {
      setBusy(false);
    }
  };
  const resolveUrl = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const sessionResponse = await fetch("/api/session", {
        credentials: "same-origin",
      });
      if (!sessionResponse.ok)
        throw new Error(
          "Source checks are unavailable. Saved observations remain on this device.",
        );
      const session = await sessionResponse.json();
      const response = await fetch("/api/merchants/resolve", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": session.csrfToken,
        },
        body: JSON.stringify({ url: sourceUrl.trim() }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "This product link is not supported.");
      if (
        !MERCHANT_SOURCES.flatMap((s) => s.references).some(
          (r) => r.id === result.referenceId && r.sourceId === result.sourceId,
        )
      )
        throw new Error("This product link did not match a reviewed source.");
      setReferenceId(result.referenceId);
      setMessage(
        "Supported product selected. Use Check current source to request its public page.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to resolve this link.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="merchant-sources"
      aria-label="Merchant source observations"
    >
      <div className="merchant-intro">
        <ShieldCheck size={22} />
        <div>
          <h3>From the source.</h3>
          <p>
            A small, reviewed set of official product pages. Check a price,
            inspect its date, then confirm with the merchant.
          </p>
        </div>
      </div>
      <label className="merchant-source-label">
        Official product page
        <select
          aria-label="Official merchant product"
          value={referenceId}
          onChange={(e) => {
            setReferenceId(e.target.value);
            setMessage("");
            setError("");
          }}
        >
          {MERCHANT_SOURCES.map((s) => (
            <optgroup label={`${s.name} · ${s.region}`} key={s.id}>
              {s.references.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <details className="merchant-url-intake">
        <summary>Use a supported official product link</summary>
        <label>
          Product URL
          <input
            type="url"
            aria-label="Supported official product URL"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
            placeholder="https://…"
          />
        </label>
        <button
          className="button secondary"
          disabled={busy || !sourceUrl.trim()}
          onClick={() => void resolveUrl()}
        >
          Use this source
        </button>
        <p>
          Only the exact product pages in the selector are supported. Other URLs
          are rejected before any merchant request.
        </p>
      </details>
      {source && <p className="merchant-source-note">{source.note}</p>}
      <div className="merchant-actions">
        <button
          className="button secondary"
          onClick={() => void refresh()}
          disabled={busy || !reference}
        >
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          {busy ? "Checking public source…" : "Check current source"}
        </button>
        {reference && (
          <a href={reference.url} target="_blank" rel="noreferrer">
            Open official page <ArrowUpRight size={14} />
          </a>
        )}
      </div>
      <p className="merchant-privacy">
        This requests public product facts through our service. It sends no
        photo, profile, budget or beauty history. No order is placed. Successful
        checks are cached for 15 minutes.
      </p>
      {error && (
        <p role="alert" className="merchant-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="merchant-message">
          {message}
        </p>
      )}
      {rows.length ? (
        <div className="merchant-observations">
          {rows.map((o) => {
            const state = observationState(o);
            return (
              <article
                key={o.id}
                className={`merchant-observation ${o.status === "unavailable" ? "unavailable" : ""}`}
              >
                <div className="merchant-observation-top">
                  <span>{state.label}</span>
                  <span className={`merchant-stock ${o.availability}`}>
                    {o.availability === "in-stock"
                      ? "Merchant reported in stock"
                      : o.availability === "out-of-stock"
                        ? "Merchant reported out of stock"
                        : "Stock unknown"}
                  </span>
                </div>
                <h4>{o.title}</h4>
                <p className="merchant-variant">
                  {o.variantName ?? `Offer ${o.variantId}`}
                </p>
                <div className="merchant-quote">
                  <strong>
                    {state.hasPrice
                      ? formatPrice(o.amount!, o.currency!)
                      : "Price unavailable"}
                  </strong>
                  {state.hasPrice && (
                    <span>{o.currency} · no currency conversion</span>
                  )}
                </div>
                <p className="merchant-fetched">
                  <Clock size={12} />
                  Fetched{" "}
                  {new Date(o.fetchedAt).toLocaleString(undefined, {
                    timeZoneName: "short",
                  })}
                  {o.validUntil && (
                    <> · source price-valid-until {o.validUntil}</>
                  )}
                </p>
                <p className="merchant-observation-note">{o.note}</p>
                {state.imported && (
                  <p className="merchant-warning">
                    This record came from a backup. Refresh the source before
                    relying on it.
                  </p>
                )}
                {state.stale && (
                  <p className="merchant-warning">
                    This observation is old or its source price validity
                    expired. Price and availability need a fresh check.
                  </p>
                )}
                <div className="merchant-card-actions">
                  <a href={o.sourceUrl} target="_blank" rel="noreferrer">
                    Verify with {o.merchant}
                    <ArrowUpRight size={13} />
                  </a>
                  {onAddQuote && state.hasPrice && o.status === "observed" && (
                    <button
                      disabled={
                        state.stale ||
                        state.imported ||
                        o.availability === "out-of-stock"
                      }
                      onClick={() =>
                        void onAddQuote(o)
                          .then(() =>
                            notify(
                              "Observed quote saved to your planning bag. No order has been placed.",
                            ),
                          )
                          .catch((e) =>
                            notify(
                              e instanceof Error
                                ? e.message
                                : "Unable to save this quote.",
                            ),
                          )
                      }
                    >
                      <Plus size={14} />
                      Add planning quote
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="merchant-empty">
          <Clock size={23} />
          <p>
            No saved source observation for this product yet. Use Check current
            source to request its public page.
          </p>
        </div>
      )}
      <p className="merchant-disclosure">
        Source observations are separate from the sample catalogue. Structured
        data can lag behind a merchant’s checkout, and taxes, delivery, region
        restrictions and final prices may differ. We have no merchant
        partnership and do not reserve stock or complete purchases.
      </p>
    </section>
  );
}
