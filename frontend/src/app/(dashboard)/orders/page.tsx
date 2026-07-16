"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { C, pageWrap, pageTitle, pageSubtitle, pageHeader, inputStyle, btnPrimary, btnSecondary, skeletonStyle, thStyle, tdStyle } from "@/lib/styles";
import { CheckCircle2, RefreshCcw, Search, ShoppingCart } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

type OrderItem = { name:string; qty:number; unitPrice:number; productId?:string };
type Order = {
  id:string; total_amount:number; payment_method:string; status:string;
  woo_order_id:number|null; woo_sync_status:string; created_at:string; items:OrderItem[];
  customers:{ name:string|null; platform:string; platform_id:string };
  delivery_address?:string;
};

const TABS = ["all","new","confirmed","shipped","delivered","returned","cancelled","failed"];
const statusColors: Record<string,[string,string]> = {
  new:       [C.brandLight,"rgba(124,92,252,0.12)"],
  confirmed: ["#34d399","rgba(16,185,129,0.12)"],
  shipped:   ["#22d3ee","rgba(6,182,212,0.12)"],
  delivered: ["#34d399","rgba(16,185,129,0.15)"],
  returned:  ["#fbbf24","rgba(245,158,11,0.12)"],
  cancelled: ["#fb7185","rgba(244,63,94,0.12)"],
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [syncId, setSyncId] = useState<string|null>(null);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [editOrder, setEditOrder] = useState<Order | null>(null);
  const [updating, setUpdating] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string|null>(null);
  const sb = createClient();

  useEffect(() => { load(); }, [filter]);

  const load = async () => {
    setLoading(true);
    
    // Fetch sync status
    const { data: settings } = await sb.from("business_settings").select("woo_sync_enabled").limit(1).single();
    if (settings) setSyncEnabled(settings.woo_sync_enabled);

    let q = sb.from("orders").select("*,customers(name,platform,platform_id)").order("created_at",{ascending:false});
    if (filter==="failed") q = q.eq("woo_sync_status","failed");
    else if (filter!=="all") q = q.eq("status",filter);
    const { data } = await q;

    const dummy = [
      { id:"ord-1", total_amount:4500, payment_method:"cod", status:"new", woo_order_id:null, woo_sync_status:"pending", created_at:new Date().toISOString(), items:[{name:"Leather Office Shoes", qty:1, unitPrice:4500}], customers:{name:"Mahi Vai", platform:"messenger", platform_id:"123"} },
      { id:"ord-2", total_amount:15000, payment_method:"bkash", status:"confirmed", woo_order_id:1002, woo_sync_status:"synced", created_at:new Date(Date.now()-86400000).toISOString(), items:[{name:"Wireless Noise Cancelling Headphones", qty:1, unitPrice:15000}], customers:{name:"Hasib", platform:"whatsapp", platform_id:"456"} },
      { id:"ord-3", total_amount:2850, payment_method:"cod", status:"shipped", woo_order_id:1001, woo_sync_status:"synced", created_at:new Date(Date.now()-172800000).toISOString(), items:[{name:"Premium Cotton T-Shirt", qty:3, unitPrice:950}], customers:{name:"Junaid", platform:"instagram", platform_id:"789"} },
      { id:"ord-4", total_amount:3200, payment_method:"nagad", status:"new", woo_order_id:null, woo_sync_status:"failed", created_at:new Date().toISOString(), items:[{name:"Gaming Mouse Pro", qty:1, unitPrice:3200}], customers:{name:"Sakib", platform:"messenger", platform_id:"abc"} },
    ] as Order[];
    const filteredDummy = filter==="all"?dummy : filter==="failed"?dummy.filter(d=>d.woo_sync_status==="failed") : dummy.filter(d=>d.status===filter);

    setOrders(data && data.length > 0 ? (data as Order[]) : filteredDummy);
    setLoading(false);
  };

  const toggleSync = async () => {
    const newState = !syncEnabled;
    setSyncEnabled(newState);
    
    // Update DB
    const { data: settings } = await sb.from("business_settings").select("id").limit(1).single();
    if (settings) {
      await sb.from("business_settings").update({ woo_sync_enabled: newState }).eq("id", settings.id);
    }

    if (newState) {
      // Switched to ON -> sync pending orders
      setSyncingAll(true);
      toast.loading("Sending pending orders to WooCommerce...", { id: "sync-all" });
      try {
        const res = await fetch("/api/sync-pending-orders", { method: "POST" });
        const json = await res.json();
        if (res.ok) {
          toast.success(`Successfully sent ${json.count} orders to website!`, { id: "sync-all" });
          load();
        } else {
          toast.error(json.error || "Sync failed", { id: "sync-all" });
        }
      } catch (e) {
        toast.error("Network error during sync", { id: "sync-all" });
      }
      setSyncingAll(false);
    } else {
      toast.info("Auto-sync paused. Orders will be saved locally.");
    }
  };

  const saveOrder = async () => {
    if (!editOrder) return;
    setUpdating(true);
    
    // If it's a dummy order (starts with ord-), just show success and close
    if (editOrder.id.startsWith("ord-")) {
      setTimeout(() => {
        setOrders(orders.map(o => o.id === editOrder.id ? { ...o, ...editOrder } : o));
        setEditOrder(null);
        setUpdating(false);
        toast.success("Order updated (Dummy)");
      }, 500);
      return;
    }

    const { error } = await sb.from("orders").update({ 
      status: editOrder.status,
      total_amount: editOrder.total_amount,
      payment_method: editOrder.payment_method
    }).eq("id", editOrder.id);
    
    if (error) {
      toast.error("Failed to update order");
    } else {
      toast.success("Order updated!");
      setOrders(orders.map(o => o.id === editOrder.id ? { ...o, status: editOrder.status } : o));
      setEditOrder(null);
    }
    setUpdating(false);
  };

  const shown = orders.filter(o=>!search||(o.customers.name||"").toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={pageWrap}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Orders</h1>
          <p style={pageSubtitle}>Manage orders and WooCommerce sync</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {/* Toggle Switch */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.card, padding: "8px 12px", borderRadius: 12, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: syncEnabled ? C.brandLight : C.textMuted }}>
              {syncEnabled ? "Website Sync: ON" : "Website Sync: OFF"}
            </div>
            <button 
              onClick={toggleSync}
              disabled={syncingAll}
              style={{
                width: 36, height: 20, borderRadius: 20, border: "none", cursor: syncingAll ? "not-allowed" : "pointer",
                background: syncEnabled ? C.brand : "rgba(255,255,255,0.1)", position: "relative",
                transition: "background 0.2s"
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 3, left: syncEnabled ? 19 : 3,
                transition: "left 0.2s"
              }} />
            </button>
          </div>

          <div style={{ position:"relative" }}>
            <Search size={14} style={{ position:"absolute", left:11, top:"50%", transform:"translateY(-50%)", color:C.textMuted, pointerEvents:"none" }}/>
            <input style={{ ...inputStyle, paddingLeft:33, width:220 }} placeholder="Search customer..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid rgba(255,255,255,0.05)`, marginBottom:24, gap:2 }}>
        {TABS.map(t=>(
          <button key={t} onClick={()=>setFilter(t)} style={{
            padding:"9px 14px", fontSize:12, fontWeight:600, cursor:"pointer", border:"none", fontFamily:"inherit",
            borderBottom: filter===t ? `2px solid ${C.brand}` : "2px solid transparent",
            color: filter===t ? C.brandLight : C.textMuted,
            background:"transparent", marginBottom:-1, transition:"all 0.15s",
            whiteSpace:"nowrap" as const,
          }}>
            {t==="failed"?"⚠ Sync Failed":t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background:C.surface, border:`1px solid rgba(255,255,255,0.05)`, borderRadius:16, overflow:"hidden" }}>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"separate", borderSpacing:0 }}>
            <thead>
              <tr>
                {["Order","Customer","Items","Amount","Status","WooSync","Action"].map(h=>(
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_,i)=>(
                  <tr key={i}><td colSpan={7} style={{padding:"8px 16px"}}>
                    <div style={{...skeletonStyle,height:24}}/>
                  </td></tr>
                ))
              ) : shown.length===0 ? (
                <tr><td colSpan={7} style={{padding:"60px 16px",textAlign:"center",color:C.textMuted}}>
                  <ShoppingCart size={44} style={{opacity:0.1,margin:"0 auto 12px",display:"block"}}/>
                  No orders found
                </td></tr>
              ) : shown.map(o=>{
                const [sc,sbg] = statusColors[o.status]??[C.textMuted,C.elevated];
                return (
                  <tr key={o.id} style={{transition:"background 0.12s"}}>
                    <td style={tdStyle}>
                      <div style={{fontWeight:600,fontSize:12,color:C.textPrimary,fontFamily:"monospace"}}>#{o.id.slice(0,8)}</div>
                      <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{format(new Date(o.created_at),"MMM d, h:mm a")}</div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{fontWeight:600,fontSize:13,color:C.textPrimary}}>{o.customers.name||"Unknown"}</div>
                      <div style={{fontSize:11,color:C.textMuted,textTransform:"capitalize"}}>{o.customers.platform}</div>
                    </td>
                    <td style={tdStyle}>
                      <div 
                        onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)}
                        style={{cursor:"pointer"}}
                      >
                        <div style={{fontSize:13,fontWeight:600,color:C.textPrimary}}>{o.items.length} item(s)</div>
                        <div style={{fontSize:11,color:C.brandLight,marginTop:2}}>
                          {expandedOrder === o.id ? "▲ collapse" : "▼ details"}
                        </div>
                      </div>
                      {expandedOrder === o.id && (
                        <div style={{marginTop:8,background:"rgba(124,92,252,0.06)",borderRadius:8,padding:"8px 10px",border:"1px solid rgba(124,92,252,0.15)"}}>
                          {o.items.map((item, idx) => (
                            <div key={idx} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"4px 0",borderBottom:idx<o.items.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                              <div>
                                <div style={{fontSize:12,fontWeight:600,color:C.textPrimary}}>{item.name}</div>
                                <div style={{fontSize:11,color:C.textMuted}}>Qty: {item.qty}</div>
                              </div>
                              <div style={{fontSize:12,fontWeight:700,color:"#34d399"}}>৳{(item.unitPrice * item.qty).toLocaleString()}</div>
                            </div>
                          ))}
                          {o.delivery_address && (
                            <div style={{marginTop:6,fontSize:11,color:C.textMuted}}>
                              📍 {o.delivery_address}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{fontWeight:700,color:C.textPrimary,fontSize:14}}>৳{o.total_amount.toLocaleString()}</div>
                      <div style={{fontSize:11,color:C.textMuted,textTransform:"uppercase"}}>{o.payment_method}</div>
                    </td>
                    <td style={tdStyle}>
                      <span style={{padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:700,background:sbg,color:sc}}>{o.status}</span>
                    </td>
                    <td style={tdStyle}>
                      {o.woo_sync_status==="synced" ? (
                        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:12,color:"#34d399"}}>
                          <CheckCircle2 size={13}/> #{o.woo_order_id}
                        </div>
                      ) : o.woo_sync_status==="failed" ? (
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{padding:"2px 8px",borderRadius:100,fontSize:10,fontWeight:700,background:"rgba(244,63,94,0.12)",color:"#fb7185"}}>Failed</span>
                          <button onClick={()=>setSyncId(o.id)} style={{background:"none",border:"none",cursor:"pointer",color:C.textMuted,padding:2,display:"flex"}}>
                            <RefreshCcw size={13} style={{animation:syncId===o.id?"spin 1s linear infinite":"none"}}/>
                          </button>
                        </div>
                      ) : (
                        <span style={{padding:"2px 8px",borderRadius:100,fontSize:10,fontWeight:700,background:"rgba(245,158,11,0.12)",color:"#fbbf24"}}>Pending</span>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => setEditOrder(o)} style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${C.border}`, color: C.textPrimary, padding: "5px 12px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, transition: "background 0.2s" }} onMouseOver={e => e.currentTarget.style.background = "rgba(255,255,255,0.15)"} onMouseOut={e => e.currentTarget.style.background = "rgba(255,255,255,0.08)"}>Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      {editOrder && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
          <div style={{ background: C.card, padding: 24, borderRadius: 16, width: 340, border: `1px solid ${C.border}`, boxShadow: "0 20px 40px rgba(0,0,0,0.4)" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: C.textPrimary }}>Edit Order #{editOrder.id.slice(0,8)}</h2>
            
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Customer details</label>
            <div style={{ padding: "10px 14px", background: C.surface, borderRadius: 10, border: `1px solid rgba(255,255,255,0.05)`, marginBottom: 16, fontSize: 12, color: C.textMuted }}>
              <strong style={{color: C.textPrimary}}>{editOrder.customers.name || "Unknown"}</strong><br/>
              Via: {editOrder.customers.platform}
            </div>

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Items Ordered</label>
            <div style={{ padding: "10px 14px", background: C.surface, borderRadius: 10, border: `1px solid rgba(255,255,255,0.05)`, marginBottom: 16 }}>
              {editOrder.items.map((item, idx) => (
                <div key={idx} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:idx<editOrder.items.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                  <div>
                    <div style={{fontSize:12,fontWeight:600,color:C.textPrimary}}>{item.name}</div>
                    <div style={{fontSize:11,color:C.textMuted}}>Qty: {item.qty} × ৳{item.unitPrice.toLocaleString()}</div>
                  </div>
                  <div style={{fontSize:12,fontWeight:700,color:"#34d399"}}>৳{(item.qty * item.unitPrice).toLocaleString()}</div>
                </div>
              ))}
            </div>

            {editOrder.delivery_address && (
              <>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Delivery Address</label>
                <div style={{ padding: "10px 14px", background: C.surface, borderRadius: 10, border: `1px solid rgba(255,255,255,0.05)`, marginBottom: 16, fontSize: 12, color: C.textPrimary }}>
                  {editOrder.delivery_address}
                </div>
              </>
            )}

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Total Amount (৳)</label>
            <input 
              type="number"
              value={editOrder.total_amount}
              onChange={(e) => setEditOrder({ ...editOrder, total_amount: Number(e.target.value) })}
              style={{ ...inputStyle, width: "100%", marginBottom: 16, padding: "10px 14px" }}
            />

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Payment Method</label>
            <input 
              type="text"
              value={editOrder.payment_method}
              onChange={(e) => setEditOrder({ ...editOrder, payment_method: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 16, padding: "10px 14px", textTransform: "uppercase" }}
            />

            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Order Status</label>
            <select 
              value={editOrder.status}
              onChange={(e) => setEditOrder({ ...editOrder, status: e.target.value })}
              style={{ ...inputStyle, width: "100%", marginBottom: 24, padding: "10px 14px" }}
            >
              {TABS.filter(t => t !== "all" && t !== "failed").map(t => (
                <option key={t} value={t} style={{ background: C.card }}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
            
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button style={{ ...btnSecondary, padding: "8px 16px" }} onClick={() => setEditOrder(null)}>Cancel</button>
              <button style={{ ...btnPrimary, padding: "8px 16px" }} onClick={saveOrder} disabled={updating}>
                {updating ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}} tr:hover td{background:rgba(255,255,255,0.015)}`}</style>
    </div>
  );
}
