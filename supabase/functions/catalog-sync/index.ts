// catalog-sync/index.ts
// Supabase Edge Function — pushes active products into the Meta Commerce
// Catalog connected to this business's WhatsApp number, so the queue-processor
// can send WhatsApp product-list ("carousel") messages instead of loose images.
//
// Call this manually (e.g. from a "Sync WhatsApp Catalog" button, or a cron)
// whenever products are added/changed. Safe to re-run — UPDATE upserts.
//
// PREREQUISITE (one-time, done by the business owner in Meta Commerce Manager):
//   1. Create a catalog (or reuse an existing one) in business.facebook.com/commerce
//   2. Connect that catalog to this WhatsApp Business Account
//      (WhatsApp Manager -> Business Settings -> Catalog)
//   3. Save the catalog's ID into business_settings.meta_catalog_id
// Without step 3, this function returns a clear error instead of guessing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { getSupabaseClient, getBusinessSettings } from "../_shared/supabase-client.ts";
import { getMetaAccessToken } from "../_shared/platform-send.ts";
import { syncProductsToCatalog, type CatalogProductInput } from "../_shared/meta-catalog.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const settings = await getBusinessSettings();

    if (!settings.metaCatalogId) {
      return new Response(
        JSON.stringify({
          error:
            "meta_catalog_id is not set in business_settings. Create/connect a catalog in Meta Commerce Manager first, then save its ID to business_settings.meta_catalog_id.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const sb = getSupabaseClient();
    const { data: products, error } = await sb
      .from("products")
      .select("id, name, description, images, regular_price, sale_price, stock_quantity, is_active, woo_product_id")
      .eq("is_active", true);

    if (error) throw error;
    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No active products to sync." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getMetaAccessToken();

    const catalogInputs: CatalogProductInput[] = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      images: p.images ?? [],
      regularPrice: p.regular_price,
      salePrice: p.sale_price,
      stockQuantity: p.stock_quantity,
      isActive: p.is_active,
    }));

    const wooProductIdByProductId: Record<string, number> = {};
    for (const p of products as any[]) {
      if (p.woo_product_id) wooProductIdByProductId[p.id] = p.woo_product_id;
    }

    const { succeeded, failed } = await syncProductsToCatalog(
      settings.metaCatalogId,
      accessToken,
      catalogInputs,
      settings.wooApiUrl,
      wooProductIdByProductId
    );

    if (succeeded.length > 0) {
      await sb
        .from("products")
        .update({ catalog_synced_at: new Date().toISOString() })
        .in("id", succeeded);
    }

    return new Response(
      JSON.stringify({
        success: true,
        synced: succeeded.length,
        failed: failed.length,
        failedDetails: failed.slice(0, 20), // cap payload size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("catalog-sync error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
