import { useCallback, useEffect, useState } from "react";
import "./CloudApproval.css";
interface Access {
  quoteId: string;
  approved: boolean;
  hosted: boolean;
  operator?: boolean;
  reason: string;
}
async function cloudJson(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...init,
  });
  if (response.status === 404) return null;
  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error("Cloud access could not be checked.");
  }
  if (!response.ok)
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "Cloud access is unavailable.",
    );
  return value;
}
/** Owner approval concerns sponsored credits; it never replaces upload consent. */
export function useCloudApproval(quoteId: string | undefined) {
  const [state, setState] = useState<Access | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    if (!quoteId) return;
    setBusy(true);
    setError("");
    try {
      const session = await cloudJson("/api/session");
      if (!session?.csrfToken)
        throw new Error("Cloud session could not be opened.");
      if (session.hosted !== true) {
        setState({
          quoteId,
          approved: true,
          hosted: false,
          reason: "Local operator session.",
        });
        return;
      }
      const value = await cloudJson(
        "/api/access/quotes/" + encodeURIComponent(quoteId),
      );
      if (value === null) throw new Error("Cloud approval is unavailable.");
      setState({ ...value, quoteId });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Cloud access could not be checked.",
      );
      setState({
        quoteId,
        approved: false,
        hosted: true,
        reason: "Access has not been approved.",
      });
    } finally {
      setBusy(false);
    }
  }, [quoteId]);
  useEffect(() => {
    setState(null);
    setError("");
    if (quoteId) void refresh();
  }, [quoteId, refresh]);
  const requestApproval = async () => {
    if (!quoteId) return;
    setBusy(true);
    setError("");
    try {
      const session = await cloudJson("/api/session");
      if (!session?.csrfToken) throw new Error("Open a cloud session first.");
      const result = await cloudJson(
        "/api/access/requests/" + encodeURIComponent(quoteId),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: "{}",
        },
      );
      if (result)
        setState({
          ...result,
          quoteId,
          hosted: true,
          reason: result.approved
            ? "This quote is approved."
            : "Approval requested. No image, prompt or paid task has been sent.",
        });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Approval could not be requested.",
      );
    } finally {
      setBusy(false);
    }
  };
  return {
    approved:
      !!quoteId && state?.quoteId === quoteId && state?.approved === true,
    visible:
      !!quoteId && !(state?.quoteId === quoteId && state?.hosted === false),
    state: state?.quoteId === quoteId ? state : null,
    error,
    busy,
    refresh,
    requestApproval,
  };
}
export function CloudApproval({
  access,
}: {
  access: ReturnType<typeof useCloudApproval>;
}) {
  if (!access.visible) return null;
  return (
    <div
      className="cloud-approval"
      role="region"
      aria-label="Sponsored cloud access"
    >
      <strong>
        {access.state?.approved
          ? "Cloud credits approved"
          : "Sponsored cloud credits"}
      </strong>
      <p>{access.state?.reason ?? "Checking this quote’s cloud access…"}</p>
      {!access.state?.approved && (
        <>
          <p>
            The Site owner approves each sponsored request. Your separate upload
            and spending consent are still required.
          </p>
          <div className="cloud-approval-actions">
            <button
              className="button secondary"
              disabled={access.busy}
              onClick={() => void access.requestApproval()}
            >
              Request approval
            </button>
            <button
              className="text-action"
              disabled={access.busy}
              onClick={() => void access.refresh()}
            >
              Check approval
            </button>
          </div>
        </>
      )}
      {access.error && <p role="alert">{access.error}</p>}
    </div>
  );
}
export default function CloudAccessPanel() {
  const [status, setStatus] = useState<{ operator: boolean } | null>(null),
    [requests, setRequests] = useState<
      Array<{
        id: string;
        operation: string;
        credits: number;
        usdMicro: number;
        expiresAt: number;
      }>
    >([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await cloudJson("/api/session");
      const current = await cloudJson("/api/operator/status");
      setStatus(current);
      if (current?.operator) {
        const list = await cloudJson("/api/operator/approvals");
        setRequests(list?.requests ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cloud access is unavailable.");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const approve = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const session = await cloudJson("/api/session");
      await cloudJson(
        "/api/operator/approvals/" + encodeURIComponent(id) + "/approve",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": session.csrfToken,
          },
          body: "{}",
        },
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
      setBusy(false);
    }
  };
  return (
    <section className="cloud-access-panel" aria-label="Cloud access">
      <h3>Cloud access</h3>
      <p>
        Your mirror and local collections work without an account. Remote
        analysis and generation use separately approved cloud credits.
      </p>
      {status?.operator ? (
        <>
          <p>
            You can approve an exact request here. Approval does not upload a
            photograph or start a paid task.
          </p>
          {requests.length ? (
            <ul>
              {requests.map((q) => (
                <li key={q.id}>
                  <div>
                    <strong>
                      {q.operation === "reasoning"
                        ? "Beauty reasoning"
                        : q.operation === "skin"
                          ? "Skin analysis"
                          : q.operation === "hair"
                            ? "Hairstyle preview"
                            : "Clothing preview"}
                    </strong>
                    <p>
                      {q.credits
                        ? q.credits + " provider credits"
                        : "Up to US$" + (q.usdMicro / 1000000).toFixed(6)}{" "}
                      · expires {new Date(q.expiresAt).toLocaleTimeString()}
                    </p>
                    <code>{q.id}</code>
                  </div>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void approve(q.id)}
                  >
                    Approve request
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p>No cloud requests are waiting.</p>
          )}
        </>
      ) : (
        <p>
          Sponsored requests require the Site owner’s approval. Request a quote
          in the relevant studio, then use its approval controls.
        </p>
      )}
      <button
        className="text-action"
        disabled={busy}
        onClick={() => void refresh()}
      >
        Refresh cloud access
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
