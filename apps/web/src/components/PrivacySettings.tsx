import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Download,
  Upload,
  ShieldCheck,
  Trash2,
  Check,
  LockKeyhole,
  Pencil,
  Save,
} from "lucide-react";
import {
  db,
  CONSENT_SCOPES,
  setConsent,
  initializeDatabase,
  clearLocalData,
  exportLocalData,
  importLocalData,
  encryptBackup,
  decryptBackup,
  localProfileId,
  type ConsentScope,
  type MemoryNode,
  type Currency,
} from "../../../../packages/local-database/src";
import {
  rememberPreference,
  reviseMemory,
  forgetMemory,
  purgeExpiredMemories,
} from "../../../../packages/beauty-memory/src";
import { useApp } from "../state/store";
import { Modal, Empty } from "./ui";
import "./PrivacySettings.css";

const permissionLabels: Record<
  ConsentScope,
  { title: string; description: string }
> = {
  "memory.preferences": {
    title: "Remember my preferences",
    description:
      "Save only the preferences you explicitly ask the agent to remember.",
  },
  "memory.history": {
    title: "Consultation history",
    description:
      "Keep agent requests, replies and tool records on this browser.",
  },
  "analysis.history": {
    title: "Skin-analysis history",
    description:
      "Allow you to save provider observations for later comparison.",
  },
  "media.photos": {
    title: "Saved photographs",
    description:
      "Allow explicit photo saves. Camera frames are never saved in the background.",
  },
  "remote.images": {
    title: "External image processing",
    description:
      "Permit image-processing requests after a separate upload review. This does not authorize paid calls.",
  },
  "remote.history": {
    title: "External reasoning context",
    description:
      "Allow a future configured assistant to use selected history after a separate review. No provider is currently connected.",
  },
};

function MemoryRow({
  node,
  onError,
}: {
  node: MemoryNode;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false),
    [value, setValue] = useState(
      typeof node.value === "string" ? node.value : JSON.stringify(node.value),
    );
  const revisions = useLiveQuery(
    () =>
      db.memoryRevisions.where("nodeId").equals(node.id).sortBy("createdAt"),
    [node.id],
    [],
  );
  async function save() {
    try {
      const corrected =
        typeof node.value === "string" ? value : JSON.parse(value);
      if (
        typeof node.value === "number" &&
        (typeof corrected !== "number" || !Number.isFinite(corrected))
      )
        throw new Error("Use a valid number for this preference");
      if (typeof node.value === "boolean" && typeof corrected !== "boolean")
        throw new Error("Use true or false for this preference");
      await reviseMemory(node.id, corrected);
      setEditing(false);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Memory could not be updated",
      );
    }
  }
  async function remove() {
    try {
      await forgetMemory(node.id);
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Memory could not be deleted",
      );
    }
  }
  const active = !node.validUntil || node.validUntil > Date.now();
  return (
    <div className={`memory-record ${active ? "" : "superseded"}`}>
      <div className="memory-record-title">
        <strong>{node.key.replaceAll("-", " ")}</strong>
        <span>
          {active ? "Current" : "Superseded"} · revision {node.revision}
        </span>
      </div>
      {editing ? (
        <div className="memory-edit">
          <label className="sr-only" htmlFor={`memory-${node.id}`}>
            Corrected value
          </label>
          <textarea
            id={`memory-${node.id}`}
            rows={2}
            value={value}
            maxLength={2000}
            onChange={(event) => setValue(event.target.value)}
          />
          <button className="button secondary" onClick={() => void save()}>
            <Save size={14} /> Save correction
          </button>
          <button className="text-action" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <p>
          {typeof node.value === "string"
            ? node.value
            : JSON.stringify(node.value)}
        </p>
      )}
      <small>
        {node.source} · {new Date(node.createdAt).toLocaleDateString()} ·{" "}
        {Math.round(node.confidence * 100)}% confidence ·{" "}
        {node.retentionPolicy.replaceAll("-", " ")}
      </small>
      {node.evidenceRefs.length > 0 && (
        <small>Evidence: {node.evidenceRefs.join(", ")}</small>
      )}
      {revisions.length > 1 && (
        <details className="memory-revisions">
          <summary>Revision history</summary>
          {revisions.map((revision) => (
            <div key={revision.id}>
              <small>
                Revision {revision.revision} · {revision.source} ·{" "}
                {new Date(revision.createdAt).toLocaleDateString()}
              </small>
              <p>
                {typeof revision.value === "string"
                  ? revision.value
                  : JSON.stringify(revision.value)}
              </p>
            </div>
          ))}
        </details>
      )}
      <div className="memory-record-actions">
        {active && !editing && (
          <button onClick={() => setEditing(true)}>
            <Pencil size={13} /> Correct
          </button>
        )}
        <button onClick={() => void remove()}>
          <Trash2 size={13} /> Forget
        </button>
      </div>
    </div>
  );
}

export function PrivacySettings() {
  const open = useApp((s) => s.settingsOpen),
    setOpen = useApp((s) => s.setSettingsOpen),
    notify = useApp((s) => s.notify);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const profile = useLiveQuery(
    () => db.profiles.get(localProfileId),
    [],
    undefined,
  );
  const consents = useLiveQuery(() => db.consents.toArray(), [], []),
    memories = useLiveQuery(
      () => db.memoryNodes.orderBy("updatedAt").reverse().toArray(),
      [],
      [],
    );
  const counts = useLiveQuery(
    async () => ({
      looks: await db.savedLooks.count(),
      photos: await db.mediaAssets.count(),
      scans: await db.skinScans.count(),
      episodes: await db.agentEpisodes.count(),
      products: await db.ownedProducts.count(),
    }),
    [],
    { looks: 0, photos: 0, scans: 0, episodes: 0, products: 0 },
  );
  const [tab, setTab] = useState<"profile" | "privacy" | "memory" | "data">(
      "privacy",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [passphrase, setPassphrase] = useState(""),
    [encrypted, setEncrypted] = useState(false),
    [deleteText, setDeleteText] = useState(""),
    [deleteOpen, setDeleteOpen] = useState(false),
    [key, setKey] = useState(""),
    [value, setValue] = useState(""),
    [retention, setRetention] =
      useState<MemoryNode["retentionPolicy"]>("until-deleted"),
    [pendingConsent, setPendingConsent] = useState<
      Partial<Record<ConsentScope, boolean>>
    >({});
  const importRef = useRef<HTMLInputElement>(null);
  const consented = (scope: ConsentScope) =>
    pendingConsent[scope] ??
    consents.some((c) => c.scope === scope && c.granted);
  useEffect(() => {
    setPendingConsent((pending) => {
      const next = { ...pending };
      for (const [scope, value] of Object.entries(pending))
        if (consents.some((c) => c.scope === scope && c.granted === value))
          delete next[scope as ConsentScope];
      return Object.keys(next).length === Object.keys(pending).length
        ? pending
        : next;
    });
  }, [consents]);
  async function updateConsent(scope: ConsentScope, granted: boolean) {
    setPendingConsent((previous) => ({ ...previous, [scope]: granted }));
    setBusy(true);
    setError("");
    try {
      await setConsent(scope, granted);
      notify(
        granted
          ? "Permission enabled"
          : "Permission revoked and associated data removed",
      );
    } catch (err) {
      setPendingConsent((previous) => {
        const next = { ...previous };
        delete next[scope];
        return next;
      });
      setError(
        err instanceof Error ? err.message : "Permission could not be changed",
      );
    } finally {
      setBusy(false);
    }
  }
  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      if (success) notify(success);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "This change could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    await run(async () => {
      let data = await exportLocalData();
      if (encrypted) data = await encryptBackup(data, passphrase);
      const blob = new Blob([data], { type: "application/json" }),
        url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      link.download = `true-beauty-${new Date().toISOString().slice(0, 10)}${encrypted ? "-encrypted" : ""}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPassphrase("");
    }, "Your backup is ready. Photos are excluded.");
  }
  async function importFile(file: File) {
    await run(async () => {
      if (file.size > 40 * 1024 * 1024)
        throw new Error("Backups must be under 40 MB");
      let text = await file.text();
      const header = JSON.parse(text) as { format?: string };
      if (header.format === "true-beauty-encrypted")
        text = await decryptBackup(text, passphrase);
      await importLocalData(text);
      await purgeExpiredMemories();
      await initializeDatabase();
      setPassphrase("");
    }, "Local backup imported. Existing privacy permissions were kept.");
  }
  async function submitMemory(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await rememberPreference(key, value, {
        consented: true,
        retentionPolicy: retention,
      });
      setKey("");
      setValue("");
    }, "Preference saved to BeautyGraph");
  }
  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const budget = Number(form.get("budget"));
      if (!Number.isFinite(budget) || budget < 0 || budget > 1000000000)
        throw new Error("Enter a budget between 0 and 1 billion");
      await db.profiles.update(localProfileId, {
        displayName:
          String(form.get("displayName")).trim().slice(0, 80) ||
          "Beauty explorer",
        skinType: String(form.get("skinType")),
        budget,
        currency: String(form.get("currency")) as Currency,
        concerns: String(form.get("concerns"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 20),
        updatedAt: Date.now(),
      });
    }, "Your local profile was updated");
  }
  if (!open) return null;
  return (
    <Modal title="Your data, your choice" onClose={close} wide>
      <div className="privacy-settings">
        <p className="settings-intro">
          <ShieldCheck size={17} /> Your profile lives on this browser. No
          account. No hidden image storage.
        </p>
        <div
          className="settings-tabs"
          role="tablist"
          aria-label="Settings section"
        >
          {(["privacy", "profile", "memory", "data"] as const).map((name) => (
            <button
              key={name}
              role="tab"
              id={`settings-tab-${name}`}
              aria-selected={tab === name}
              aria-controls={`settings-panel-${name}`}
              onClick={() => setTab(name)}
            >
              {name === "memory"
                ? "BeautyGraph"
                : name === "data"
                  ? "Data & backup"
                  : name === "profile"
                    ? "Beauty profile"
                    : "Permissions"}
            </button>
          ))}
        </div>
        {error && (
          <div className="settings-error" role="alert">
            {error}
          </div>
        )}
        <div
          role="tabpanel"
          id={`settings-panel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          className="settings-panel"
        >
          {tab === "privacy" && (
            <>
              <h3>Keep what matters to you.</h3>
              <p>
                Every category starts off. Turning one off deletes the
                corresponding stored data. Uploading an image and authorizing a
                cost always require a separate action.
              </p>
              <div className="consent-list">
                {CONSENT_SCOPES.map((scope) => (
                  <label className="consent-item" key={scope}>
                    <span>
                      <strong>{permissionLabels[scope].title}</strong>
                      <small>{permissionLabels[scope].description}</small>
                    </span>
                    <input
                      type="checkbox"
                      checked={consented(scope)}
                      disabled={busy}
                      onChange={(event) =>
                        void updateConsent(scope, event.target.checked)
                      }
                    />
                  </label>
                ))}
              </div>
              <p className="settings-note">
                Browser storage is origin-scoped, not inherently encrypted.
                Clearing browser data removes this profile. There is no
                cross-device synchronization.
              </p>
            </>
          )}
          {tab === "profile" && (
            <>
              <h3>Your editable beauty profile.</h3>
              <p>
                Use your own observations. A photograph does not determine your
                skin type or a medical diagnosis.
              </p>
              {profile && (
                <form
                  className="profile-form"
                  onSubmit={(event) => void updateProfile(event)}
                >
                  <label className="field-label">
                    Display name
                    <input
                      name="displayName"
                      defaultValue={profile.displayName}
                      maxLength={80}
                    />
                  </label>
                  <label className="field-label">
                    Skin type · self-reported
                    <select name="skinType" defaultValue={profile.skinType}>
                      <option>Not specified</option>
                      <option value="dry">Dry</option>
                      <option value="oily">Oily</option>
                      <option value="combination">Combination</option>
                      <option value="normal">Normal</option>
                      <option value="sensitive">Sensitive-feeling</option>
                    </select>
                  </label>
                  <div className="form-pair">
                    <label className="field-label">
                      Product budget
                      <input
                        name="budget"
                        type="number"
                        min={0}
                        max={1000000000}
                        step={1}
                        defaultValue={profile.budget}
                      />
                    </label>
                    <label className="field-label">
                      Currency
                      <select name="currency" defaultValue={profile.currency}>
                        <option>NGN</option>
                        <option>USD</option>
                        <option>GBP</option>
                        <option>EUR</option>
                      </select>
                    </label>
                  </div>
                  <label className="field-label">
                    Cosmetic concerns · separate with commas
                    <input
                      name="concerns"
                      defaultValue={profile.concerns.join(", ")}
                      placeholder="Dry-feeling skin, colour preferences"
                      maxLength={500}
                    />
                  </label>
                  <button className="button primary" disabled={busy}>
                    <Check size={15} /> Save profile
                  </button>
                </form>
              )}
            </>
          )}
          {tab === "memory" && (
            <>
              <h3>BeautyGraph</h3>
              <p>
                See exactly what is remembered, where it came from, and when it
                changed. Corrections create attributed revisions. Forgetting
                removes the entire revision chain.
              </p>
              {!consented("memory.preferences") && (
                <div className="settings-inline-note">
                  Preference memory is off. Enable “Remember my preferences” in
                  Permissions before saving a new memory.
                </div>
              )}
              <form
                className="new-memory-form"
                onSubmit={(event) => void submitMemory(event)}
              >
                <label className="field-label">
                  Preference name
                  <input
                    value={key}
                    onChange={(event) => setKey(event.target.value)}
                    maxLength={120}
                    placeholder="Lip finish"
                    disabled={!consented("memory.preferences")}
                  />
                </label>
                <label className="field-label">
                  Your preference
                  <input
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    maxLength={2000}
                    placeholder="Matte"
                    disabled={!consented("memory.preferences")}
                  />
                </label>
                <label className="field-label">
                  Keep for
                  <select
                    value={retention}
                    onChange={(event) =>
                      setRetention(
                        event.target.value as MemoryNode["retentionPolicy"],
                      )
                    }
                  >
                    <option value="until-deleted">Until I delete it</option>
                    <option value="30-days">30 days</option>
                    <option value="90-days">90 days</option>
                  </select>
                </label>
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    !consented("memory.preferences") ||
                    !key.trim() ||
                    !value.trim()
                  }
                >
                  Remember this
                </button>
              </form>
              <div className="memory-records">
                {memories.length ? (
                  memories.map((node) => (
                    <MemoryRow key={node.id} node={node} onError={setError} />
                  ))
                ) : (
                  <Empty title="A fresh page">
                    No personal memories have been saved.
                  </Empty>
                )}
              </div>
            </>
          )}
          {tab === "data" && (
            <>
              <h3>A portable beauty life.</h3>
              <div className="stored-counts">
                <span>
                  <strong>{counts.looks}</strong> looks
                </span>
                <span>
                  <strong>{counts.products}</strong> owned products
                </span>
                <span>
                  <strong>{counts.scans}</strong> scans
                </span>
                <span>
                  <strong>{counts.photos}</strong> photos
                </span>
                <span>
                  <strong>{counts.episodes}</strong> consultations
                </span>
              </div>
              <p>
                Backups include local records and editable looks. Photographs
                and thumbnails are excluded. Import merges records by identifier
                and never enables permissions.
              </p>
              <label className="backup-option">
                <input
                  type="checkbox"
                  checked={encrypted}
                  onChange={(event) => setEncrypted(event.target.checked)}
                />
                <span>
                  <LockKeyhole size={15} /> Encrypt my exported backup
                </span>
              </label>
              <label className="field-label">
                Backup passphrase{" "}
                <small>
                  Required for encrypted export or import. At least 12
                  characters; never stored.
                </small>
                <input
                  type="password"
                  value={passphrase}
                  autoComplete="new-password"
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Only you know this phrase"
                />
              </label>
              <div className="backup-actions">
                <button
                  className="button primary"
                  disabled={busy || (encrypted && passphrase.length < 12)}
                  onClick={() => void download()}
                >
                  <Download size={15} /> Export {encrypted ? "encrypted " : ""}
                  backup
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => importRef.current?.click()}
                >
                  <Upload size={15} /> Import backup
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  aria-label="Choose a True Beauty backup"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void importFile(file);
                    event.target.value = "";
                  }}
                />
              </div>
              <p className="settings-note">
                Encrypted backups use your passphrase with PBKDF2 and AES-GCM.
                The app cannot recover a lost passphrase. The local database
                itself is not encrypted by this option.
              </p>
              <div className="delete-data">
                <h4>Start fresh</h4>
                <p>
                  Delete all looks, products, routines, scans, memories, saved
                  media, consultations and permissions on this browser.
                </p>
                {deleteOpen ? (
                  <>
                    <label className="field-label">
                      Type DELETE to confirm
                      <input
                        value={deleteText}
                        onChange={(event) => setDeleteText(event.target.value)}
                        autoComplete="off"
                      />
                    </label>
                    <div className="backup-actions">
                      <button
                        className="button danger"
                        disabled={deleteText !== "DELETE" || busy}
                        onClick={() =>
                          void run(async () => {
                            await clearLocalData();
                            useApp
                              .getState()
                              .setPortraitUrl("/images/portrait-neutral.jpg");
                            await initializeDatabase();
                            setDeleteOpen(false);
                            setDeleteText("");
                          }, "All local data deleted. A fresh empty profile is ready.")
                        }
                      >
                        <Trash2 size={15} /> Delete everything
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => {
                          setDeleteOpen(false);
                          setDeleteText("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    className="button danger"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 size={15} /> Delete all local data
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
