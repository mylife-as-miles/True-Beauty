import { useMemo, useState, lazy, Suspense } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Search,
  ArrowUpRight,
  Heart,
  Plus,
  Check,
  ShoppingBag,
  X,
  Paintbrush,
} from "lucide-react";
import {
  SAMPLE_PRODUCTS,
  searchProducts,
  formatPrice,
  priceFor,
  productIllustration,
  findAlternatives,
  compareProducts,
  nearestShade,
  type Product,
  type Currency,
  type ProductCategory,
} from "../../../../packages/commerce-engine/src";
import { inspectIngredients } from "../../../../packages/beauty-intelligence/src";
import { db } from "../../../../packages/local-database/src";
import { useApp } from "../state/store";
import { Modal, IconButton, SectionTitle, Empty } from "./ui";
const ProductViewer = lazy(() => import("./ProductViewer"));
export default function Discover({
  ownedOnly = false,
}: {
  ownedOnly?: boolean;
}) {
  const context = useApp((s) => s.discoveryContext);
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState(context?.category ?? "all"),
    [currency, setCurrency] = useState<Currency>("NGN"),
    [selected, setSelected] = useState<Product | null>(() =>
      !ownedOnly && context?.productId
        ? (SAMPLE_PRODUCTS.find((p) => p.id === context.productId) ?? null)
        : null,
    ),
    [compare, setCompare] = useState<string[]>([]),
    [comparison, setComparison] = useState(false),
    [ingredient, setIngredient] = useState(""),
    [bagOpen, setBagOpen] = useState(false),
    [variant, setVariant] = useState(() => {
      const p = context?.productId
        ? SAMPLE_PRODUCTS.find((p) => p.id === context.productId)
        : undefined;
      return Math.max(
        0,
        p?.variants.findIndex(
          (v) => v.hex?.toLowerCase() === context?.color.toLowerCase(),
        ) ?? 0,
      );
    }),
    [view3d, setView3d] = useState(false);
  const notify = useApp((s) => s.notify);
  const owned = useLiveQuery(() => db.ownedProducts.toArray(), []) ?? [],
    bag = useLiveQuery(() => db.shoppingBags.toArray(), []) ?? [],
    wishlist = useLiveQuery(() => db.wishlists.get("favourites"), []);
  const products = useMemo(
    () =>
      searchProducts(query, {
        ...(category !== "all"
          ? { category: category as ProductCategory }
          : {}),
        ownedOnly,
        ownedIds: owned.map((o) => o.productId),
      }).sort((a, b) =>
        context
          ? (nearestShade(a, context.color)[0]?.distance ?? Infinity) -
            (nearestShade(b, context.color)[0]?.distance ?? Infinity)
          : 0,
      ),
    [query, category, ownedOnly, owned, context],
  );
  const addOwned = async (p: Product) => {
    const existing = owned.find((o) => o.productId === p.id);
    if (existing) {
      await db.ownedProducts.delete(existing.id);
      notify("Removed from your beauty wardrobe.");
    } else {
      await db.ownedProducts.add({
        id: crypto.randomUUID(),
        productId: p.id,
        name: p.name,
        addedAt: Date.now(),
      });
      notify("Added to your beauty wardrobe.");
    }
  };
  const toggleWish = async (p: Product) => {
    const ids = wishlist?.productIds ?? [];
    await db.wishlists.put({
      id: "favourites",
      name: "My favourites",
      productIds: ids.includes(p.id)
        ? ids.filter((id) => id !== p.id)
        : [...ids, p.id],
      createdAt: wishlist?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    });
  };
  const addBag = async (p: Product) => {
    const existing = bag.find((b) => b.productId === p.id);
    if (existing)
      await db.shoppingBags.update(existing.id, {
        quantity: Math.min(99, existing.quantity + 1),
      });
    else
      await db.shoppingBags.add({
        id: crypto.randomUUID(),
        productId: p.id,
        quantity: 1,
        addedAt: Date.now(),
      });
    notify("Added to your local shopping bag. No order has been placed.");
  };
  const tryProduct = (p: Product) => {
    const v = p.variants[variant] ?? p.variants[0];
    if (!v?.hex) return;
    const key =
      p.category === "foundation"
        ? "foundation"
        : p.category === "eyeshadow"
          ? "eyeshadow"
          : p.category === "blush"
            ? "blush"
            : "lipstick";
    useApp.getState().patchLayer(key, { color: v.hex, enabled: true });
    useApp.getState().setSpace("studio");
    setSelected(null);
    notify(
      "Illustrative product shade applied. Actual colour and wear will vary.",
    );
  };
  const pairs =
    compare.length === 2
      ? compareProducts(
          SAMPLE_PRODUCTS.find((p) => p.id === compare[0])!,
          SAMPLE_PRODUCTS.find((p) => p.id === compare[1])!,
        )
      : null;
  return (
    <>
      <SectionTitle
        overline={
          ownedOnly ? "Beauty wardrobe" : "Considered beauty. Personal choices."
        }
        title={
          ownedOnly
            ? "Good things, already yours."
            : "Find your next favourite."
        }
      >
        <button className="button secondary" onClick={() => setBagOpen(true)}>
          <ShoppingBag size={17} /> Your bag{" "}
          {bag.length > 0 && (
            <span>({bag.reduce((n, b) => n + b.quantity, 0)})</span>
          )}
        </button>
      </SectionTitle>
      <div className="discovery-intro">
        <p>
          {ownedOnly
            ? "Build more possibilities from the products you have."
            : "A considered edit of beauty essentials. Explore ingredients, try a shade, and find what feels right for you."}
        </p>
        <span className="sample-label">
          Sample catalogue · illustrative prices & ingredient subsets
        </span>
      </div>
      {context && !ownedOnly && (
        <div className="shade-context">
          <i style={{ background: context.color }} />
          <span>
            Similar digital shade references for {context.color.toUpperCase()}.
            A colour-distance comparison, not a calibrated physical match.
          </span>
          <button
            onClick={() => {
              useApp.getState().setDiscoveryContext(null);
              setCategory("all");
            }}
          >
            Clear <X size={13} />
          </button>
        </div>
      )}
      <div className="discovery-controls">
        <div className="search-input">
          <Search size={18} />
          <input
            aria-label="Search products"
            placeholder="A product, ingredient, or feeling…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <select
          aria-label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value as Currency)}
        >
          <option value="NGN">NGN ₦</option>
          <option value="USD">USD $</option>
        </select>
        {compare.length > 0 && (
          <button
            className="button secondary"
            disabled={compare.length !== 2}
            onClick={() => setComparison(true)}
          >
            Compare ({compare.length}/2)
          </button>
        )}
      </div>
      <div className="filter-tabs">
        {[
          ["all", "The full edit"],
          ["lipstick", "Lips"],
          ["blush", "Cheeks"],
          ["foundation", "Complexion"],
          ["eyeshadow", "Eyes"],
          ["cleanser", "Cleansers"],
          ["moisturizer", "Moisturisers"],
          ["serum", "Serums"],
          ["sunscreen", "Sun care"],
          ["haircare", "Hair"],
        ].map(([id, label]) => (
          <button
            className={category === id ? "active" : ""}
            key={id}
            onClick={() => setCategory(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((p, i) => (
            <article className="product-card" key={p.id}>
              <div className={`product-image product-ground-${i % 4}`}>
                <button
                  className="product-open"
                  aria-label={`View ${p.name}`}
                  onClick={() => {
                    setSelected(p);
                    setVariant(0);
                  }}
                >
                  <img
                    src={productIllustration(p)}
                    alt={`Original generic ${p.form} illustration; not an official ${p.brand} product photograph`}
                  />
                </button>
                <IconButton
                  className={`product-heart ${wishlist?.productIds.includes(p.id) ? "saved" : ""}`}
                  label={`Favourite ${p.name}`}
                  onClick={() => void toggleWish(p)}
                >
                  <Heart
                    size={18}
                    fill={
                      wishlist?.productIds.includes(p.id)
                        ? "currentColor"
                        : "none"
                    }
                  />
                </IconButton>
                <span className="product-category">{p.category}</span>
                <button
                  className="product-try"
                  onClick={() => {
                    setSelected(p);
                    setVariant(0);
                  }}
                >
                  {p.variants.some((v) => v.hex)
                    ? "Explore shades"
                    : "Take a closer look"}
                  <ArrowUpRight size={15} />
                </button>
              </div>
              <div className="product-meta">
                <span>{p.brand}</span>
                <button
                  className={`compare-check ${compare.includes(p.id) ? "selected" : ""}`}
                  onClick={() =>
                    setCompare((ids) =>
                      ids.includes(p.id)
                        ? ids.filter((id) => id !== p.id)
                        : ids.length < 2
                          ? [...ids, p.id]
                          : [ids[1], p.id],
                    )
                  }
                >
                  {compare.includes(p.id) ? (
                    <Check size={13} />
                  ) : (
                    <Plus size={13} />
                  )}
                  Compare
                </button>
              </div>
              <button
                className="product-name"
                onClick={() => {
                  setSelected(p);
                  setVariant(0);
                }}
              >
                {p.name}
              </button>
              <p className="product-description">{p.description}</p>
              <div className="product-bottom">
                <span>
                  {formatPrice(
                    priceFor(p, currency)?.amount ?? p.price,
                    currency,
                  )}{" "}
                  <small>sample</small>
                </span>
                <IconButton
                  label={`${owned.some((o) => o.productId === p.id) ? "Remove" : "Add"} ${p.name} ${owned.some((o) => o.productId === p.id) ? "from" : "to"} wardrobe`}
                  onClick={() => void addOwned(p)}
                >
                  {owned.some((o) => o.productId === p.id) ? (
                    <Check size={17} />
                  ) : (
                    <Plus size={18} />
                  )}
                </IconButton>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            ownedOnly ? "A wardrobe waiting for you." : "Nothing here just yet."
          }
          action={
            <button
              className="button primary"
              onClick={() =>
                ownedOnly
                  ? useApp.getState().setSpace("discover")
                  : (setQuery(""), setCategory("all"))
              }
            >
              {ownedOnly ? "Explore the beauty edit" : "Clear filters"}
            </button>
          }
        >
          {ownedOnly
            ? "Add products from the beauty edit to use them in your routines and recommendations."
            : "Try another name, ingredient, or category."}
        </Empty>
      )}
      <div className="catalog-disclaimer">
        Illustrations are original packaging studies. Prices are sample planning
        amounts, not live offers or currency conversions. Check the current
        label, availability and price directly with the brand.
      </div>
      {selected && (
        <Modal
          title={selected.name}
          wide
          onClose={() => {
            setSelected(null);
            setIngredient("");
          }}
        >
          <div className="product-detail">
            <div className="detail-media-column">
              {view3d ? (
                <Suspense
                  fallback={
                    <div className="view-loading">
                      Preparing your product study…
                    </div>
                  }
                >
                  <ProductViewer product={selected} />
                </Suspense>
              ) : (
                <div className="detail-product-image">
                  <img
                    src={productIllustration(selected)}
                    alt="Original generic packaging illustration"
                  />
                  <span>Original illustration · sample reference</span>
                </div>
              )}
              <button
                className="button secondary full-width"
                onClick={() => setView3d((v) => !v)}
              >
                {view3d
                  ? "Back to illustration"
                  : "Explore a 3D packaging study"}
              </button>
            </div>
            <div>
              <span className="subtle-label">{selected.brand}</span>
              <p>{selected.description}</p>
              <p className="detail-price">
                {formatPrice(
                  priceFor(selected, currency)?.amount ?? selected.price,
                  currency,
                )}{" "}
                <small>sample budget price</small>
              </p>
              {selected.variants.length > 1 && (
                <fieldset className="variant-picker">
                  <legend>Illustrative shades</legend>
                  {selected.variants.map((v, i) => (
                    <button
                      key={v.id}
                      aria-pressed={variant === i}
                      style={{ background: v.hex }}
                      className={variant === i ? "selected" : ""}
                      onClick={() => setVariant(i)}
                      title={v.name}
                    >
                      {variant === i && <Check size={15} />}
                      <span className="sr-only">{v.name}</span>
                    </button>
                  ))}
                  <p>{selected.variants[variant]?.name}</p>
                </fieldset>
              )}
              <div className="detail-actions">
                {selected.variants[variant]?.hex && (
                  <button
                    className="button primary"
                    onClick={() => tryProduct(selected)}
                  >
                    <Paintbrush size={16} />
                    Try this shade
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => void addOwned(selected)}
                >
                  {owned.some((o) => o.productId === selected.id) ? (
                    <Check size={16} />
                  ) : (
                    <Plus size={16} />
                  )}{" "}
                  {owned.some((o) => o.productId === selected.id)
                    ? "In your wardrobe"
                    : "I own this"}
                </button>
                <button
                  className="button secondary"
                  onClick={() => void addBag(selected)}
                >
                  <ShoppingBag size={16} />
                  Add to bag
                </button>
              </div>
              <h3>Inside the formula</h3>
              <p className="fine-print">
                Illustrative ingredient subset. Select an ingredient to explore
                its known cosmetic role.
              </p>
              <div className="ingredient-list">
                {selected.ingredients.map((n) => (
                  <button
                    className={ingredient === n ? "active" : ""}
                    onClick={() => setIngredient(n)}
                    key={n}
                  >
                    {n}
                  </button>
                ))}
              </div>
              {ingredient && (
                <div className="ingredient-lens">
                  <div>
                    <h4>{ingredient}</h4>
                    <IconButton
                      label="Close ingredient information"
                      onClick={() => setIngredient("")}
                    >
                      <X size={16} />
                    </IconButton>
                  </div>
                  {inspectIngredients([ingredient]).length ? (
                    inspectIngredients([ingredient]).map((n) => (
                      <div key={n.inci}>
                        <p>{n.role}</p>
                        <p>{n.note}</p>
                        <a href={n.sourceUrl} target="_blank" rel="noreferrer">
                          Source for cosmetic function{" "}
                          <ArrowUpRight size={13} />
                        </a>
                      </div>
                    ))
                  ) : (
                    <p>
                      No evidence note is available in the local knowledge base.
                      Ingredient concentration and the complete formulation
                      affect performance.
                    </p>
                  )}
                </div>
              )}
              <a
                className="text-action merchant-link"
                href={selected.merchantUrl}
                target="_blank"
                rel="noreferrer"
              >
                Visit official brand website <ArrowUpRight size={16} />
              </a>
              <p className="fine-print">
                {selected.provenance.note} Reference date:{" "}
                {new Date(selected.provenance.checkedAt).toLocaleDateString()}.
              </p>
            </div>
          </div>
          <div className="alternatives">
            <h3>A few alternatives to explore</h3>
            {findAlternatives(selected, { currency }).length ? (
              findAlternatives(selected, { currency }).map((a) => (
                <button
                  key={a.product.id}
                  onClick={() => {
                    setSelected(a.product);
                    setVariant(0);
                  }}
                >
                  {a.product.name}
                  <span>{formatPrice(a.price!.amount, currency)} · sample</span>
                  <ArrowUpRight size={15} />
                </button>
              ))
            ) : (
              <p>
                No lower-priced reference in this sample catalogue. We won’t
                invent a dupe.
              </p>
            )}
          </div>
        </Modal>
      )}
      {comparison && pairs && (
        <Modal
          title="A considered comparison."
          wide
          onClose={() => setComparison(false)}
        >
          <div className="comparison-columns">
            {[pairs.a, pairs.b].map((p) => (
              <div key={p.id}>
                <img
                  src={productIllustration(p)}
                  alt="Generic packaging illustration"
                />
                <p>{p.brand}</p>
                <h3>{p.name}</h3>
                <p>
                  {formatPrice(
                    priceFor(p, currency)?.amount ?? p.price,
                    currency,
                  )}{" "}
                  · sample
                </p>
                <h4>Ingredients in this reference</h4>
                <ul>
                  {p.ingredients.map((n) => (
                    <li key={n}>
                      {n}
                      {pairs.sharedIngredients.includes(n) && (
                        <span className="shared-ingredient"> · shared</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="info-note">{pairs.note}</div>
        </Modal>
      )}
      {bagOpen && (
        <Modal title="Your beauty bag." onClose={() => setBagOpen(false)}>
          {bag.length ? (
            <>
              <div className="bag-items">
                {bag.map((b) => {
                  const p = SAMPLE_PRODUCTS.find((p) => p.id === b.productId);
                  return p ? (
                    <div className="bag-item" key={b.id}>
                      <img src={productIllustration(p)} alt="" />
                      <div>
                        <strong>{p.name}</strong>
                        <span>
                          {formatPrice(
                            (priceFor(p, currency)?.amount ?? 0) * b.quantity,
                            currency,
                          )}{" "}
                          · sample
                        </span>
                        <label>
                          Quantity{" "}
                          <input
                            aria-label={`${p.name} quantity`}
                            type="number"
                            min="1"
                            max="99"
                            value={b.quantity}
                            onChange={(e) =>
                              void db.shoppingBags.update(b.id, {
                                quantity: Math.max(
                                  1,
                                  Math.min(99, Number(e.target.value) || 1),
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      <IconButton
                        label={`Remove ${p.name} from bag`}
                        onClick={() => void db.shoppingBags.delete(b.id)}
                      >
                        <X size={17} />
                      </IconButton>
                    </div>
                  ) : null;
                })}
              </div>
              <div className="bag-total">
                <span>Illustrative total</span>
                <strong>
                  {formatPrice(
                    bag.reduce(
                      (n, b) =>
                        n +
                        (priceFor(
                          SAMPLE_PRODUCTS.find((p) => p.id === b.productId)!,
                          currency,
                        )?.amount ?? 0) *
                          b.quantity,
                      0,
                    ),
                    currency,
                  )}
                </strong>
              </div>
              <p>
                Your bag is a local planning collection. Purchase directly from
                each brand; current prices and shipping are confirmed there.
              </p>
              {bag.map((b) => {
                const p = SAMPLE_PRODUCTS.find((p) => p.id === b.productId);
                return (
                  p && (
                    <a
                      className="button secondary full-width"
                      key={p.id}
                      href={p.merchantUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Shop {p.brand} <ArrowUpRight size={16} />
                    </a>
                  )
                );
              })}
            </>
          ) : (
            <Empty title="Something good will find its way here.">
              Explore the edit and add products to plan your next purchase.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
