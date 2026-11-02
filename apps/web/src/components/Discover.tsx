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
  allowedReferenceUrl,
  bagTotals,
  type Product,
  type Currency,
  type ProductCategory,
} from "../../../../packages/commerce-engine/src";
import { inspectIngredients } from "../../../../packages/beauty-intelligence/src";
import {
  db,
  normalizeShoppingBag,
} from "../../../../packages/local-database/src";
import {
  addBagSelection,
  setBagQuantity,
  removeBagSelection,
  addObservedQuote,
} from "../../../../packages/commerce-engine/src/persistent-bag";
import MerchantSources from "./MerchantSources";
import UserProducts from "./UserProductForm";
import {
  asUserProductRecord,
  type UserProductRecord,
} from "../../../../packages/commerce-engine/src/user-products";
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
    [merchantOpen, setMerchantOpen] = useState(false),
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
  const savedProducts = useLiveQuery(() => db.products.toArray(), []) ?? [];
  const bagDetails = bag.map((raw) => {
    const line = normalizeShoppingBag(raw),
      product = SAMPLE_PRODUCTS.find((p) => p.id === line.productId),
      saved = savedProducts.find((p) => p.id === line.productId);
    const itemVariant = product?.variants.find((v) => v.id === line.variantId);
    const amount =
      line.unitPrice ??
      (line.priceKind !== "verified"
        ? product && priceFor(product, line.currency ?? "NGN")?.amount
        : undefined);
    return {
      line,
      product,
      name:
        line.productName ??
        product?.name ??
        saved?.name ??
        "Saved product reference",
      variantName:
        line.variantName ??
        itemVariant?.name ??
        (line.variantId === "default"
          ? "Shade or size not recorded"
          : (line.variantId ?? "Unspecified variant")),
      amount,
      currency: line.currency ?? "NGN",
    };
  });
  const planningTotals = bagTotals(
    bagDetails
      .filter((d) => d.amount !== undefined)
      .map((d) => ({
        item: {
          id: d.line.productId,
          name: d.name,
          kind: "makeup" as const,
          price: d.amount!,
          currency: d.currency,
          variantId: d.line.variantId,
          sourceKey: d.line.sourceKey,
          sample: d.line.priceKind !== "verified",
        },
        size: d.line.size,
        qty: d.line.quantity,
      })),
  );
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
    const selectedVariant = p.variants[variant] ?? p.variants[0],
      price = priceFor(p, currency);
    if (!selectedVariant || !price) {
      notify("No price is available for this variant and currency.");
      return;
    }
    try {
      await addBagSelection({
        productId: p.id,
        productName: p.name,
        variantId: selectedVariant.id,
        variantName: selectedVariant.name,
        size: selectedVariant.size,
        currency,
        unitPrice: price.amount,
        priceKind: "sample",
        sourceKey: "sample",
        sourceUrl: p.merchantUrl,
        priceObservedAt: price.observedAt,
      });
      notify(
        "Variant added to your local planning bag. No order has been placed.",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Unable to update the bag.");
    }
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
    useApp.getState().setFocusLayer(key);
    useApp.getState().setStudioMode("makeup");
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
        <div className="commerce-heading-actions">
          <button
            className="button secondary"
            onClick={() => setMerchantOpen(true)}
          >
            Source checks <ArrowUpRight size={15} />
          </button>
          <button className="button secondary" onClick={() => setBagOpen(true)}>
            <ShoppingBag size={17} /> Your bag{" "}
            {bag.length > 0 && (
              <span>({bag.reduce((n, b) => n + b.quantity, 0)})</span>
            )}
          </button>
        </div>
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
      {ownedOnly && (
        <UserProducts
          products={savedProducts
            .map(asUserProductRecord)
            .filter(
              (p): p is UserProductRecord =>
                !!p && owned.some((o) => o.productId === p.id),
            )}
        />
      )}
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
            ownedOnly
              ? "Explore sample references, too."
              : "Nothing here just yet."
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
              <button
                className="text-action"
                onClick={() => setMerchantOpen(true)}
              >
                Check reviewed merchant sources <ArrowUpRight size={14} />
              </button>
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
      {merchantOpen && (
        <Modal
          title="Merchant source notebook."
          wide
          onClose={() => setMerchantOpen(false)}
        >
          <MerchantSources
            productId={selected?.id}
            onAddQuote={addObservedQuote}
          />
        </Modal>
      )}
      {bagOpen && (
        <Modal title="Your beauty bag." onClose={() => setBagOpen(false)}>
          {bagDetails.length ? (
            <>
              <div className="bag-items">
                {bagDetails.map((d) => (
                  <div className="bag-item" key={d.line.id}>
                    <img
                      src={productIllustration(
                        d.product ?? { accent: "#b8a18f", form: "bottle" },
                      )}
                      alt="Original generic packaging illustration"
                    />
                    <div>
                      <strong>{d.name}</strong>
                      <span className="bag-variant-label">
                        {d.variantName}
                        {d.line.size ? ` · ${d.line.size}` : ""} · {d.currency}
                      </span>
                      <span>
                        {d.amount === undefined
                          ? "Price not recorded"
                          : formatPrice(
                              d.amount * d.line.quantity,
                              d.currency,
                            )}{" "}
                        ·{" "}
                        {d.line.imported || d.line.priceKind === "imported"
                          ? "imported, refresh source"
                          : d.line.priceKind === "verified"
                            ? "observed source quote"
                            : "sample budget estimate"}
                      </span>
                      {d.line.priceObservedAt && (
                        <small>
                          Price date:{" "}
                          {new Date(d.line.priceObservedAt).toLocaleString()}
                        </small>
                      )}
                      <label>
                        Quantity{" "}
                        <input
                          aria-label={`${d.name} ${d.variantName} ${d.currency} quantity`}
                          type="number"
                          min="1"
                          max="99"
                          step="1"
                          value={d.line.quantity}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            if (
                              !Number.isInteger(value) ||
                              value < 1 ||
                              value > 99
                            )
                              return;
                            void setBagQuantity(d.line.id, value).catch(
                              (error) =>
                                notify(
                                  error instanceof Error
                                    ? error.message
                                    : "Unable to update quantity.",
                                ),
                            );
                          }}
                        />
                      </label>
                    </div>
                    <IconButton
                      label={`Remove ${d.name} ${d.variantName} ${d.currency} from bag`}
                      onClick={() =>
                        void removeBagSelection(d.line.id).catch((error) =>
                          notify(
                            error instanceof Error
                              ? error.message
                              : "Unable to remove this line.",
                          ),
                        )
                      }
                    >
                      <X size={17} />
                    </IconButton>
                  </div>
                ))}
              </div>
              <div className="bag-planning-totals">
                <h3>Planning totals by currency</h3>
                {Object.entries(planningTotals).map(([unit, amount]) => (
                  <div className="bag-total" key={unit}>
                    <span>
                      {unit} ·{" "}
                      {bagDetails.some(
                        (d) =>
                          d.currency === unit &&
                          d.line.priceKind !== "verified",
                      )
                        ? "includes sample estimates"
                        : "observed quotes"}
                    </span>
                    <strong>{formatPrice(amount!, unit as Currency)}</strong>
                  </div>
                ))}
                {bagDetails.some((d) => d.amount === undefined) && (
                  <p>
                    Some lines have no recorded price and are excluded from
                    these totals.
                  </p>
                )}
              </div>
              <p>
                Your bag is a local planning collection. Currencies are kept
                separate; no exchange conversion, stock reservation or order has
                occurred. Sample amounts are estimates. Current prices, taxes
                and shipping are confirmed by the merchant.
              </p>
              {bagDetails.map((d) => {
                const link = d.line.sourceUrl ?? d.product?.merchantUrl;
                return link &&
                  (allowedReferenceUrl(link) ||
                    SAMPLE_PRODUCTS.some((p) => p.merchantUrl === link)) ? (
                  <a
                    className="text-action merchant-link"
                    key={d.line.id}
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify {d.name} with its source <ArrowUpRight size={14} />
                  </a>
                ) : null;
              })}
              <button
                className="button secondary full-width"
                onClick={() => {
                  setBagOpen(false);
                  setMerchantOpen(true);
                }}
              >
                Check reviewed merchant sources
                <ArrowUpRight size={14} />
              </button>
            </>
          ) : (
            <Empty title="A little space for discovery.">
              Explore a shade or a product and add the exact variant to your
              planning bag.
            </Empty>
          )}
        </Modal>
      )}
    </>
  );
}
