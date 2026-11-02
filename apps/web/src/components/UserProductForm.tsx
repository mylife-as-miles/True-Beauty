import { useState } from "react";
import { ZodError } from "zod";
import { Plus, Bookmark, Trash2, ArrowUpRight } from "lucide-react";
import { inspectIngredients } from "../../../../packages/beauty-intelligence/src";
import {
  saveUserProduct,
  removeUserProduct,
  userProductInput,
  type UserProductRecord,
  type UserProductInput,
} from "../../../../packages/commerce-engine/src/user-products";
import { Modal } from "./ui";
import { useApp } from "../state/store";
const INITIAL: UserProductInput = {
  name: "",
  brand: "",
  category: "other",
  variantName: "",
  inci: "",
  ingredientSource: "not-provided",
  sourceUrl: "",
  openedAt: "",
  note: "",
};
export function UserProductEditor({
  record,
  onClose,
}: {
  record?: UserProductRecord;
  onClose: () => void;
}) {
  const [input, setInput] = useState<UserProductInput>(
      record ? userProductInput(record) : INITIAL,
    ),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const notify = useApp((s) => s.notify);
  const save = async () => {
    setError("");
    setSaving(true);
    try {
      await saveUserProduct(input, record?.id);
      notify(
        record
          ? "Your product details were updated."
          : "Your product was added to your local wardrobe.",
      );
      onClose();
    } catch (error) {
      setError(
        error instanceof ZodError
          ? (error.issues[0]?.message ?? "Check your product details.")
          : error instanceof Error
            ? error.message
            : "Unable to save this product.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title={
        record ? "Your product, in detail." : "Make room for something yours."
      }
      onClose={onClose}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        className="user-product-form"
      >
        <p>
          Record a product you own. Ingredients and source links are entered by
          you; they are not independently verified or fetched.
        </p>
        <label className="field-label">
          Product name
          <input
            aria-label="Owned product name"
            value={input.name}
            maxLength={180}
            required
            onChange={(e) => setInput({ ...input, name: e.target.value })}
          />
        </label>
        <div className="user-product-fields">
          <label className="field-label">
            Brand
            <input
              value={input.brand}
              maxLength={100}
              onChange={(e) => setInput({ ...input, brand: e.target.value })}
            />
          </label>
          <label className="field-label">
            Category
            <select
              value={input.category}
              onChange={(e) =>
                setInput({
                  ...input,
                  category: e.target.value as UserProductInput["category"],
                })
              }
            >
              {[
                "cleanser",
                "moisturizer",
                "serum",
                "sunscreen",
                "lipstick",
                "blush",
                "foundation",
                "eyeshadow",
                "haircare",
                "other",
              ].map((c) => (
                <option key={c} value={c}>
                  {c[0].toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          Shade or size, as labelled
          <input
            value={input.variantName}
            maxLength={120}
            placeholder="For example, Berry 04 · 30 ml"
            onChange={(e) =>
              setInput({ ...input, variantName: e.target.value })
            }
          />
        </label>
        <label className="field-label">
          Ingredient text source
          <select
            value={input.ingredientSource}
            onChange={(e) =>
              setInput({
                ...input,
                ingredientSource: e.target
                  .value as UserProductInput["ingredientSource"],
              })
            }
          >
            <option value="not-provided">Not provided</option>
            <option value="packaging">Copied from my packaging</option>
            <option value="manufacturer-page">
              Copied from a manufacturer page
            </option>
          </select>
        </label>
        <label className="field-label">
          INCI ingredient text
          <textarea
            aria-label="Owned product INCI"
            value={input.inci}
            maxLength={15000}
            rows={4}
            placeholder="Paste the ingredient names exactly as labelled, separated by commas."
            onChange={(e) => setInput({ ...input, inci: e.target.value })}
          />
        </label>
        <label className="field-label">
          Reference page (optional unless ingredients came from it)
          <input
            type="url"
            value={input.sourceUrl}
            placeholder="https://…"
            onChange={(e) => setInput({ ...input, sourceUrl: e.target.value })}
          />
        </label>
        <p className="fine-print">
          This link is saved as your reference. The app does not send a request
          to it or claim it is an official source.
        </p>
        <label className="field-label">
          Opened on (optional)
          <input
            type="date"
            value={input.openedAt}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setInput({ ...input, openedAt: e.target.value })}
          />
        </label>
        <label className="field-label">
          Your notes
          <textarea
            value={input.note}
            rows={3}
            maxLength={1500}
            onChange={(e) => setInput({ ...input, note: e.target.value })}
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full-width"
          type="submit"
          disabled={saving}
        >
          <Bookmark size={16} />
          {saving ? "Saving…" : "Save my product locally"}
        </button>
      </form>
    </Modal>
  );
}
export default function UserProducts({
  products,
}: {
  products: UserProductRecord[];
}) {
  const [editing, setEditing] = useState<UserProductRecord | null | undefined>(
      undefined,
    ),
    [inspecting, setInspecting] = useState<UserProductRecord | null>(null);
  const notify = useApp((s) => s.notify);
  return (
    <section className="user-products">
      <div className="user-products-heading">
        <div>
          <h2>Your own shelf.</h2>
          <p>Real products you own, in your own words.</p>
        </div>
        <button className="button secondary" onClick={() => setEditing(null)}>
          <Plus size={16} />
          Add my product
        </button>
      </div>
      {products.length ? (
        <div className="user-product-list">
          {products.map((product) => (
            <article key={product.id}>
              <div>
                <span>User-provided · {product.category}</span>
                <h3>{product.name}</h3>
                <p>
                  {product.brand}
                  {product.variantName ? ` · ${product.variantName}` : ""}
                </p>
                <small>
                  {product.ingredients.length
                    ? `${product.ingredients.length} ingredient names · ${product.ingredientSource === "packaging" ? "from packaging" : "user-provided page"}`
                    : "No ingredient list recorded"}
                </small>
              </div>
              <div>
                <button onClick={() => setInspecting(product)}>
                  Inspect ingredients <ArrowUpRight size={14} />
                </button>
                <button onClick={() => setEditing(product)}>Edit</button>
                <button
                  aria-label={`Delete owned product ${product.name}`}
                  onClick={() =>
                    void removeUserProduct(product.id)
                      .then(() =>
                        notify(
                          "Your product record and wardrobe entry were deleted.",
                        ),
                      )
                      .catch((error) =>
                        notify(
                          error instanceof Error
                            ? error.message
                            : "Unable to delete this product.",
                        ),
                      )
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="fine-print">
          Add the products beside your mirror. No purchase history or account is
          required.
        </p>
      )}
      {editing !== undefined && (
        <UserProductEditor
          record={editing ?? undefined}
          onClose={() => setEditing(undefined)}
        />
      )}{" "}
      {inspecting && (
        <Modal title={inspecting.name} onClose={() => setInspecting(null)}>
          <p>
            {inspecting.brand} ·{" "}
            {inspecting.variantName || "Variant not recorded"}
          </p>
          <p className="fine-print">
            This is your ingredient record from{" "}
            {inspecting.ingredientSource === "packaging"
              ? "packaging"
              : inspecting.ingredientSource === "manufacturer-page"
                ? "a page you supplied"
                : "no supplied source"}
            . It has not been independently verified. Ingredient names do not
            establish concentration, tolerance or a complete formulation match.
          </p>
          {inspecting.sourceUrl && (
            <a
              className="text-action"
              href={inspecting.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Your reference page (not independently verified)
              <ArrowUpRight size={14} />
            </a>
          )}
          {inspecting.ingredients.length ? (
            <>
              <div className="ingredient-chips user-inci-list">
                {inspecting.ingredients.map((n) => (
                  <span key={n}>{n}</span>
                ))}
              </div>
              {inspectIngredients(inspecting.ingredients).map((note) => (
                <div key={note.inci} className="user-ingredient-note">
                  <strong>{note.inci}</strong>
                  <p>{note.role}</p>
                  <p>{note.note}</p>
                  <a href={note.sourceUrl} target="_blank" rel="noreferrer">
                    Source for cosmetic function
                    <ArrowUpRight size={12} />
                  </a>
                </div>
              ))}
            </>
          ) : (
            <p>No ingredient names have been supplied.</p>
          )}
        </Modal>
      )}
    </section>
  );
}
