import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Check,
  ChevronRight,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  loadDigitalTwin,
  saveTwinProfile,
  saveCompleteLook,
  deleteCompleteLook,
  exportDigitalTwin,
  readComposition,
} from "../../../../packages/digital-twin/src";
import {
  EMPTY_TWIN_PREFERENCES,
  type SceneLighting,
  type TwinPreferences,
  type TwinSnapshot,
} from "../../../../packages/digital-twin/src/contracts";
import {
  type Profile,
  type SavedLook,
} from "../../../../packages/local-database/src";
import { SAMPLE_PRODUCTS } from "../../../../packages/commerce-engine/src";
import {
  MAKEUP_LAYERS,
  type MakeupLook,
} from "../../../../packages/makeup-engine/src";
import "./DigitalTwin.css";

export interface DigitalTwinProps {
  portraitUrl: string;
  portraitProvenance?: {
    kind: "ai-generated";
    provider: "perfect-corp";
    feature: "hair" | "clothing";
    createdAt: string;
  } | null;
  look: MakeupLook;
  lighting: SceneLighting;
  onApplyComplete: (saved: SavedLook) => void;
  onOpenOutfit: (id: string) => void;
  onOpenMirror: () => void;
}
type ProfilePatch = Pick<
  Profile,
  | "displayName"
  | "skinType"
  | "budget"
  | "currency"
  | "concerns"
  | "preferences"
>;
const list = (value: string, max: number, field: string, maxLength = 120) => {
  const values = [
    ...new Set(
      value
        .split(/[,\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (values.length > max)
    throw new Error(
      `${field}: keep up to ${max} entries. Your draft has not been truncated.`,
    );
  if (values.some((item) => item.length > maxLength))
    throw new Error(
      `${field}: keep each entry under ${maxLength + 1} characters.`,
    );
  return values;
};
const text = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim() ? value : fallback;
const regionNames: Record<string, string> = {
  lipstick: "Lip colour",
  eyeshadow: "Eyeshadow",
  blush: "Blush",
  foundation: "Foundation",
  eyeliner: "Eyeliner",
  mascara: "Mascara",
  brows: "Brows",
  contour: "Contour",
  bronzer: "Bronzer",
  highlighter: "Highlighter",
  lipliner: "Lip liner",
  lipgloss: "Lip gloss",
};
const LIGHT_NAMES: Record<SceneLighting["preset"], string> = {
  neutral: "Original light",
  daylight: "Daylight",
  "golden-hour": "Golden hour",
  moonlight: "Moonlight",
};
function cleanPreferences(document: TwinPreferences): TwinPreferences {
  return {
    hairTexture: document.hairTexture,
    hairLength: document.hairLength,
    hairGoals: [...document.hairGoals],
    styleGoals: [...document.styleGoals],
    favoriteColors: [...document.favoriteColors],
    avoidIngredients: [...document.avoidIngredients],
    preferredFinish: document.preferredFinish,
  };
}

/** An editable cosmetic profile, never a biometric or medically complete representation. */
export default function DigitalTwin({
  portraitUrl,
  portraitProvenance,
  look,
  lighting,
  onApplyComplete,
  onOpenOutfit,
  onOpenMirror,
}: DigitalTwinProps) {
  const titleId = useId(),
    profileFormId = useId(),
    hydrated = useRef(""),
    [attempt, setAttempt] = useState(0);
  const loaded = useLiveQuery(async () => {
    try {
      return { snapshot: await loadDigitalTwin(), error: "" };
    } catch (error) {
      return {
        snapshot: null,
        error:
          error instanceof Error
            ? error.message
            : "Your local profile could not be opened.",
      };
    }
  }, [attempt]);
  const snapshot = loaded?.snapshot as TwinSnapshot | undefined | null;
  const [profile, setProfile] = useState<ProfilePatch>({
      displayName: "",
      skinType: "Not specified",
      budget: 20000,
      currency: "NGN",
      concerns: [],
      preferences: [],
    }),
    [preferences, setPreferences] = useState<TwinPreferences>(
      EMPTY_TWIN_PREFERENCES,
    ),
    [concerns, setConcerns] = useState(""),
    [generalPreferences, setGeneralPreferences] = useState(""),
    [hairGoals, setHairGoals] = useState(""),
    [styleGoals, setStyleGoals] = useState(""),
    [avoidIngredients, setAvoidIngredients] = useState(""),
    [newColor, setNewColor] = useState("#a45356"),
    [dirty, setDirty] = useState(false),
    [rememberPreferences, setRememberPreferences] = useState(false),
    [rememberLook, setRememberLook] = useState(false);
  const [name, setName] = useState(""),
    [occasion, setOccasion] = useState(""),
    [productIds, setProductIds] = useState<string[]>([]),
    [outfitId, setOutfitId] = useState(""),
    [busy, setBusy] = useState(""),
    [feedbackContext, setFeedbackContext] = useState(""),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!snapshot) return;
    const key = `${snapshot.profile.updatedAt}:${snapshot.document.revision}`;
    if (dirty || hydrated.current === key) return;
    hydrated.current = key;
    const p = snapshot.profile;
    setProfile({
      displayName: p.displayName,
      skinType: p.skinType,
      budget: p.budget,
      currency: p.currency,
      concerns: [...p.concerns],
      preferences: [...p.preferences],
    });
    setPreferences(cleanPreferences(snapshot.document));
    setConcerns(p.concerns.join(", "));
    setGeneralPreferences(p.preferences.join(", "));
    setHairGoals(snapshot.document.hairGoals.join("\n"));
    setStyleGoals(snapshot.document.styleGoals.join("\n"));
    setAvoidIngredients(snapshot.document.avoidIngredients.join(", "));
  }, [snapshot, dirty]);
  useEffect(() => {
    if (!snapshot?.canRememberPreferences) setRememberPreferences(false);
    if (!snapshot?.canRememberHistory) setRememberLook(false);
  }, [snapshot?.canRememberPreferences, snapshot?.canRememberHistory]);
  useEffect(() => {
    if (!snapshot) return;
    const owned = new Set(snapshot.ownedProducts.map((item) => item.productId));
    setProductIds((previous) => previous.filter((id) => owned.has(id)));
    setOutfitId((previous) =>
      previous && !snapshot.outfits.some((outfit) => outfit.id === previous)
        ? ""
        : previous,
    );
  }, [snapshot]);
  function editProfile(patch: Partial<ProfilePatch>) {
    setProfile((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setMessage("");
  }
  function editPreferences(patch: Partial<TwinPreferences>) {
    setPreferences((previous) => ({ ...previous, ...patch }));
    setDirty(true);
    setMessage("");
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!snapshot || busy) return;
    setBusy("profile");
    setFeedbackContext("profile");
    setError("");
    setMessage("");
    const remember = rememberPreferences && snapshot.canRememberPreferences;
    try {
      await saveTwinProfile(
        {
          ...profile,
          displayName: profile.displayName.trim() || "You",
          concerns: list(concerns, 30, "Cosmetic concerns"),
          preferences: list(generalPreferences, 30, "Product preferences", 160),
        },
        {
          ...preferences,
          hairGoals: list(hairGoals, 12, "Hair goals"),
          styleGoals: list(styleGoals, 12, "Style goals", 160),
          avoidIngredients: list(
            avoidIngredients,
            40,
            "Ingredient preferences",
          ),
        },
        {
          rememberPreferences: remember,
        },
      );
      setDirty(false);
      setMessage(
        remember
          ? "Your profile and permitted preference memory are saved on this device."
          : "Your profile is saved on this device. No agent memory was added.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be saved. Your draft is still here.",
      );
    } finally {
      setBusy("");
    }
  }
  async function saveComposition(event: FormEvent) {
    event.preventDefault();
    if (!snapshot || busy || !name.trim()) return;
    setBusy("look");
    setFeedbackContext("look");
    setError("");
    setMessage("");
    try {
      await saveCompleteLook({
        name: name.trim(),
        occasion: occasion.trim(),
        look,
        lighting,
        productIds,
        ...(outfitId ? { outfitId } : {}),
        remember: rememberLook && snapshot.canRememberHistory,
      });
      setName("");
      setOccasion("");
      setMessage(
        "Your coordinated look is saved. Its recipe and references are stored, without a photograph.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your complete look could not be saved. Your selections are still here.",
      );
    } finally {
      setBusy("");
    }
  }
  async function removeLook(saved: SavedLook) {
    if (busy) return;
    setBusy(saved.id);
    setFeedbackContext("archive");
    setError("");
    try {
      await deleteCompleteLook(saved.id);
      setMessage(`“${saved.name}” was deleted from complete looks.`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This look could not be deleted.",
      );
    } finally {
      setBusy("");
    }
  }
  function reopenLook(saved: SavedLook) {
    setFeedbackContext("archive");
    setError("");
    try {
      onApplyComplete(saved);
      onOpenMirror();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "This look could not be reopened. Its saved record has not changed.",
      );
    }
  }
  async function exportProfile() {
    if (busy) return;
    setBusy("export");
    setFeedbackContext("export");
    setError("");
    try {
      const data = await exportDigitalTwin(),
        url = URL.createObjectURL(
          new Blob([data], { type: "application/json" }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = "true-beauty-profile.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage(
        "Your local beauty profile export is ready. Photographs are excluded.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Your profile could not be exported.",
      );
    } finally {
      setBusy("");
    }
  }
  const feedback = (context: string) =>
    feedbackContext === context ? (
      <>
        {error && (
          <p className="twin-feedback twin-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="twin-feedback" role="status">
            {message}
          </p>
        )}
      </>
    ) : null;
  if (!loaded)
    return (
      <section className="digital-twin twin-loading" aria-busy="true">
        <span className="eyebrow">Your beauty profile</span>
        <h1>Getting to know your world.</h1>
        <p role="status">Opening your local profile…</p>
      </section>
    );
  if (loaded.error || !snapshot)
    return (
      <section className="digital-twin twin-loading">
        <h1>Your profile needs a moment.</h1>
        <p role="alert">
          {loaded.error || "Your local profile is unavailable."}
        </p>
        <button
          className="button primary"
          onClick={() => setAttempt((value) => value + 1)}
        >
          Try again
        </button>
      </section>
    );
  const completeLooks = snapshot.looks.filter(
      (saved) => readComposition(saved) !== null,
    ),
    activeLayers = MAKEUP_LAYERS.filter((key) => look[key].enabled),
    accessories = Object.entries(look.accessories)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key),
    savedOutfit = outfitId
      ? snapshot.outfits.find((outfit) => outfit.id === outfitId)
      : undefined;
  return (
    <section className="digital-twin" aria-labelledby={titleId}>
      <header className="twin-heading">
        <div>
          <span className="eyebrow">Your beauty profile</span>
          <h1 id={titleId}>
            A little more <em>you.</em>
          </h1>
          <p>
            The colours, rituals and possibilities you choose to make your own.
          </p>
        </div>
        <button
          className="twin-text-action"
          onClick={() => void exportProfile()}
          disabled={Boolean(busy)}
        >
          <ArrowDownToLine size={16} /> Export profile
        </button>
      </header>
      {feedback("export")}
      <div className="twin-introduction">
        <figure className="twin-portrait">
          <div className="twin-portrait-media">
            <img
              src={portraitUrl}
              alt={
                portraitProvenance
                  ? `AI-generated ${portraitProvenance.feature} preview from Perfect Corp, used for display only`
                  : "Current session portrait, used for display only"
              }
            />
            <button className="twin-portrait-action" onClick={onOpenMirror}>
              Back to the mirror <ArrowUpRight size={16} />
            </button>
          </div>
          <figcaption
            className={
              portraitProvenance ? "twin-generated-caption" : undefined
            }
            role={portraitProvenance ? "note" : undefined}
            aria-label={
              portraitProvenance ? "Generated image provenance" : undefined
            }
          >
            <span>
              {portraitProvenance ? (
                <>
                  <Sparkles size={14} /> AI-generated{" "}
                  {portraitProvenance.feature} preview
                </>
              ) : (
                "Your current portrait"
              )}
            </span>
            <small>
              {portraitProvenance
                ? "Perfect Corp · Still image · Session only. Not stored with this profile."
                : "Session only. Not stored with this profile."}
            </small>
          </figcaption>
        </figure>
        <div className="twin-profile-intro">
          <span className="eyebrow">In your own words</span>
          <h2>
            Beauty has a<br />
            <em>personal language.</em>
          </h2>
          <p>
            This is an editable record of your cosmetic preferences and styling
            choices. It is not a biometric model or a medically complete digital
            twin.
          </p>
          <p>
            You describe yourself. You choose what stays. Everything here is
            local to this browser, without an account.
          </p>
          <div className="twin-anchor-links">
            <a href={`#${profileFormId}`}>
              Your preferences <ChevronRight size={15} />
            </a>
            <a href="#twin-composer">
              Create a complete look <ChevronRight size={15} />
            </a>
            <a href="#twin-archive">
              Return to a saved look <ChevronRight size={15} />
            </a>
          </div>
          <span className="twin-profile-source">
            {snapshot.document.source === "user-provided"
              ? "Your saved preferences"
              : "Not filled in yet"}{" "}
            · revision {snapshot.document.revision}
            <br />
            No appearance or medical traits inferred from the portrait.
          </span>
        </div>
      </div>
      <form
        id={profileFormId}
        className="twin-profile-form"
        onSubmit={(event) => void saveProfile(event)}
      >
        <div className="twin-section-heading">
          <span>01 / Your starting point</span>
          <h2>Tell us what feels like you.</h2>
          <p>
            Self-reported details help you plan. Leave anything unspecified.
          </p>
        </div>
        <div className="twin-profile-fields">
          <label>
            What should we call you?
            <input
              value={profile.displayName}
              maxLength={80}
              onChange={(event) =>
                editProfile({ displayName: event.target.value })
              }
              autoComplete="nickname"
              placeholder="A name, if you like"
            />
          </label>
          <label>
            Skin type, as you describe it
            <select
              aria-label="Skin type, as you describe it"
              value={profile.skinType}
              onChange={(event) =>
                editProfile({ skinType: event.target.value })
              }
            >
              {[
                ...new Set([
                  "Not specified",
                  "Dry",
                  "Oily",
                  "Combination",
                  "Balanced",
                  profile.skinType,
                ]),
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label>
            Your beauty budget
            <input
              type="number"
              min="0"
              max="100000000"
              step="1"
              value={profile.budget}
              onChange={(event) =>
                editProfile({ budget: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Currency
            <select
              aria-label="Currency"
              value={profile.currency}
              onChange={(event) =>
                editProfile({
                  currency: event.target.value as Profile["currency"],
                })
              }
            >
              <option value="NGN">NGN · Nigerian naira</option>
              <option value="USD">USD · US dollar</option>
              <option value="GBP">GBP · British pound</option>
              <option value="EUR">EUR · Euro</option>
            </select>
          </label>
          <label className="twin-field-wide">
            Cosmetic concerns you want to track
            <input
              value={concerns}
              maxLength={1200}
              onChange={(event) => {
                setConcerns(event.target.value);
                setDirty(true);
              }}
              placeholder="For example: visible dryness, uneven-looking tone"
            />
            <small>
              Separate with commas. These are your observations, not diagnoses.
            </small>
          </label>
          <label className="twin-field-wide">
            What matters to you in your products?
            <input
              value={generalPreferences}
              maxLength={1200}
              onChange={(event) => {
                setGeneralPreferences(event.target.value);
                setDirty(true);
              }}
              placeholder="For example: lightweight textures, fragrance-free choices"
            />
            <small>Your own preferences, separated by commas.</small>
          </label>
        </div>
        <div className="twin-detail-columns">
          <fieldset>
            <legend>Hair, on your terms.</legend>
            <label>
              Hair texture
              <input
                value={preferences.hairTexture}
                maxLength={80}
                onChange={(event) =>
                  editPreferences({ hairTexture: event.target.value })
                }
                placeholder="Describe your texture"
              />
            </label>
            <label>
              Hair length
              <input
                value={preferences.hairLength}
                maxLength={80}
                onChange={(event) =>
                  editPreferences({ hairLength: event.target.value })
                }
                placeholder="Describe your length"
              />
            </label>
            <label>
              Hair goals
              <textarea
                rows={3}
                value={hairGoals}
                maxLength={1400}
                onChange={(event) => {
                  setHairGoals(event.target.value);
                  setDirty(true);
                }}
                placeholder="One goal per line"
              />
              <small>
                Up to 12 goals. Your descriptions, not a hair diagnosis.
              </small>
            </label>
          </fieldset>
          <fieldset>
            <legend>Your style vocabulary.</legend>
            <label>
              Style goals
              <textarea
                rows={3}
                value={styleGoals}
                maxLength={1900}
                onChange={(event) => {
                  setStyleGoals(event.target.value);
                  setDirty(true);
                }}
                placeholder="One goal or occasion per line"
              />
              <small>
                Up to 12 goals, such as everyday soft glam or expressive colour.
              </small>
            </label>
            <label>
              Preferred makeup finish
              <select
                aria-label="Preferred makeup finish"
                value={preferences.preferredFinish}
                onChange={(event) =>
                  editPreferences({
                    preferredFinish: event.target
                      .value as TwinPreferences["preferredFinish"],
                  })
                }
              >
                <option value="unspecified">No preference yet</option>
                <option value="matte">Matte</option>
                <option value="gloss">Gloss</option>
                <option value="shimmer">Shimmer</option>
                <option value="glitter">Glitter</option>
              </select>
            </label>
            <label>
              Ingredients you prefer to avoid
              <textarea
                rows={2}
                value={avoidIngredients}
                maxLength={4700}
                onChange={(event) => {
                  setAvoidIngredients(event.target.value);
                  setDirty(true);
                }}
                placeholder="Separate ingredient names with commas"
              />
              <small>
                A preference list, not an allergy or product-safety check.
              </small>
            </label>
          </fieldset>
        </div>
        <fieldset className="twin-colors">
          <legend>A colour story you come back to.</legend>
          <div className="twin-color-editor">
            <div className="twin-favorite-colors">
              {preferences.favoriteColors.map((color) => (
                <button
                  type="button"
                  key={color}
                  style={{ backgroundColor: color }}
                  aria-label={`Remove favorite colour ${color}`}
                  title={`Remove ${color.toUpperCase()}`}
                  onClick={() =>
                    editPreferences({
                      favoriteColors: preferences.favoriteColors.filter(
                        (value) => value !== color,
                      ),
                    })
                  }
                >
                  <X size={13} />
                </button>
              ))}
              {!preferences.favoriteColors.length && (
                <span>No favourites saved yet.</span>
              )}
            </div>
            <label>
              Add a favourite
              <input
                type="color"
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
                aria-label="New favorite colour"
              />
            </label>
            <button
              type="button"
              className="twin-add-color"
              disabled={
                preferences.favoriteColors.length >= 12 ||
                preferences.favoriteColors.includes(newColor)
              }
              onClick={() =>
                editPreferences({
                  favoriteColors: [...preferences.favoriteColors, newColor],
                })
              }
            >
              <Plus size={16} /> Add colour
            </button>
          </div>
          <p>Up to twelve colours. Remove a swatch to revise your palette.</p>
        </fieldset>
        <div className="twin-save-profile">
          <div>
            <label className="twin-memory-choice">
              <input
                type="checkbox"
                checked={rememberPreferences}
                disabled={!snapshot.canRememberPreferences || Boolean(busy)}
                onChange={(event) =>
                  setRememberPreferences(event.target.checked)
                }
              />{" "}
              Let the beauty agent remember these preferences
            </label>
            <small>
              {snapshot.canRememberPreferences
                ? "Optional. Existing preference-memory consent permits this extra use."
                : "Preference memory is off. Enable it in Privacy and settings first; saving your profile does not grant permission."}
            </small>
          </div>
          <button
            className="button primary"
            type="submit"
            disabled={Boolean(busy)}
          >
            <Check size={16} />
            {busy === "profile"
              ? "Saving your profile…"
              : "Save my local profile"}
          </button>
          <span className="twin-draft-state">
            {dirty
              ? "You have unsaved changes."
              : "Only saved changes become your profile."}
          </span>
        </div>
      </form>
      {feedback("profile")}
      <section
        id="twin-composer"
        className="twin-composer"
        aria-labelledby={`${titleId}-compose`}
      >
        <div className="twin-section-heading">
          <span>02 / Everything, together</span>
          <h2 id={`${titleId}-compose`}>Give the whole look a name.</h2>
          <p>
            Your current mirror recipe, an outfit you saved, and the products
            you own. One place to return to.
          </p>
        </div>
        <div className="twin-composer-layout">
          <div className="twin-current-recipe">
            <div className="twin-recipe-heading">
              <span>From your mirror, now</span>
              <button className="twin-text-action" onClick={onOpenMirror}>
                Edit in mirror <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="twin-recipe-pigments">
              {activeLayers.map((key) => (
                <span
                  key={key}
                  style={{ backgroundColor: look[key].color }}
                  title={`${regionNames[key]} ${look[key].color}`}
                  role="img"
                  aria-label={`${regionNames[key]} ${look[key].color}`}
                />
              ))}
              {!activeLayers.length && (
                <span
                  className="twin-bare-recipe"
                  title="No makeup layers enabled"
                />
              )}
            </div>
            <ul className="twin-recipe-details">
              {activeLayers.map((key) => (
                <li key={key}>
                  <span>{regionNames[key]}</span>
                  <span>
                    {look[key].color.toUpperCase()} · {look[key].finish} ·{" "}
                    {Math.round(look[key].opacity * 100)}%
                  </span>
                </li>
              ))}
              <li>
                <span>Hair</span>
                <span>
                  {look.hair.enabled
                    ? `${look.hair.color.toUpperCase()} · ${look.hair.mode}`
                    : "Original colour"}
                </span>
              </li>
              <li>
                <span>Accessories</span>
                <span>
                  {accessories.length
                    ? accessories.join(", ")
                    : "None selected"}
                </span>
              </li>
              <li>
                <span>Scene light</span>
                <span>{LIGHT_NAMES[lighting.preset]}</span>
              </li>
            </ul>
            <p>
              Saved as editable parameters. No portrait, camera frame or facial
              geometry is included.
            </p>
          </div>
          <form
            className="twin-composition-form"
            onSubmit={(event) => void saveComposition(event)}
          >
            <label>
              Complete look name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="For a moment worth remembering"
              />
            </label>
            <label>
              Occasion or note
              <input
                maxLength={160}
                value={occasion}
                onChange={(event) => setOccasion(event.target.value)}
                placeholder="An evening out, a little everyday confidence…"
              />
            </label>
            <label>
              Pair with a saved outfit
              <select
                aria-label="Pair with a saved outfit"
                value={outfitId}
                onChange={(event) => setOutfitId(event.target.value)}
              >
                <option value="">No outfit attached</option>
                {snapshot.outfits.map((outfit) => (
                  <option key={outfit.id} value={outfit.id}>
                    {text(outfit.name, "Untitled outfit")}
                  </option>
                ))}
              </select>
            </label>
            {savedOutfit && (
              <button
                type="button"
                className="twin-outfit-action"
                onClick={() => onOpenOutfit(savedOutfit.id)}
              >
                Inspect {text(savedOutfit.name, "selected outfit")}{" "}
                <ArrowUpRight size={14} />
              </button>
            )}
            <fieldset className="twin-owned-selection">
              <legend>Build from what you own.</legend>
              {snapshot.ownedProducts.length ? (
                <div>
                  {snapshot.ownedProducts.map((item) => {
                    const catalog = SAMPLE_PRODUCTS.find(
                        (product) => product.id === item.productId,
                      ),
                      label = item.name ?? catalog?.name ?? item.productId;
                    return (
                      <label key={item.id}>
                        <input
                          type="checkbox"
                          checked={productIds.includes(item.productId)}
                          onChange={(event) =>
                            setProductIds((previous) =>
                              event.target.checked
                                ? [...new Set([...previous, item.productId])]
                                : previous.filter(
                                    (id) => id !== item.productId,
                                  ),
                            )
                          }
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <p>
                  Your wardrobe is empty. Add owned products in My wardrobe,
                  then attach them here.
                </p>
              )}
            </fieldset>
            <div className="twin-compose-memory">
              <label className="twin-memory-choice">
                <input
                  type="checkbox"
                  checked={rememberLook}
                  disabled={!snapshot.canRememberHistory || Boolean(busy)}
                  onChange={(event) => setRememberLook(event.target.checked)}
                />{" "}
                Add this look to agent history
              </label>
              <small>
                {snapshot.canRememberHistory
                  ? "Optional, under your existing history-memory permission."
                  : "History memory is off. The saved look still works without it."}
              </small>
            </div>
            {dirty && (
              <p className="twin-draft-context">
                Your profile has unsaved edits. This look will reference your
                last saved profile; save those edits first to include them.
              </p>
            )}
            <button
              className="button primary"
              type="submit"
              disabled={!name.trim() || Boolean(busy)}
            >
              <Sparkles size={17} />
              {busy === "look"
                ? "Saving the whole look…"
                : "Save my complete look"}
            </button>
            {feedback("look")}
          </form>
        </div>
      </section>
      <section
        id="twin-archive"
        className="twin-archive"
        aria-labelledby={`${titleId}-archive`}
      >
        <div className="twin-section-heading">
          <span>03 / A thread to return to</span>
          <h2 id={`${titleId}-archive`}>Your complete looks.</h2>
          <p>
            Reopen the recipe in your mirror. Outfit and product references stay
            connected.
          </p>
        </div>
        {completeLooks.length ? (
          <div className="twin-look-list">
            {completeLooks.map((saved) => {
              const composition = readComposition(saved)!;
              const savedRecipe =
                saved.look && typeof saved.look === "object"
                  ? (saved.look as Partial<MakeupLook>)
                  : {};
              const savedColors = MAKEUP_LAYERS.filter(
                (key) => savedRecipe[key]?.enabled,
              ).map((key) => savedRecipe[key]!.color);
              if (savedRecipe.hair?.enabled)
                savedColors.push(savedRecipe.hair.color);
              return (
                <article key={saved.id} className="twin-saved-look">
                  <div className="twin-saved-palette" aria-hidden="true">
                    {savedColors
                      .filter(
                        (color) =>
                          typeof color === "string" &&
                          /^#[\da-f]{6}$/i.test(color),
                      )
                      .map((color, index) => (
                        <span key={index} style={{ backgroundColor: color }} />
                      ))}
                  </div>
                  <div className="twin-saved-caption">
                    <h3>{saved.name}</h3>
                    <p>
                      {composition.occasion || "A look in your own language."}
                    </p>
                    <small>
                      {new Date(saved.createdAt).toLocaleDateString(undefined, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}{" "}
                      · {composition.productIds.length} owned-product reference
                      {composition.productIds.length === 1 ? "" : "s"} ·{" "}
                      {LIGHT_NAMES[composition.lighting.preset]}
                    </small>
                  </div>
                  <div className="twin-saved-actions">
                    <button
                      className="twin-reopen-look"
                      onClick={() => reopenLook(saved)}
                      disabled={Boolean(busy)}
                    >
                      Reopen in mirror <ArrowUpRight size={15} />
                    </button>
                    {composition.outfitId && (
                      <button
                        className="twin-text-action"
                        onClick={() => onOpenOutfit(composition.outfitId!)}
                      >
                        Open outfit <ArrowUpRight size={14} />
                      </button>
                    )}
                    <button
                      className="twin-delete-look"
                      aria-label={`Delete complete look ${saved.name}`}
                      title="Delete complete look"
                      onClick={() => void removeLook(saved)}
                      disabled={Boolean(busy)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="twin-empty-looks">
            <span aria-hidden="true">
              <Sparkles size={38} />
            </span>
            <div>
              <h3>A place for your next favourite.</h3>
              <p>
                Name your current mirror recipe above to keep its colours, light
                and styling references together.
              </p>
            </div>
          </div>
        )}
      </section>
      {feedback("archive")}
      <footer className="twin-footer">
        <span>Beauty Digital Twin · a cosmetic preference profile</span>
        <p>
          Stored in this browser. Not encrypted by default. Use Privacy and
          settings to inspect consent, export broader local data or clear it.
          Your session portrait is excluded.
        </p>
      </footer>
    </section>
  );
}
