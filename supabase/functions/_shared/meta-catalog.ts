// _shared/meta-catalog.ts
// Syncs products into a Meta Commerce Catalog so they can be sent as
// WhatsApp product-list ("carousel") messages via sendWhatsAppProductList()
// in platform-send.ts.
//
// Docs: https://developers.facebook.com/docs/marketing-api/catalog-batch/reference
//
// We use the product's own DB `id` (uuid) as the catalog `retailer_id`,
// so no extra ID-mapping table is needed — the same id already used
// everywhere else in the app (order rows, product_embeddings, etc.)

const GRAPH_VERSION = "v19.0";

export interface CatalogProductInput {
  id: string; // used as retailer_id
  name: string;
  description?: string | null;
  images: string[];
  regularPrice: number;
  salePrice?: number | null;
  stockQuantity: number;
  isActive: boolean;
}

interface BatchRequestItem {
  method: "CREATE" | "UPDATE" | "DELETE";
  retailer_id: string;
  data?: Record<string, unknown>;
}

/**
 * Builds a product landing-page URL for the catalog `url` field.
 * Falls back to the WooCommerce site root if we don't have a specific
 * product permalink stored (we only store the numeric woo_product_id).
 */
function buildProductUrl(wooApiUrl: string | undefined, wooProductId: number | undefined): string {
  const base = (wooApiUrl || "").replace(/\/$/, "");
  if (!base) return "https://example.com"; // Meta requires a non-empty url; overwritten once wooApiUrl is set
  if (wooProductId) return `${base}/?p=${wooProductId}`;
  return base;
}

function toCatalogData(
  p: CatalogProductInput,
  wooApiUrl: string | undefined,
  wooProductId: number | undefined
): Record<string, unknown> {
  const price = p.salePrice ?? p.regularPrice;
  const availability = p.isActive && p.stockQuantity > 0 ? "in stock" : "out of stock";

  return {
    name: p.name.slice(0, 200),
    description: (p.description && p.description.trim()) || p.name,
    availability,
    condition: "new",
    price: `${Number(price).toFixed(2)} BDT`,
    image_url: p.images?.[0],
    url: buildProductUrl(wooApiUrl, wooProductId),
  };
}

/**
 * Pushes a batch of products (CREATE/UPDATE) to the Meta Commerce Catalog.
 * Chunks requests to stay well under Meta's per-call batch limits.
 */
export async function syncProductsToCatalog(
  catalogId: string,
  accessToken: string,
  products: CatalogProductInput[],
  wooApiUrl?: string,
  wooProductIdByProductId?: Record<string, number>
): Promise<{ succeeded: string[]; failed: { id: string; error: string }[] }> {
  const succeeded: string[] = [];
  const failed: { id: string; error: string }[] = [];

  const CHUNK_SIZE = 50;
  for (let i = 0; i < products.length; i += CHUNK_SIZE) {
    const chunk = products.slice(i, i + CHUNK_SIZE);
    const validChunk = chunk.filter((p) => p.images && p.images.length > 0);
    const skipped = chunk.filter((p) => !p.images || p.images.length === 0);
    for (const s of skipped) {
      failed.push({ id: s.id, error: "No product image — skipped (catalog requires image_url)" });
    }
    if (validChunk.length === 0) continue;

    const requests: BatchRequestItem[] = validChunk.map((p) => ({
      method: "UPDATE", // UPDATE upserts (creates if retailer_id doesn't exist yet)
      retailer_id: p.id,
      data: toCatalogData(p, wooApiUrl, wooProductIdByProductId?.[p.id]),
    }));

    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${catalogId}/items_batch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: accessToken,
            item_type: "PRODUCT_ITEM",
            requests,
          }),
        }
      );

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errMsg = json?.error?.message || (await res.text().catch(() => res.statusText));
        console.error(`[meta-catalog] items_batch failed for chunk starting at ${i}:`, errMsg);
        for (const p of validChunk) failed.push({ id: p.id, error: errMsg });
        continue;
      }

      // Meta's items_batch returns a handle for async processing; it doesn't
      // synchronously validate every row, so we optimistically mark these
      // as succeeded. Persistent bad rows show up in Commerce Manager diagnostics.
      for (const p of validChunk) succeeded.push(p.id);
    } catch (err: any) {
      console.error(`[meta-catalog] items_batch request threw for chunk starting at ${i}:`, err);
      for (const p of validChunk) failed.push({ id: p.id, error: String(err?.message || err) });
    }
  }

  return { succeeded, failed };
}

export async function deleteProductFromCatalog(
  catalogId: string,
  accessToken: string,
  productId: string
): Promise<void> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${catalogId}/items_batch`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: accessToken,
        item_type: "PRODUCT_ITEM",
        requests: [{ method: "DELETE", retailer_id: productId }],
      }),
    }
  );
  if (!res.ok) {
    console.error(`[meta-catalog] Failed to delete ${productId} from catalog:`, await res.text());
  }
}
