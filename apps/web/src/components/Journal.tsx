import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowUpRight, Plus, Trash2, Check, Calendar } from "lucide-react";
import { db, type Routine } from "../../../../packages/local-database/src";
import { normalizeLook } from "../../../../packages/makeup-engine/src";
import { useApp } from "../state/store";
import { Empty, Modal, SectionTitle, IconButton } from "./ui";
import LookComparison from "./LookComparison";
import {
  readComposition,
  deleteCompleteLook,
} from "../../../../packages/digital-twin/src";
import { SAMPLE_PRODUCTS } from "../../../../packages/commerce-engine/src";
export default function Journal() {
  const looks =
      useLiveQuery(
        () => db.savedLooks.orderBy("createdAt").reverse().toArray(),
        [],
      ) ?? [],
    entries =
      useLiveQuery(
        () => db.journalEntries.orderBy("createdAt").reverse().toArray(),
        [],
      ) ?? [],
    routines = useLiveQuery(() => db.routines.toArray(), []) ?? [],
    events = useLiveQuery(() => db.routineEvents.toArray(), []) ?? [],
    experiments = useLiveQuery(() => db.beautyExperiments.toArray(), []) ?? [];
  const [tab, setTab] = useState("looks"),
    [writing, setWriting] = useState(false),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [experiment, setExperiment] = useState(false),
    [goal, setGoal] = useState(""),
    [change, setChange] = useState(""),
    [editingRoutine, setEditingRoutine] = useState<Routine | null>(null),
    [compareIds, setCompareIds] = useState<string[]>([]),
    [comparing, setComparing] = useState(false);
  const notify = useApp((s) => s.notify);
  const save = async () => {
    if (!body.trim()) return;
    await db.journalEntries.add({
      id: crypto.randomUUID(),
      title: title.trim() || "A moment for me",
      body: body.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tags: [],
    });
    setWriting(false);
    setTitle("");
    setBody("");
    notify("A moment saved to your beauty journal.");
  };
  return (
    <>
      <SectionTitle
        overline="Your beauty journal"
        title="A story that’s only yours."
      >
        <button className="button primary" onClick={() => setWriting(true)}>
          <Plus size={16} /> New entry
        </button>
      </SectionTitle>
      <p className="page-lead">
        The looks you loved. The rituals you kept. A little space to notice what
        changes.
      </p>
      <div className="filter-tabs">
        {[
          ["looks", "Saved looks"],
          ["entries", "My notes"],
          ["routines", "Daily rituals"],
          ["experiments", "Beauty experiments"],
        ].map(([id, n]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {n}
          </button>
        ))}
      </div>
      {tab === "looks" && looks.length > 1 && (
        <div className="compare-looks-action">
          <span>Choose two recipes to replay on the same portrait.</span>
          <button
            className="button secondary"
            disabled={compareIds.length !== 2}
            onClick={() => setComparing(true)}
          >
            Compare looks ({compareIds.length}/2)
          </button>
        </div>
      )}
      {tab === "looks" &&
        (looks.length ? (
          <div className="look-grid">
            {looks.map((l) => {
              const look = normalizeLook(l.look);
              return (
                <article className="saved-look-card" key={l.id}>
                  <button
                    className="look-swatch-art"
                    style={{ background: look.blush.color + "22" }}
                    onClick={() => {
                      useApp.getState().applySavedLook(l);
                      useApp.getState().setSpace("studio");
                    }}
                  >
                    <div style={{ background: look.lipstick.color }} />
                    <div style={{ background: look.blush.color }} />
                    <div style={{ background: look.eyeshadow.color }} />
                    <span>
                      <ArrowUpRight size={22} />
                    </span>
                  </button>
                  <button
                    className="compare-look-select"
                    aria-pressed={compareIds.includes(l.id)}
                    onClick={() =>
                      setCompareIds((ids) =>
                        ids.includes(l.id)
                          ? ids.filter((id) => id !== l.id)
                          : ids.length < 2
                            ? [...ids, l.id]
                            : [ids[1], l.id],
                      )
                    }
                  >
                    {compareIds.includes(l.id)
                      ? "Selected for comparison"
                      : "Compare this look"}
                  </button>
                  <div className="saved-look-info">
                    <div>
                      <h3>{l.name}</h3>
                      <span>
                        {new Date(l.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · colour recipe
                      </span>
                    </div>
                    <IconButton
                      label={`Delete ${l.name}`}
                      onClick={() =>
                        void (
                          readComposition(l)
                            ? deleteCompleteLook(l.id)
                            : db.savedLooks.delete(l.id)
                        ).catch(() =>
                          notify("This look could not be deleted. Try again."),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                  <button
                    className="text-action"
                    onClick={() => {
                      useApp.getState().applySavedLook(l);
                      useApp.getState().setSpace("studio");
                    }}
                  >
                    Back to this feeling <ArrowUpRight size={15} />
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="Your next favourite look is waiting."
            action={
              <button
                className="button primary"
                onClick={() => useApp.getState().setSpace("studio")}
              >
                Enter the Living Mirror <ArrowUpRight size={16} />
              </button>
            }
          >
            Save a look from the studio. Your colours and layers stay here,
            ready to come back to.
          </Empty>
        ))}
      {tab === "entries" &&
        (entries.length ? (
          <div className="journal-list">
            {entries.map((e) => (
              <article key={e.id}>
                <div className="journal-date">
                  <Calendar size={17} />
                  {new Date(e.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <h3>{e.title}</h3>
                <p>{e.body}</p>
                <IconButton
                  label={`Delete journal entry ${e.title}`}
                  onClick={() => void db.journalEntries.delete(e.id)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Take a moment to check in."
            action={
              <button
                className="button primary"
                onClick={() => setWriting(true)}
              >
                Write your first note
              </button>
            }
          >
            How did a product feel? What made you feel like yourself? Your own
            observations matter.
          </Empty>
        ))}
      {tab === "routines" &&
        (routines.length ? (
          <div className="routine-grid">
            {routines.map((r) => {
              const today = events.some(
                (e) =>
                  e.routineId === r.id &&
                  new Date(e.completedAt).toDateString() ===
                    new Date().toDateString(),
              );
              return (
                <article className="routine-card" key={r.id}>
                  <span className="routine-period">
                    {r.period === "AM" ? "Morning light" : "Evening unwind"}
                  </span>
                  <h3>{r.name}</h3>
                  <ol>
                    {r.steps.map((s) => (
                      <li key={s.id}>
                        <strong>{s.name}</strong>
                        <p>{s.reason}</p>
                      </li>
                    ))}
                  </ol>
                  <button
                    className={`button ${today ? "secondary" : "primary"} full-width`}
                    onClick={async () => {
                      if (today) {
                        notify(
                          "Already checked in today. Your journal has the record.",
                        );
                        return;
                      }
                      await db.routineEvents.add({
                        id: crypto.randomUUID(),
                        routineId: r.id,
                        completedAt: Date.now(),
                        stepIds: r.steps.map((s) => s.id),
                      });
                      notify("Ritual complete. One small moment for you.");
                    }}
                  >
                    <Check size={16} />
                    {today ? "Completed today" : "Mark today complete"}
                  </button>
                  <div className="routine-edit-actions">
                    <button
                      className="text-action"
                      onClick={() => setEditingRoutine(structuredClone(r))}
                    >
                      Edit routine
                    </button>
                    <button
                      className="text-action"
                      onClick={() => void db.routines.delete(r.id)}
                    >
                      Remove routine
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            title="A good routine starts simply."
            action={
              <button
                className="button primary"
                onClick={() => useApp.getState().setSpace("skin")}
              >
                Build your daily ritual <ArrowUpRight size={16} />
              </button>
            }
          >
            Create an explainable routine based on the preferences you choose
            and the products you own.
          </Empty>
        ))}
      {tab === "experiments" && (
        <>
          <div className="experiment-intro">
            <p>
              Change one thing. Keep your notes. Patterns are useful; they don’t
              establish cause and effect.
            </p>
            <button
              className="button secondary"
              onClick={() => setExperiment(true)}
            >
              <Plus size={16} /> Start an experiment
            </button>
          </div>
          {experiments.length ? (
            <div className="journal-list">
              {experiments.map((e) => (
                <article key={e.id}>
                  <span className="subtle-label">Personal observation</span>
                  <h3>{String(e.name)}</h3>
                  <p>{String(e.change)}</p>
                  <p>{String(e.goal)}</p>
                  <div className="detail-actions">
                    <button
                      className="button secondary"
                      onClick={() => {
                        setTitle("Check-in: " + String(e.name));
                        setWriting(true);
                      }}
                    >
                      Add a check-in
                    </button>
                    <IconButton
                      label={`Delete experiment ${String(e.name)}`}
                      onClick={() => void db.beautyExperiments.delete(e.id)}
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty title="Curiosity looks good on you.">
              Track a product or routine change, how it feels, and what you
              notice over time.
            </Empty>
          )}
        </>
      )}
      {comparing && (
        <Modal
          title="Two ways to feel like you."
          wide
          onClose={() => setComparing(false)}
        >
          <LookComparison
            looks={looks.filter((l) => compareIds.includes(l.id))}
          />
        </Modal>
      )}
      {editingRoutine && (
        <Modal
          title="Make this ritual yours."
          onClose={() => setEditingRoutine(null)}
        >
          <label className="field-label">
            Routine name
            <input
              value={editingRoutine.name}
              onChange={(e) =>
                setEditingRoutine({ ...editingRoutine, name: e.target.value })
              }
              maxLength={120}
            />
          </label>
          <label className="field-label">
            Time of day
            <select
              value={editingRoutine.period}
              onChange={(e) =>
                setEditingRoutine({
                  ...editingRoutine,
                  period: e.target.value as "AM" | "PM",
                })
              }
            >
              <option value="AM">Morning</option>
              <option value="PM">Evening</option>
            </select>
          </label>
          <div className="routine-step-editor">
            {editingRoutine.steps.map((step, i) => (
              <div key={step.id}>
                <label className="field-label">
                  Step {i + 1}
                  <input
                    aria-label={`Step ${i + 1} name`}
                    value={step.name}
                    onChange={(e) =>
                      setEditingRoutine({
                        ...editingRoutine,
                        steps: editingRoutine.steps.map((s, j) =>
                          j === i ? { ...s, name: e.target.value } : s,
                        ),
                      })
                    }
                    maxLength={200}
                  />
                </label>
                <label className="field-label">
                  Product
                  <select
                    value={step.productId ?? ""}
                    onChange={(e) =>
                      setEditingRoutine({
                        ...editingRoutine,
                        steps: editingRoutine.steps.map((s, j) =>
                          j === i
                            ? { ...s, productId: e.target.value || undefined }
                            : s,
                        ),
                      })
                    }
                  >
                    <option value="">My own product / no selection</option>
                    {SAMPLE_PRODUCTS.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · sample reference
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  Your usage note
                  <textarea
                    rows={2}
                    value={step.reason ?? ""}
                    onChange={(e) =>
                      setEditingRoutine({
                        ...editingRoutine,
                        steps: editingRoutine.steps.map((s, j) =>
                          j === i ? { ...s, reason: e.target.value } : s,
                        ),
                      })
                    }
                  />
                </label>
                <div className="routine-edit-actions">
                  <button
                    disabled={i === 0}
                    onClick={() => {
                      const steps = [...editingRoutine.steps];
                      [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                      setEditingRoutine({ ...editingRoutine, steps });
                    }}
                  >
                    Move earlier
                  </button>
                  <button
                    disabled={i === editingRoutine.steps.length - 1}
                    onClick={() => {
                      const steps = [...editingRoutine.steps];
                      [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                      setEditingRoutine({ ...editingRoutine, steps });
                    }}
                  >
                    Move later
                  </button>
                  <button
                    onClick={() =>
                      setEditingRoutine({
                        ...editingRoutine,
                        steps: editingRoutine.steps.filter((_, j) => j !== i),
                      })
                    }
                  >
                    Remove step
                  </button>
                </div>
              </div>
            ))}
          </div>
          <button
            className="button secondary full-width"
            disabled={editingRoutine.steps.length >= 12}
            onClick={() =>
              setEditingRoutine({
                ...editingRoutine,
                steps: [
                  ...editingRoutine.steps,
                  { id: crypto.randomUUID(), name: "A moment for me" },
                ],
              })
            }
          >
            Add a step
          </button>
          <button
            className="button primary full-width"
            disabled={
              !editingRoutine.name.trim() ||
              !editingRoutine.steps.length ||
              editingRoutine.steps.some((s) => !s.name.trim())
            }
            onClick={async () => {
              await db.routines.put({
                ...editingRoutine,
                updatedAt: Date.now(),
              });
              setEditingRoutine(null);
              notify("Your ritual has been updated.");
            }}
          >
            Save routine changes
          </button>
        </Modal>
      )}
      {writing && (
        <Modal title="A moment for you." onClose={() => setWriting(false)}>
          <label className="field-label">
            Give this moment a name
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="A little more glow…"
            />
          </label>
          <label className="field-label">
            What would you like to remember?
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="How your skin feels, a look you loved, a small discovery…"
            />
          </label>
          <p className="fine-print">
            Saved only when you choose. This note stays on this browser.
          </p>
          <button
            className="button primary full-width"
            disabled={!body.trim()}
            onClick={() => void save()}
          >
            Save to my journal
          </button>
        </Modal>
      )}
      {experiment && (
        <Modal
          title="Try something, thoughtfully."
          onClose={() => setExperiment(false)}
        >
          <label className="field-label">
            What will you change?
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              placeholder="Use my new moisturiser every evening"
              maxLength={200}
            />
          </label>
          <label className="field-label">
            What would you like to observe?
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="How comfortable my skin feels in the morning"
              maxLength={1000}
            />
          </label>
          <p className="info-note">
            This journal helps you observe, not diagnose. Other changes,
            lighting and time can affect outcomes.
          </p>
          <button
            className="button primary full-width"
            disabled={!change.trim()}
            onClick={async () => {
              await db.beautyExperiments.add({
                id: crypto.randomUUID(),
                name: change.trim(),
                change,
                goal,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              });
              setExperiment(false);
              setChange("");
              setGoal("");
              notify("Your experiment is ready for its first check-in.");
            }}
          >
            Start my experiment
          </button>
        </Modal>
      )}
    </>
  );
}
