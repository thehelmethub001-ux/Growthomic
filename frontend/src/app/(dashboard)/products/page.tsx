"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type QnAPair = { question: string; answer: string };
type OrderField = { fieldName: string; question: string };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  regular_price: number;
  sale_price: number | null;
  stock_quantity: number;
  category: string | null;
  is_active: boolean;
  images: string[];
  description?: string;
  return_conditions?: string;
  qna_pairs?: QnAPair[];
  required_order_fields?: OrderField[];
  variations?: any[];
  manually_edited?: boolean;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [lastSyncTime, setLastSyncTime] = useState("12m ago");
  const [deleting, setDeleting] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({});

  const sb = createClient();

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("products").select("*").order("created_at", { ascending: false });

    const dummy: Product[] = [
      { id: "1", name: "Axor Apex Hunter Helmet", sku: "AX-APH-01", regular_price: 5800, sale_price: 5200, stock_quantity: 45, category: "Helmets", is_active: true, images: [], qna_pairs: [], required_order_fields: [] },
      { id: "2", name: "SMK Stellar Samurai Full Face", sku: "SMK-ST-09", regular_price: 6400, sale_price: null, stock_quantity: 12, category: "Helmets", is_active: true, images: [], qna_pairs: [], required_order_fields: [] },
      { id: "3", name: "Anti-Fog Visor Coating Spray", sku: "AC-VIS-04", regular_price: 450, sale_price: 390, stock_quantity: 3, category: "Accessories", is_active: true, images: [], qna_pairs: [], required_order_fields: [] },
      { id: "4", name: "Carbon Fiber Riding Gloves", sku: "AP-GLV-02", regular_price: 1850, sale_price: null, stock_quantity: 0, category: "Apparel", is_active: false, images: [], qna_pairs: [], required_order_fields: [] },
    ];

    setProducts(data && data.length > 0 ? (data as Product[]) : dummy);
    setLoading(false);
  };

  const handleSync = async () => {
    setSyncing(true);
    toast.loading("Syncing products from WooCommerce...", { id: "sync" });
    try {
      const res = await fetch("/api/woo-sync", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error || "Sync failed", { id: "sync" });
      } else {
        toast.success(`Successfully synced ${data.count} products!`, { id: "sync" });
        setLastSyncTime("Just now");
        load();
      }
    } catch (e: any) {
      toast.error("Network error during sync", { id: "sync" });
    }
    setSyncing(false);
  };

  const toggleActive = async (id: string, cur: boolean) => {
    await sb.from("products").update({ is_active: !cur }).eq("id", id);
    setProducts(ps => ps.map(p => (p.id === id ? { ...p, is_active: !cur } : p)));
    toast.success(`Product ${!cur ? "activated" : "deactivated"}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    setDeleting(id);
    await sb.from("products").delete().eq("id", id);
    setProducts(ps => ps.filter(p => p.id !== id));
    setDeleting(null);
    toast.success("Product deleted");
  };

  const openAddModal = () => {
    setFormData({
      name: "",
      sku: "",
      regular_price: 0,
      sale_price: null,
      stock_quantity: 0,
      category: "",
      description: "",
      return_conditions: "",
      images: [],
      qna_pairs: [],
      required_order_fields: [],
      is_active: true,
      variations: [],
    });
    setIsModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setFormData({ ...p });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || formData.regular_price === undefined) {
      toast.error("Name and Regular Price are required");
      return;
    }
    setSaving(true);

    const payload = {
      name: formData.name,
      sku: formData.sku || null,
      regular_price: formData.regular_price,
      sale_price: formData.sale_price || null,
      stock_quantity: formData.stock_quantity || 0,
      category: formData.category || null,
      is_active: formData.is_active ?? true,
      images: formData.images || [],
      description: formData.description || null,
      return_conditions: formData.return_conditions || null,
      qna_pairs: formData.qna_pairs || [],
      required_order_fields: formData.required_order_fields || [],
      variations: (formData.variations || []).map((v: any) => ({ ...v, manually_edited: true })),
      manually_edited: true,
    };

    if (formData.id) {
      const { error } = await sb.from("products").update(payload).eq("id", formData.id);
      if (error) {
        toast.error("Error updating product");
        console.error(error);
      } else {
        toast.success("Product updated");
        load();
        setIsModalOpen(false);
      }
    } else {
      const { error } = await sb.from("products").insert([payload]);
      if (error) {
        toast.error("Error adding product");
        console.error(error);
      } else {
        toast.success("Product added");
        load();
        setIsModalOpen(false);
      }
    }
    setSaving(false);
  };

  const helmetMatch = formData.description?.match(/\[Helmet Type: (.*?)\]/);
  const helmetType = helmetMatch ? helmetMatch[1] : "";

  const handleHelmetTypeChange = (type: string) => {
    let desc = formData.description || "";
    if (desc.includes("[Helmet Type:")) {
      desc = desc.replace(/\[Helmet Type: (.*?)\]/, type ? `[Helmet Type: ${type}]` : "");
    } else if (type) {
      desc += `\n[Helmet Type: ${type}]`;
    }
    setFormData({ ...formData, description: desc.trim() });
  };

  // Dynamic category calculations
  const categories = Array.from(new Set(products.map(p => p.category).filter(Boolean))) as string[];

  // Filter & sort
  const filtered = products.filter(p => {
    const matchSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.category || "").toLowerCase().includes(search.toLowerCase());

    const matchCategory =
      categoryFilter === "all" ||
      (p.category && p.category.toLowerCase() === categoryFilter.toLowerCase());

    const matchStock =
      stockFilter === "all" ||
      (stockFilter === "in_stock" && p.stock_quantity > 5) ||
      (stockFilter === "low_stock" && p.stock_quantity <= 5 && p.stock_quantity > 0) ||
      (stockFilter === "out_of_stock" && p.stock_quantity === 0);

    return matchSearch && matchCategory && matchStock;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "price_asc") return (a.sale_price ?? a.regular_price) - (b.sale_price ?? b.regular_price);
    if (sortBy === "price_desc") return (b.sale_price ?? b.regular_price) - (a.sale_price ?? a.regular_price);
    if (sortBy === "stock_asc") return a.stock_quantity - b.stock_quantity;
    return 0; // default recent
  });

  const totalSKUs = products.length;
  const inStockCount = products.filter(p => p.stock_quantity > 0).length;
  const lowStockCount = products.filter(p => p.stock_quantity <= 5 && p.stock_quantity > 0).length;
  const outOfStockCount = products.filter(p => p.stock_quantity === 0).length;

  return (
    <div style={{ maxWidth: 1440, margin: "0 auto", padding: "24px 24px 48px", display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header Section */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", borderBottom: "1px solid rgba(73,68,84,0.3)", paddingBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600, color: "#e5e2e1", letterSpacing: "-0.025em", fontFamily: "Geist, system-ui", margin: 0 }}>
            Products
          </h1>
          <p style={{ fontSize: 13, color: "#958ea0", marginTop: 4 }}>
            Manage your WooCommerce product catalog, real-time stock sync & pricing
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Sync from WooCommerce */}
          <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "7px 14px",
              background: "#1c1b1b",
              border: "1px solid rgba(73,68,84,0.4)",
              borderRadius: 6,
              color: "#e5e2e1",
              fontSize: 12,
              fontWeight: 500,
              cursor: syncing ? "not-allowed" : "pointer",
              transition: "background 0.15s",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: syncing ? "#a078ff" : "#958ea0", animation: syncing ? "spin 1s linear infinite" : "none" }}>
              sync
            </span>
            <span>{syncing ? "Syncing..." : "Sync from WooCommerce"}</span>
            <span style={{ fontSize: 10, color: "#958ea0", borderLeft: "1px solid rgba(73,68,84,0.4)", paddingLeft: 8, marginLeft: 2 }}>
              {lastSyncTime}
            </span>
          </button>

          {/* Add Product Button */}
          <button
            onClick={openAddModal}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 16px",
              background: "#a078ff",
              border: "none",
              borderRadius: 6,
              color: "#1e005d",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {/* Filters, Categories & Metrics Bar */}
      <div style={{ background: "rgba(28,27,27,0.6)", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          {/* Category Tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#0e0e0e", padding: 4, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)", overflowX: "auto", maxWidth: "100%" }}>
            <button
              onClick={() => setCategoryFilter("all")}
              style={{
                padding: "4px 12px",
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                background: categoryFilter === "all" ? "#201f1f" : "transparent",
                border: "none",
                color: categoryFilter === "all" ? "#e5e2e1" : "#958ea0",
                whiteSpace: "nowrap",
              }}
            >
              All <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>{totalSKUs}</span>
            </button>
            {categories.slice(0, 4).map(cat => {
              const count = products.filter(p => p.category?.toLowerCase() === cat.toLowerCase()).length;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat.toLowerCase())}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    background: categoryFilter === cat.toLowerCase() ? "#201f1f" : "transparent",
                    border: "none",
                    color: categoryFilter === cat.toLowerCase() ? "#e5e2e1" : "#958ea0",
                    whiteSpace: "nowrap",
                  }}
                >
                  {cat} <span style={{ fontSize: 11, color: "#958ea0", marginLeft: 4 }}>{count}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Filters, Search & View Controls */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* Search Input */}
            <div style={{ position: "relative", width: 220 }}>
              <span className="material-symbols-outlined" style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#958ea0" }}>
                search
              </span>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search products, SKUs..."
                style={{
                  width: "100%",
                  background: "#0e0e0e",
                  border: "1px solid rgba(73,68,84,0.4)",
                  borderRadius: 6,
                  padding: "6px 12px 6px 32px",
                  color: "#e5e2e1",
                  fontSize: 12,
                  outline: "none",
                }}
              />
            </div>

            {/* Stock Status Dropdown */}
            <select
              value={stockFilter}
              onChange={e => setStockFilter(e.target.value)}
              style={{
                background: "#0e0e0e",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#e5e2e1",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="all">All Stock</option>
              <option value="in_stock">In Stock (&gt;5)</option>
              <option value="low_stock">Low Stock (≤5)</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                background: "#0e0e0e",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 6,
                padding: "6px 10px",
                color: "#e5e2e1",
                fontSize: 12,
                cursor: "pointer",
                outline: "none",
              }}
            >
              <option value="recent">Recently Added</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="stock_asc">Stock: Low to High</option>
            </select>

            {/* Grid / List Switcher */}
            <div style={{ display: "flex", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: 2 }}>
              <button
                onClick={() => setViewMode("grid")}
                style={{
                  padding: 4,
                  borderRadius: 4,
                  background: viewMode === "grid" ? "#201f1f" : "transparent",
                  border: "none",
                  color: viewMode === "grid" ? "#d0bcff" : "#958ea0",
                  cursor: "pointer",
                  display: "flex",
                }}
                title="Grid View"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>grid_view</span>
              </button>
              <button
                onClick={() => setViewMode("list")}
                style={{
                  padding: 4,
                  borderRadius: 4,
                  background: viewMode === "list" ? "#201f1f" : "transparent",
                  border: "none",
                  color: viewMode === "list" ? "#d0bcff" : "#958ea0",
                  cursor: "pointer",
                  display: "flex",
                }}
                title="List View"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>view_list</span>
              </button>
            </div>
          </div>
        </div>

        {/* Metrics Chips Bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid rgba(73,68,84,0.2)", fontSize: 11, color: "#958ea0", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#958ea0" }} />
              Total SKUs: <strong style={{ color: "#e5e2e1", fontWeight: 600 }}>{totalSKUs}</strong>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80" }} />
              In Stock: <strong style={{ color: "#e5e2e1", fontWeight: 600 }}>{inStockCount}</strong>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24" }} />
              Low Stock: <strong style={{ color: "#e5e2e1", fontWeight: 600 }}>{lowStockCount}</strong>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f87171" }} />
              Out of Stock: <strong style={{ color: "#e5e2e1", fontWeight: 600 }}>{outOfStockCount}</strong>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>info</span>
            <span>WooCommerce Store #01 catalog synced with Gemini AI Assistant</span>
          </div>
        </div>
      </div>

      {/* Main Products Display */}
      {loading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {[...Array(8)].map((_, i) => (
            <div key={i} style={{ height: 320, background: "#1c1b1b", borderRadius: 10, border: "1px solid rgba(73,68,84,0.2)", animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, padding: "60px 20px", textAlign: "center", color: "#958ea0" }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.2, display: "block", margin: "0 auto 12px" }}>inventory_2</span>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#e5e2e1", marginBottom: 4 }}>No products found</p>
          <p style={{ fontSize: 12 }}>{search ? "Try clearing your search query" : "Click 'Add Product' or 'Sync from WooCommerce' to import products."}</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GRID VIEW (4 COLUMNS) */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {sorted.map(p => {
            const isOutOfStock = p.stock_quantity === 0;
            const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= 5;
            const stockColor = isOutOfStock ? "#f87171" : isLowStock ? "#fbbf24" : "#4ade80";
            const stockBg = isOutOfStock ? "rgba(239,68,68,0.1)" : isLowStock ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)";
            const stockBorder = isOutOfStock ? "rgba(239,68,68,0.3)" : isLowStock ? "rgba(245,158,11,0.3)" : "rgba(34,197,94,0.3)";

            return (
              <div
                key={p.id}
                style={{
                  background: "#1c1b1b",
                  border: "1px solid rgba(73,68,84,0.3)",
                  borderRadius: 10,
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  transition: "border-color 0.15s, transform 0.15s",
                }}
              >
                {/* Product Image / Category badge */}
                <div style={{ position: "relative", height: 160, background: "#131313", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", borderBottom: "1px solid rgba(73,68,84,0.2)" }}>
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span className="material-symbols-outlined" style={{ fontSize: 42, color: "#958ea0", opacity: 0.3 }}>
                      two_wheeler
                    </span>
                  )}

                  {/* Category Badge Top Left */}
                  {p.category && (
                    <span style={{ position: "absolute", top: 10, left: 10, background: "rgba(14,14,14,0.85)", backdropFilter: "blur(4px)", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 500, color: "#cbc3d7" }}>
                      {p.category}
                    </span>
                  )}

                  {/* Stock Status Badge Top Right */}
                  <span style={{ position: "absolute", top: 10, right: 10, background: stockBg, border: `1px solid ${stockBorder}`, color: stockColor, borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 5, height: 5, borderRadius: "50%", background: stockColor }} />
                    {isOutOfStock ? "Out of Stock" : isLowStock ? `Low (${p.stock_quantity})` : `In Stock (${p.stock_quantity})`}
                  </span>
                </div>

                {/* Card Body */}
                <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 600, color: "#e5e2e1", margin: 0, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {p.name}
                      </h3>
                      {p.manually_edited && (
                        <span title="Manually edited (won't be overwritten by WooCommerce sync)" style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24", padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600, flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 10 }}>lock</span>
                          LOCKED
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: "#958ea0", marginTop: 4, fontFamily: "monospace" }}>
                      {p.sku ? `SKU: ${p.sku}` : "No SKU assigned"}
                    </p>
                  </div>

                  {/* Price & Variations count */}
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: "auto", paddingTop: 8 }}>
                    <div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#e5e2e1" }}>
                        ৳ {(p.sale_price || p.regular_price || 0).toLocaleString()}
                      </span>
                      {p.sale_price && (
                        <span style={{ fontSize: 11, color: "#958ea0", textDecoration: "line-through", marginLeft: 6 }}>
                          ৳ {(p.regular_price || 0).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {p.variations && p.variations.length > 0 && (
                      <span style={{ fontSize: 11, color: "#d0bcff", background: "rgba(160,120,255,0.1)", padding: "2px 6px", borderRadius: 4, border: "1px solid rgba(160,120,255,0.25)" }}>
                        {p.variations.length} variants
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div style={{ padding: "10px 14px", borderTop: "1px solid rgba(73,68,84,0.2)", background: "rgba(14,14,14,0.4)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  {/* Active Toggle Switch */}
                  <button
                    onClick={() => toggleActive(p.id, p.is_active)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: "transparent",
                      border: "none",
                      color: p.is_active ? "#4ade80" : "#958ea0",
                      fontSize: 11,
                      fontWeight: 500,
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: p.is_active ? "#4ade80" : "#958ea0" }}>
                      {p.is_active ? "toggle_on" : "toggle_off"}
                    </span>
                    <span>{p.is_active ? "Active" : "Draft"}</span>
                  </button>

                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      onClick={() => openEditModal(p)}
                      title="Edit Product & AI Rules"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        background: "#201f1f",
                        border: "1px solid rgba(73,68,84,0.4)",
                        color: "#e5e2e1",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      disabled={deleting === p.id}
                      title="Delete Product"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 4,
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        color: "#f87171",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        opacity: deleting === p.id ? 0.5 : 1,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST / TABLE VIEW */
        <div style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "rgba(14,14,14,0.6)", borderBottom: "1px solid rgba(73,68,84,0.3)", color: "#958ea0", textTransform: "uppercase", fontSize: 10, letterSpacing: "0.05em", textAlign: "left" }}>
                <th style={{ padding: "10px 16px" }}>Product</th>
                <th style={{ padding: "10px 16px" }}>SKU</th>
                <th style={{ padding: "10px 16px" }}>Category</th>
                <th style={{ padding: "10px 16px" }}>Price</th>
                <th style={{ padding: "10px 16px" }}>Stock</th>
                <th style={{ padding: "10px 16px" }}>Status</th>
                <th style={{ padding: "10px 16px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const isOutOfStock = p.stock_quantity === 0;
                const isLowStock = p.stock_quantity > 0 && p.stock_quantity <= 5;
                const stockColor = isOutOfStock ? "#f87171" : isLowStock ? "#fbbf24" : "#4ade80";

                return (
                  <tr
                    key={p.id}
                    style={{ borderBottom: "1px solid rgba(73,68,84,0.15)", transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "#201f1f")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 6, background: "#131313", border: "1px solid rgba(73,68,84,0.3)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {p.images?.[0] ? (
                            <img src={p.images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#958ea0" }}>two_wheeler</span>
                          )}
                        </div>
                        <div>
                          <div style={{ color: "#e5e2e1", fontWeight: 600 }}>{p.name}</div>
                          {p.manually_edited && (
                            <span style={{ fontSize: 9, color: "#fbbf24", display: "inline-flex", alignItems: "center", gap: 2 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 10 }}>lock</span>
                              Manually Edited
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: "12px 16px", color: "#958ea0", fontFamily: "monospace" }}>{p.sku || "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#cbc3d7" }}>{p.category || "—"}</td>
                    <td style={{ padding: "12px 16px", color: "#e5e2e1", fontWeight: 600 }}>
                      ৳ {(p.sale_price || p.regular_price || 0).toLocaleString()}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: stockColor, fontWeight: 500 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: stockColor }} />
                        {p.stock_quantity}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <button
                        onClick={() => toggleActive(p.id, p.is_active)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: p.is_active ? "#4ade80" : "#958ea0",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{p.is_active ? "toggle_on" : "toggle_off"}</span>
                        {p.is_active ? "Active" : "Draft"}
                      </button>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 6 }}>
                        <button
                          onClick={() => openEditModal(p)}
                          style={{ width: 28, height: 28, borderRadius: 4, background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: "#e5e2e1", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>edit</span>
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          disabled={deleting === p.id}
                          style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "#f87171", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Overlay (Edit / Add Product) */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                background: "#1c1b1b",
                border: "1px solid rgba(73,68,84,0.4)",
                borderRadius: 12,
                width: "100%",
                maxWidth: 820,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                maxHeight: "90vh",
                boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              }}
            >
              {/* Modal Header */}
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(73,68,84,0.3)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#131313" }}>
                <div>
                  <h2 style={{ fontSize: 16, fontWeight: 600, color: "#e5e2e1", margin: 0 }}>
                    {formData.id ? "Edit Product" : "Add Product"}
                  </h2>
                  <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>
                    Configure pricing, inventory, variations & AI instructions
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{ background: "transparent", border: "none", color: "#958ea0", cursor: "pointer", padding: 4 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Basic Info */}
                <div>
                  <h3 style={{ fontSize: 12, fontWeight: 600, color: "#d0bcff", marginBottom: 12, display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>inventory_2</span>
                    Basic Details
                  </h3>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Product Name *</label>
                      <input
                        value={formData.name || ""}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        placeholder="e.g. Axor Apex Hunter Helmet"
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>SKU</label>
                      <input
                        value={formData.sku || ""}
                        onChange={e => setFormData({ ...formData, sku: e.target.value })}
                        placeholder="e.g. AX-APH-01"
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Regular Price (৳) *</label>
                      <input
                        type="number"
                        value={formData.regular_price || 0}
                        onChange={e => setFormData({ ...formData, regular_price: parseFloat(e.target.value) || 0 })}
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Sale Price (৳)</label>
                      <input
                        type="number"
                        value={formData.sale_price || ""}
                        onChange={e => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || null })}
                        placeholder="Leave blank if no discount"
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Stock Quantity</label>
                      <input
                        type="number"
                        value={formData.stock_quantity || 0}
                        onChange={e => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })}
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Category</label>
                      <input
                        value={formData.category || ""}
                        onChange={e => setFormData({ ...formData, category: e.target.value })}
                        placeholder="e.g. Helmets"
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Helmet Type (Optional)</label>
                      <select
                        value={helmetType}
                        onChange={e => handleHelmetTypeChange(e.target.value)}
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      >
                        <option value="">None / Not a helmet</option>
                        <option value="Full Face">Full Face</option>
                        <option value="Half Face">Half Face</option>
                        <option value="Modular">Modular</option>
                        <option value="Off-Road">Off-Road</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Image URL</label>
                      <input
                        value={formData.images?.[0] || ""}
                        onChange={e => setFormData({ ...formData, images: e.target.value ? [e.target.value] : [] })}
                        placeholder="https://example.com/helmet.jpg"
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "7px 10px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                      />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#958ea0", marginBottom: 4 }}>Product Description</label>
                      <textarea
                        value={formData.description || ""}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                        placeholder="Used by AI to understand features, material, safety certifications, etc."
                        style={{ width: "100%", background: "#0e0e0e", border: "1px solid rgba(73,68,84,0.4)", borderRadius: 6, padding: "8px 10px", color: "#e5e2e1", fontSize: 12, minHeight: 70, resize: "vertical", outline: "none" }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(73,68,84,0.25)" }} />

                {/* Variations */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#d0bcff", display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>sell</span>
                        Product Variations
                      </h3>
                      <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>Sizes, colors, and specific image URLs</p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          variations: [
                            ...(formData.variations || []),
                            { id: Date.now(), attributes: { Variation: "" }, price: formData.regular_price || 0, stock: 0, image_url: "" },
                          ],
                        })
                      }
                      style={{ background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: "#e5e2e1", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add Variation
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {formData.variations?.map((v, idx) => {
                      const attrVal = Object.entries(v.attributes || {})
                        .map(([k, val]) => (k === "Variation" ? val : `${k}: ${val}`))
                        .join(", ");
                      return (
                        <div key={v.id || idx} style={{ background: "#0e0e0e", padding: "12px 14px", borderRadius: 8, border: "1px solid rgba(73,68,84,0.35)", display: "flex", flexDirection: "column", gap: 10 }}>
                          {/* Variation Card Header */}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "#d0bcff", background: "rgba(160,120,255,0.12)", border: "1px solid rgba(160,120,255,0.25)", padding: "2px 8px", borderRadius: 4 }}>
                                Variation #{idx + 1}
                              </span>
                              {attrVal && (
                                <span style={{ fontSize: 11, color: "#e5e2e1", fontWeight: 500, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {attrVal}
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => {
                                const newVars = [...(formData.variations || [])];
                                newVars.splice(idx, 1);
                                setFormData({ ...formData, variations: newVars });
                              }}
                              title="Delete Variation"
                              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171", padding: "4px 8px", borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 11 }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                              <span>Remove</span>
                            </button>
                          </div>

                          {/* 4 Labeled Columns */}
                          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 8 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                                Attributes / Specs
                              </label>
                              <input
                                placeholder="Color: Black, Size: L"
                                value={attrVal}
                                onChange={e => {
                                  const newVars = [...(formData.variations || [])];
                                  newVars[idx].attributes = { Variation: e.target.value };
                                  setFormData({ ...formData, variations: newVars });
                                }}
                                style={{ width: "100%", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", borderRadius: 4, padding: "6px 9px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                                Woo Var ID
                              </label>
                              <input
                                type="number"
                                placeholder="e.g. 25610"
                                value={v.woo_variation_id || ""}
                                onChange={e => {
                                  const newVars = [...(formData.variations || [])];
                                  newVars[idx].woo_variation_id = parseInt(e.target.value) || undefined;
                                  setFormData({ ...formData, variations: newVars });
                                }}
                                style={{ width: "100%", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", borderRadius: 4, padding: "6px 9px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                                Price (৳)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g. 2399"
                                value={v.price}
                                onChange={e => {
                                  const newVars = [...(formData.variations || [])];
                                  newVars[idx].price = parseFloat(e.target.value) || 0;
                                  setFormData({ ...formData, variations: newVars });
                                }}
                                style={{ width: "100%", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", borderRadius: 4, padding: "6px 9px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                                Stock
                              </label>
                              <input
                                type="number"
                                placeholder="e.g. 10"
                                value={v.stock}
                                onChange={e => {
                                  const newVars = [...(formData.variations || [])];
                                  newVars[idx].stock = parseInt(e.target.value) || 0;
                                  setFormData({ ...formData, variations: newVars });
                                }}
                                style={{ width: "100%", background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", borderRadius: 4, padding: "6px 9px", color: "#e5e2e1", fontSize: 12, outline: "none" }}
                              />
                            </div>
                          </div>

                          {/* Image URL with Preview Thumbnail */}
                          <div>
                            <label style={{ display: "block", fontSize: 10, fontWeight: 600, color: "#958ea0", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                              Variation Image URL
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {v.image_url ? (
                                <img
                                  src={v.image_url}
                                  alt=""
                                  style={{ width: 34, height: 34, borderRadius: 4, objectFit: "cover", border: "1px solid rgba(73,68,84,0.4)", flexShrink: 0 }}
                                  onError={e => { (e.currentTarget as HTMLElement).style.display = "none"; }}
                                />
                              ) : (
                                <div style={{ width: 34, height: 34, borderRadius: 4, background: "#1c1b1b", border: "1px dashed rgba(73,68,84,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#958ea0", flexShrink: 0 }}>
                                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>image</span>
                                </div>
                              )}
                              <input
                                placeholder="https://domain.com/image.jpg"
                                value={v.image_url || ""}
                                onChange={e => {
                                  const newVars = [...(formData.variations || [])];
                                  newVars[idx].image_url = e.target.value;
                                  setFormData({ ...formData, variations: newVars });
                                }}
                                style={{ flex: 1, background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.35)", borderRadius: 4, padding: "6px 9px", color: "#e5e2e1", fontSize: 11, outline: "none" }}
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {(!formData.variations || formData.variations.length === 0) && (
                      <div style={{ fontSize: 12, color: "#958ea0", textAlign: "center", padding: "16px 0", background: "#0e0e0e", borderRadius: 6, border: "1px dashed rgba(73,68,84,0.3)" }}>
                        No variations configured for this product. Click &quot;+ Add Variation&quot; above.
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(73,68,84,0.25)" }} />

                {/* AI Instructions (Q&A) */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#d0bcff", display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_toy</span>
                        AI Q&A Instructions
                      </h3>
                      <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>Teach the AI how to answer customer questions about this item</p>
                    </div>
                    <button
                      onClick={() => setFormData({ ...formData, qna_pairs: [...(formData.qna_pairs || []), { question: "", answer: "" }] })}
                      style={{ background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: "#e5e2e1", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add Q&A
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {formData.qna_pairs?.map((qna, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#0e0e0e", padding: 10, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                          <input
                            placeholder="Customer Question (e.g. Is this DOT / ECE certified?)"
                            value={qna.question}
                            onChange={e => {
                              const newQna = [...(formData.qna_pairs || [])];
                              newQna[idx].question = e.target.value;
                              setFormData({ ...formData, qna_pairs: newQna });
                            }}
                            style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, padding: "5px 8px", color: "#e5e2e1", fontSize: 11 }}
                          />
                          <textarea
                            placeholder="AI Answer (e.g. Yes, it has dual DOT & ECE 22.06 certification...)"
                            value={qna.answer}
                            onChange={e => {
                              const newQna = [...(formData.qna_pairs || [])];
                              newQna[idx].answer = e.target.value;
                              setFormData({ ...formData, qna_pairs: newQna });
                            }}
                            style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, padding: "5px 8px", color: "#e5e2e1", fontSize: 11, minHeight: 40, resize: "vertical" }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newQna = [...(formData.qna_pairs || [])];
                            newQna.splice(idx, 1);
                            setFormData({ ...formData, qna_pairs: newQna });
                          }}
                          style={{ background: "rgba(239,68,68,0.1)", border: "none", color: "#f87171", padding: 6, borderRadius: 4, cursor: "pointer" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    ))}
                    {(!formData.qna_pairs || formData.qna_pairs.length === 0) && (
                      <div style={{ fontSize: 11, color: "#958ea0", textAlign: "center", padding: "8px 0" }}>No custom instructions added.</div>
                    )}
                  </div>
                </div>

                <div style={{ height: 1, background: "rgba(73,68,84,0.25)" }} />

                {/* Required Order Fields */}
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <div>
                      <h3 style={{ fontSize: 12, fontWeight: 600, color: "#d0bcff", display: "flex", alignItems: "center", gap: 6, textTransform: "uppercase", letterSpacing: "0.05em", margin: 0 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>checklist</span>
                        Required Order Fields
                      </h3>
                      <p style={{ fontSize: 11, color: "#958ea0", marginTop: 2, margin: 0 }}>What the AI must ask before confirming an order for this item</p>
                    </div>
                    <button
                      onClick={() =>
                        setFormData({
                          ...formData,
                          required_order_fields: [...(formData.required_order_fields || []), { fieldName: "", question: "" }],
                        })
                      }
                      style={{ background: "#201f1f", border: "1px solid rgba(73,68,84,0.4)", color: "#e5e2e1", padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Add Field
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {formData.required_order_fields?.map((field, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center", background: "#0e0e0e", padding: 10, borderRadius: 6, border: "1px solid rgba(73,68,84,0.3)" }}>
                        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
                          <input
                            placeholder="Field Name (e.g. Helmet Size)"
                            value={field.fieldName}
                            onChange={e => {
                              const newFields = [...(formData.required_order_fields || [])];
                              newFields[idx].fieldName = e.target.value;
                              setFormData({ ...formData, required_order_fields: newFields });
                            }}
                            style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, padding: "5px 8px", color: "#e5e2e1", fontSize: 11 }}
                          />
                          <input
                            placeholder="Question to ask (e.g. What helmet size do you need: M, L, or XL?)"
                            value={field.question}
                            onChange={e => {
                              const newFields = [...(formData.required_order_fields || [])];
                              newFields[idx].question = e.target.value;
                              setFormData({ ...formData, required_order_fields: newFields });
                            }}
                            style={{ background: "#1c1b1b", border: "1px solid rgba(73,68,84,0.3)", borderRadius: 4, padding: "5px 8px", color: "#e5e2e1", fontSize: 11 }}
                          />
                        </div>
                        <button
                          onClick={() => {
                            const newFields = [...(formData.required_order_fields || [])];
                            newFields.splice(idx, 1);
                            setFormData({ ...formData, required_order_fields: newFields });
                          }}
                          style={{ background: "rgba(239,68,68,0.1)", border: "none", color: "#f87171", padding: 6, borderRadius: 4, cursor: "pointer" }}
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>delete</span>
                        </button>
                      </div>
                    ))}
                    {(!formData.required_order_fields || formData.required_order_fields.length === 0) && (
                      <div style={{ fontSize: 11, color: "#958ea0", textAlign: "center", padding: "8px 0" }}>No custom order fields required.</div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid rgba(73,68,84,0.3)", display: "flex", justifyContent: "flex-end", gap: 10, background: "#131313" }}>
                <button
                  onClick={() => setIsModalOpen(false)}
                  style={{ padding: "7px 16px", borderRadius: 6, border: "1px solid rgba(73,68,84,0.4)", background: "#201f1f", color: "#e5e2e1", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 20px",
                    borderRadius: 6,
                    border: "none",
                    background: "#a078ff",
                    color: "#1e005d",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>
                  <span>{saving ? "Saving..." : "Save Product"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
