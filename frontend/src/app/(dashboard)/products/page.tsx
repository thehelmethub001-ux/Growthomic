"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, btnPrimary, skeletonStyle, thStyle, tdStyle } from "@/lib/styles";
import { Plus, Search, Package, Edit2, Trash2, Tag, ToggleLeft, ToggleRight, X, Save, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

type QnAPair = { question: string; answer: string };
type OrderField = { fieldName: string; question: string };

type Product = {
  id: string; name: string; sku: string | null; regular_price: number;
  sale_price: number | null; stock_quantity: number; category: string | null;
  is_active: boolean; images: string[];
  description?: string; return_conditions?: string;
  qna_pairs?: QnAPair[]; required_order_fields?: OrderField[];
  variations?: any[];
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string|null>(null);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [formData, setFormData] = useState<Partial<Product>>({});

  const sb = createClient();

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await sb.from("products").select("*").order("created_at", { ascending: false });
    
    const dummy = [
      { id: "1", name: "Premium Cotton T-Shirt", sku: "TS-001", regular_price: 1200, sale_price: 950, stock_quantity: 45, category: "Clothing", is_active: true, images: [], qna_pairs: [], required_order_fields: [] },
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
        load();
      }
    } catch (e: any) {
      toast.error("Network error during sync", { id: "sync" });
    }
    setSyncing(false);
  };

  const toggleActive = async (id: string, cur: boolean) => {
    await sb.from("products").update({ is_active: !cur }).eq("id", id);
    setProducts(ps => ps.map(p => p.id === id ? { ...p, is_active: !cur } : p));
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
      name: "", sku: "", regular_price: 0, sale_price: null, stock_quantity: 0, category: "",
      description: "", return_conditions: "", images: [], qna_pairs: [], required_order_fields: [], is_active: true, variations: []
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

    const payload = { ...formData };
    delete payload.id; // remove id for insert/update payload processing

    if (formData.id) {
      // Update
      const { error } = await sb.from("products").update(payload).eq("id", formData.id);
      if (error) { toast.error("Error updating product"); console.error(error); }
      else { toast.success("Product updated"); load(); setIsModalOpen(false); }
    } else {
      // Insert
      const { error } = await sb.from("products").insert([payload]);
      if (error) { toast.error("Error adding product"); console.error(error); }
      else { toast.success("Product added"); load(); setIsModalOpen(false); }
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

  const shown = products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku || "").toLowerCase().includes(search.toLowerCase()));

  const activeCount = products.filter(p => p.is_active).length;
  const lowStock = products.filter(p => p.stock_quantity <= 5 && p.stock_quantity > 0).length;
  const outOfStock = products.filter(p => p.stock_quantity === 0).length;

  return (
    <div style={pageWrap}>
      {/* Header */}
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Products</h1>
          <p style={pageSubtitle}>Manage your catalog — products are used by the AI for Q&A and ordering</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: C.textMuted, pointerEvents: "none" }} />
            <input style={{ ...inputStyle, paddingLeft: 32, width: 220, fontSize: 12 }} placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button style={{ ...btnPrimary, background: "rgba(139,92,246,0.1)", color: C.brandLight, border: `1px solid rgba(139,92,246,0.3)` }} onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : "🔄 Sync WooCommerce"}
          </button>
          <button style={btnPrimary} onClick={openAddModal}>
            <Plus size={15} /> Add Product
          </button>
        </div>
      </div>

      {/* Stats row */}
      {!loading && products.length > 0 && (
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Total Products", value: products.length, color: C.brandLight, bg: "rgba(139,92,246,0.1)" },
            { label: "Active", value: activeCount, color: "#34d399", bg: "rgba(16,185,129,0.1)" },
            { label: "Low Stock (≤5)", value: lowStock, color: "#fbbf24", bg: "rgba(245,158,11,0.1)" },
            { label: "Out of Stock", value: outOfStock, color: "#fb7185", bg: "rgba(244,63,94,0.1)" },
          ].map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderRadius: 12, background: C.card, border: `1px solid ${C.border}`, flex: 1 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9, background: s.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Package size={15} color={s.color} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 10, color: C.textMuted, fontWeight: 600 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 700 }}>
            <thead>
              <tr>
                {["Product", "Price", "Stock", "Category", "Status", "Actions"].map(h => (
                  <th key={h} style={{ ...thStyle, textAlign: h === "Actions" ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}><td colSpan={6} style={{ padding: "8px 16px" }}>
                    <div style={{ ...skeletonStyle, height: 52, borderRadius: 8 }} />
                  </td></tr>
                ))
              ) : shown.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: "60px 16px", textAlign: "center", color: C.textMuted }}>
                  <Package size={52} style={{ opacity: 0.1, display: "block", margin: "0 auto 14px" }} />
                  <p style={{ fontSize: 14, fontWeight: 600, color: C.textSecondary, marginBottom: 4 }}>
                    {search ? "No products match your search" : "No products yet"}
                  </p>
                  <p style={{ fontSize: 12, color: C.textMuted }}>
                    {search ? "Try a different keyword" : "Click \"Add Product\" to add your first product"}
                  </p>
                </td></tr>
              ) : shown.map(p => {
                const stockColor = p.stock_quantity === 0 ? "#fb7185" : p.stock_quantity <= 5 ? "#fbbf24" : "#34d399";
                return (
                  <tr key={p.id} style={{ transition: "background 0.12s" }}>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 11, flexShrink: 0,
                          background: C.elevated, border: `1px solid ${C.border}`,
                          display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden",
                        }}>
                          {p.images?.[0]
                            ? <img src={p.images[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <Package size={18} color={C.textMuted} />
                          }
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13, color: C.textPrimary, marginBottom: 2 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: C.textMuted }}>{p.sku ? `SKU: ${p.sku}` : "No SKU"}</div>
                        </div>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: C.textPrimary }}>৳{p.regular_price?.toLocaleString()}</div>
                      {p.sale_price && <div style={{ fontSize: 11, color: "#34d399", marginTop: 1 }}>Sale: ৳{p.sale_price.toLocaleString()}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: stockColor, flexShrink: 0 }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: stockColor }}>{p.stock_quantity}</span>
                        {p.stock_quantity === 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fb7185" }}>OUT</span>}
                        {p.stock_quantity > 0 && p.stock_quantity <= 5 && <span style={{ fontSize: 10, fontWeight: 700, color: "#fbbf24" }}>LOW</span>}
                      </div>
                    </td>
                    <td style={tdStyle}>
                      {p.category
                        ? <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: "rgba(139,92,246,0.08)", border: `1px solid ${C.border}`, width: "fit-content" }}>
                          <Tag size={10} color={C.brandLight} />
                          <span style={{ fontSize: 11, fontWeight: 600, color: C.brandLight }}>{p.category}</span>
                        </div>
                        : <span style={{ fontSize: 11, color: C.textMuted }}>—</span>
                      }
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => toggleActive(p.id, p.is_active)} style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit",
                        background: p.is_active ? "rgba(16,185,129,0.1)" : "rgba(255,255,255,0.05)",
                        color: p.is_active ? "#34d399" : C.textMuted,
                        fontSize: 11, fontWeight: 700,
                      }}>
                        {p.is_active
                          ? <ToggleRight size={14} style={{ flexShrink: 0 }} />
                          : <ToggleLeft size={14} style={{ flexShrink: 0 }} />
                        }
                        {p.is_active ? "Active" : "Draft"}
                      </button>
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <button onClick={() => openEditModal(p)} style={{
                          width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border}`, cursor: "pointer",
                          background: C.elevated, color: C.textSecondary, display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} style={{
                          width: 32, height: 32, borderRadius: 8, border: "1px solid rgba(244,63,94,0.2)", cursor: "pointer",
                          background: "rgba(244,63,94,0.06)", color: "#fb7185", display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: deleting === p.id ? 0.5 : 1,
                        }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`tr:hover td{background:rgba(139,92,246,0.025)}`}</style>

      {/* Modal Overlay */}
      {isModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          {/* Modal Panel */}
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 24, width: "100%", maxWidth: 640, overflow: "hidden", display: "flex", flexDirection: "column", maxHeight: "90vh", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            
            {/* Modal Header */}
            <div style={{ padding: "20px 24px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: C.card }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, color: C.textPrimary }}>{formData.id ? "Edit Product" : "Add Product"}</h2>
                <p style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>Define product details and AI instructions</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} style={{ background: "transparent", border: "none", color: C.textMuted, cursor: "pointer", padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: 24, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 24 }}>
              
              {/* Basic Info */}
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}><Package size={16} color={C.brandLight}/> Basic Details</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Product Name *</label>
                    <input style={inputStyle} value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Red Cotton Shirt" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>SKU</label>
                    <input style={inputStyle} value={formData.sku || ""} onChange={e => setFormData({ ...formData, sku: e.target.value })} placeholder="e.g. SH-001" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Regular Price (৳) *</label>
                    <input style={inputStyle} type="number" value={formData.regular_price || 0} onChange={e => setFormData({ ...formData, regular_price: parseFloat(e.target.value) })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Sale Price (৳)</label>
                    <input style={inputStyle} type="number" value={formData.sale_price || ""} onChange={e => setFormData({ ...formData, sale_price: parseFloat(e.target.value) || null })} placeholder="Leave blank if no sale" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Stock Quantity</label>
                    <input style={inputStyle} type="number" value={formData.stock_quantity || 0} onChange={e => setFormData({ ...formData, stock_quantity: parseInt(e.target.value) || 0 })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Category</label>
                    <input style={inputStyle} value={formData.category || ""} onChange={e => setFormData({ ...formData, category: e.target.value })} placeholder="e.g. Clothing" />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Helmet Type (Optional)</label>
                    <select style={{...inputStyle, background: C.elevated}} value={helmetType} onChange={e => handleHelmetTypeChange(e.target.value)}>
                      <option value="">None / Not a helmet</option>
                      <option value="Full Face">Full Face</option>
                      <option value="Half Face">Half Face</option>
                      <option value="Modular">Modular</option>
                      <option value="Off-Road">Off-Road</option>
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Product Description</label>
                    <textarea style={{ ...inputStyle, minHeight: 80, resize: "vertical" }} value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder="Used by AI to understand the product details..." />
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textSecondary, marginBottom: 6 }}>Image URL</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input style={inputStyle} value={formData.images?.[0] || ""} onChange={e => setFormData({ ...formData, images: e.target.value ? [e.target.value] : [] })} placeholder="https://example.com/image.jpg" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Variations */}
              <div style={{ padding: 16, background: "rgba(245,158,11,0.04)", border: `1px solid rgba(245,158,11,0.15)`, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>🏷️ Product Variations</h3>
                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Define sizes, colors, and specific image URLs for variations</p>
                  </div>
                  <button onClick={() => setFormData({ ...formData, variations: [...(formData.variations || []), { id: Date.now(), attributes: { "Color/Size": "" }, price: formData.regular_price || 0, stock: 0, image_url: "" }] })} style={{ background: "rgba(245,158,11,0.1)", border: "none", color: "#fbbf24", padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus size={12} /> Add Variation
                  </button>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {formData.variations?.map((v, idx) => {
                    const attrKey = Object.keys(v.attributes || {})[0] || "Attribute";
                    const attrVal = Object.values(v.attributes || {})[0] as string || "";
                    return (
                    <div key={v.id || idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: C.elevated, padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                          <input style={{...inputStyle, fontSize:12}} placeholder="e.g. Color: Red, Size: M" value={attrVal} onChange={e => {
                            const newVars = [...(formData.variations || [])];
                            newVars[idx].attributes = { "Variation": e.target.value };
                            setFormData({ ...formData, variations: newVars });
                          }} />
                          <input style={{...inputStyle, fontSize:12}} type="number" placeholder="Price (৳)" value={v.price} onChange={e => {
                            const newVars = [...(formData.variations || [])];
                            newVars[idx].price = parseFloat(e.target.value) || 0;
                            setFormData({ ...formData, variations: newVars });
                          }} />
                          <input style={{...inputStyle, fontSize:12}} type="number" placeholder="Stock Qty" value={v.stock} onChange={e => {
                            const newVars = [...(formData.variations || [])];
                            newVars[idx].stock = parseInt(e.target.value) || 0;
                            setFormData({ ...formData, variations: newVars });
                          }} />
                        </div>
                        <input style={{...inputStyle, fontSize:12}} placeholder="Variation Image URL (Important for AI)" value={v.image_url || ""} onChange={e => {
                          const newVars = [...(formData.variations || [])];
                          newVars[idx].image_url = e.target.value;
                          setFormData({ ...formData, variations: newVars });
                        }} />
                      </div>
                      <button onClick={() => {
                        const newVars = [...(formData.variations || [])];
                        newVars.splice(idx, 1);
                        setFormData({ ...formData, variations: newVars });
                      }} style={{ background: "rgba(244,63,94,0.1)", border: "none", color: "#fb7185", padding: 6, borderRadius: 6, cursor: "pointer", height: "fit-content" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )})}
                  {(!formData.variations || formData.variations.length === 0) && (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "12px 0" }}>No variations added.</div>
                  )}
                </div>
              </div>

              {/* AI Instructions (Q&A) */}
              <div style={{ padding: 16, background: "rgba(139,92,246,0.04)", border: `1px solid rgba(139,92,246,0.15)`, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: C.brandLight, display: "flex", alignItems: "center", gap: 6 }}>✨ AI Instructions (Q&A)</h3>
                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>Teach the AI how to answer specific questions about this product</p>
                  </div>
                  <button onClick={() => setFormData({ ...formData, qna_pairs: [...(formData.qna_pairs || []), { question: "", answer: "" }] })} style={{ background: "rgba(139,92,246,0.1)", border: "none", color: C.brandLight, padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus size={12} /> Add Q&A
                  </button>
                </div>
                
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {formData.qna_pairs?.map((qna, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-start", background: C.elevated, padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                        <input style={{...inputStyle, fontSize:12}} placeholder="Customer Question (e.g. Does the color fade?)" value={qna.question} onChange={e => {
                          const newQna = [...(formData.qna_pairs || [])];
                          newQna[idx].question = e.target.value;
                          setFormData({ ...formData, qna_pairs: newQna });
                        }} />
                        <textarea style={{...inputStyle, fontSize:12, minHeight:50, resize:"vertical"}} placeholder="AI Answer (e.g. No, we use premium dye...)" value={qna.answer} onChange={e => {
                          const newQna = [...(formData.qna_pairs || [])];
                          newQna[idx].answer = e.target.value;
                          setFormData({ ...formData, qna_pairs: newQna });
                        }} />
                      </div>
                      <button onClick={() => {
                        const newQna = [...(formData.qna_pairs || [])];
                        newQna.splice(idx, 1);
                        setFormData({ ...formData, qna_pairs: newQna });
                      }} style={{ background: "rgba(244,63,94,0.1)", border: "none", color: "#fb7185", padding: 6, borderRadius: 6, cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {(!formData.qna_pairs || formData.qna_pairs.length === 0) && (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "12px 0" }}>No custom instructions added.</div>
                  )}
                </div>
              </div>

              {/* Order Form Fields */}
              <div style={{ padding: 16, background: "rgba(16,185,129,0.04)", border: `1px solid rgba(16,185,129,0.15)`, borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: "#34d399", display: "flex", alignItems: "center", gap: 6 }}>📝 Required Order Fields</h3>
                    <p style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>What the AI must ask before confirming an order for this item</p>
                  </div>
                  <button onClick={() => setFormData({ ...formData, required_order_fields: [...(formData.required_order_fields || []), { fieldName: "", question: "" }] })} style={{ background: "rgba(16,185,129,0.1)", border: "none", color: "#34d399", padding: "6px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    <Plus size={12} /> Add Field
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {formData.required_order_fields?.map((field, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center", background: C.elevated, padding: 12, borderRadius: 8, border: `1px solid ${C.border}` }}>
                      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12 }}>
                        <input style={{...inputStyle, fontSize:12}} placeholder="Field Name (e.g. Size)" value={field.fieldName} onChange={e => {
                          const newFields = [...(formData.required_order_fields || [])];
                          newFields[idx].fieldName = e.target.value;
                          setFormData({ ...formData, required_order_fields: newFields });
                        }} />
                        <input style={{...inputStyle, fontSize:12}} placeholder="Question to ask (e.g. What size do you need?)" value={field.question} onChange={e => {
                          const newFields = [...(formData.required_order_fields || [])];
                          newFields[idx].question = e.target.value;
                          setFormData({ ...formData, required_order_fields: newFields });
                        }} />
                      </div>
                      <button onClick={() => {
                        const newFields = [...(formData.required_order_fields || [])];
                        newFields.splice(idx, 1);
                        setFormData({ ...formData, required_order_fields: newFields });
                      }} style={{ background: "rgba(244,63,94,0.1)", border: "none", color: "#fb7185", padding: 6, borderRadius: 6, cursor: "pointer" }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {(!formData.required_order_fields || formData.required_order_fields.length === 0) && (
                    <div style={{ fontSize: 12, color: C.textMuted, textAlign: "center", padding: "12px 0" }}>No custom order fields required.</div>
                  )}
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end", gap: 12, background: C.card }}>
              <button onClick={() => setIsModalOpen(false)} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.elevated, color: C.textPrimary, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, padding: "8px 20px" }}>
                {saving ? "Saving..." : <><Save size={15}/> Save Product</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
