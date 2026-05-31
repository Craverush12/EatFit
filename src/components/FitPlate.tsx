"use client";

import {
  CheckCircle2,
  ChevronDown,
  Dumbbell,
  Flame,
  Leaf,
  Loader2,
  MapPin,
  Minus,
  Navigation,
  Package,
  Plus,
  PlugZap,
  Scale,
  Salad,
  Share2,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Utensils,
  AlertCircle,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type {
  BMIInput,
  BMIPlanResponse,
  RankedFoodItem,
  RankedInstamartItem,
  SwiggyAddress,
} from "@/lib/types";
import { bmiCategoryEmoji, bmiCategoryLabel } from "@/lib/bmi";

/* ─── types ──────────────────────────────────────────────────────────────── */
type StatusResponse = {
  groqConfigured: boolean;
  swiggy: { connected: boolean; hasPendingAuthorization: boolean };
};
type MealTab = "all" | "breakfast" | "lunch" | "dinner" | "snack";

/* ─── constants ──────────────────────────────────────────────────────────── */
const defaultInput: BMIInput = {
  height: 170,
  weight: 70,
  age: 25,
  gender: "male",
  diet: "non-veg",
  goal: "healthy",
};

const GOALS: { value: BMIInput["goal"]; label: string; sub: string; Icon: React.ElementType; color: string }[] = [
  { value: "lose",     label: "Lose weight",   sub: "Calorie deficit", Icon: Flame,    color: "#F97316" },
  { value: "healthy",  label: "Eat healthier",  sub: "Balanced macros", Icon: Salad,    color: "#10B981" },
  { value: "muscle",   label: "Gain muscle",    sub: "High protein",    Icon: Dumbbell, color: "#5A51E8" },
  { value: "maintain", label: "Maintain",       sub: "Stay the course", Icon: Scale,    color: "#8B5CF6" },
];

const MEAL_TABS: { id: MealTab; label: string }[] = [
  { id: "all",       label: "All"       },
  { id: "breakfast", label: "Breakfast" },
  { id: "lunch",     label: "Lunch"     },
  { id: "dinner",    label: "Dinner"    },
  { id: "snack",     label: "Snacks"    },
];

function clientBMI(h: number, w: number) {
  const hm = h / 100;
  return Math.round((w / (hm * hm)) * 10) / 10;
}

/* ─── component ──────────────────────────────────────────────────────────── */
export function FitPlate() {
  const [input,       setInput]       = useState<BMIInput>(defaultInput);
  const [status,      setStatus]      = useState<StatusResponse | null>(null);
  const [result,      setResult]      = useState<BMIPlanResponse | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [mealTab,     setMealTab]     = useState<MealTab>("all");
  const [foodQty,     setFoodQty]     = useState<Record<string, number>>({});
  const [imQty,       setImQty]       = useState<Record<string, number>>({});
  const [cartBusy,    setCartBusy]    = useState<"food" | "instamart" | null>(null);
  const [cartMsg,     setCartMsg]     = useState<string | null>(null);
  const [cartReady,   setCartReady]   = useState({ food: false, instamart: false });

  // address / location
  const [foodAddrs,   setFoodAddrs]   = useState<SwiggyAddress[]>([]);
  const [imAddrs,     setImAddrs]     = useState<SwiggyAddress[]>([]);
  const [foodAddrId,  setFoodAddrId]  = useState("");
  const [imAddrId,    setImAddrId]    = useState("");
  const [addrsLoading,setAddrsLoading]= useState(false);
  const [locDetecting,setLocDetecting]= useState(false);
  const [detected,    setDetected]    = useState<{ lat: number; lng: number } | null>(null);

  /* effects */
  useEffect(() => {
    fetch("/api/status").then(r => r.json()).then(setStatus).catch(() => null);
  }, []);

  useEffect(() => {
    if (!status?.swiggy.connected) return;
    setAddrsLoading(true);
    fetch("/api/addresses")
      .then(r => r.json())
      .then(d => {
        if (!d.ok) return;
        setFoodAddrs(d.food ?? []);
        setImAddrs(d.instamart ?? []);
        if (d.food?.length)      setFoodAddrId(d.food[0].id);
        if (d.instamart?.length) setImAddrId(d.instamart[0].id);
      })
      .catch(() => null)
      .finally(() => setAddrsLoading(false));
  }, [status?.swiggy.connected]);

  // share URL auto-submit
  useEffect(() => {
    const p   = new URLSearchParams(window.location.search);
    const h   = parseInt(p.get("h")   ?? "", 10);
    const w   = parseInt(p.get("w")   ?? "", 10);
    const age = parseInt(p.get("age") ?? "", 10);
    if (h > 0 && w > 0 && age > 0) {
      const next: BMIInput = {
        height: h, weight: w, age,
        gender: (p.get("g")    as BMIInput["gender"]) ?? "male",
        diet:   (p.get("diet") as BMIInput["diet"])   ?? "non-veg",
        goal:   (p.get("goal") as BMIInput["goal"])   ?? "healthy",
      };
      setInput(next);
      setTimeout(() => runPlan(next), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready    = status?.groqConfigured && status?.swiggy.connected;
  const readyMsg = !status
    ? "Checking setup…"
    : !status.groqConfigured
    ? "Add GROQ_API_KEY to .env.local"
    : !status.swiggy.connected
    ? "Connect Swiggy to load live picks"
    : "Ready";

  /* actions */
  async function runPlan(planInput: BMIInput) {
    setLoading(true); setError(null); setResult(null);
    setFoodQty({}); setImQty({}); setCartMsg(null);
    setCartReady({ food: false, instamart: false });
    try {
      const res  = await fetch("/api/bmi-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...planInput,
          ...(foodAddrId ? { foodAddressId:      foodAddrId } : {}),
          ...(imAddrId   ? { instamartAddressId: imAddrId   } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.errors?.[0] ?? "Plan failed");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Plan failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateCart(kind: "food" | "instamart") {
    if (!result) return;
    setCartBusy(kind); setCartMsg(null); setError(null);
    try {
      if (kind === "food") {
        const sel = result.foodItems.filter(i => (foodQty[i.id] ?? 0) > 0);
        if (!sel.length) { setError("Select at least one food item."); setCartBusy(null); return; }
        const r = await fetch("/api/cart/food", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            restaurantId: result.foodRestaurantId,
            restaurantName: result.foodItems[0]?.restaurantName ?? "Restaurant",
            addressId: result.foodAddressId,
            cartItems: sel.map(i => ({ itemId: i.id, quantity: foodQty[i.id] ?? 1 })),
          }),
        });
        const b = await r.json();
        if (!r.ok || !b.ok) throw new Error(b.errors?.[0] ?? "Cart update failed");
        setCartMsg(b.message ?? "Food cart updated."); setCartReady(c => ({ ...c, food: true }));
      } else {
        const sel = result.instamartItems.filter(i => (imQty[i.spinId] ?? 0) > 0);
        if (!sel.length) { setError("Select at least one grocery item."); setCartBusy(null); return; }
        const r = await fetch("/api/cart/instamart", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            selectedAddressId: result.instamartAddressId,
            items: sel.map(i => ({ spinId: i.spinId, quantity: imQty[i.spinId] ?? 1 })),
          }),
        });
        const b = await r.json();
        if (!r.ok || !b.ok) throw new Error(b.errors?.[0] ?? "Cart update failed");
        setCartMsg(b.message ?? "Instamart cart updated."); setCartReady(c => ({ ...c, instamart: true }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cart update failed");
    } finally { setCartBusy(null); }
  }

  async function placeOrder(kind: "food" | "instamart") {
    if (!result) return;
    const addressId = kind === "food" ? result.foodAddressId : result.instamartAddressId;
    if (!addressId) return;
    setCartBusy(kind); setCartMsg(null);
    try {
      const r = await fetch(`/api/order/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, addressId, restaurantName: result.foodItems[0]?.restaurantName }),
      });
      const b = await r.json();
      if (!r.ok || !b.ok) throw new Error(b.errors?.[0] ?? "Order failed");
      setCartMsg(b.message ?? `${kind === "food" ? "Food" : "Instamart"} order placed.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Order failed");
    } finally { setCartBusy(null); }
  }

  function detectLocation() {
    if (!navigator.geolocation) return;
    setLocDetecting(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setDetected({ lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6) });
        setLocDetecting(false);
      },
      () => setLocDetecting(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  /* derived values */
  const foodCal  = result?.foodItems.filter(i => (foodQty[i.id]     ?? 0) > 0).reduce((s, i) => s + i.estimatedCalories * (foodQty[i.id] ?? 0), 0) ?? 0;
  const imCal    = result?.instamartItems.filter(i => (imQty[i.spinId] ?? 0) > 0).reduce((s, i) => s + i.estimatedCalories * (imQty[i.spinId] ?? 0), 0) ?? 0;
  const totalCal = foodCal + imCal;
  const target   = result?.bmiResult.targets.calories ?? 0;
  const foodPct  = target > 0 ? Math.min(100, (foodCal / target) * 100) : 0;
  const imPct    = target > 0 ? Math.min(100 - foodPct, (imCal / target) * 100) : 0;
  const totalPct = foodPct + imPct;
  const foodSpend = result?.foodItems.filter(i => (foodQty[i.id]     ?? 0) > 0).reduce((s, i) => s + i.price       * (foodQty[i.id]     ?? 0), 0) ?? 0;
  const imSpend   = result?.instamartItems.filter(i => (imQty[i.spinId] ?? 0) > 0).reduce((s, i) => s + i.offerPrice * (imQty[i.spinId] ?? 0), 0) ?? 0;
  const totalItems = Object.values(foodQty).reduce((s, q) => s + q, 0) + Object.values(imQty).reduce((s, q) => s + q, 0);

  const filteredFood = useMemo(() => {
    if (!result) return [];
    return mealTab === "all" ? result.foodItems : result.foodItems.filter(i => i.mealTime === mealTab || i.mealTime === "any");
  }, [result, mealTab]);

  /* share */
  function shareUrl() {
    const p = new URLSearchParams({ h: String(input.height), w: String(input.weight), age: String(input.age), g: input.gender, diet: input.diet, goal: input.goal });
    return `${window.location.origin}?${p}`;
  }
  function copyLink() {
    navigator.clipboard.writeText(shareUrl()).catch(() => null);
    setCartMsg("Link copied — share with friends!");
  }

  /* number input helper */
  function numField(f: "height" | "weight" | "age", v: string) {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n > 0) setInput(i => ({ ...i, [f]: n }));
  }

  /* BMI arc */
  const bmi     = result?.bmiResult.bmi ?? clientBMI(input.height, input.weight);
  const bmiPct  = Math.min(100, Math.max(0, ((bmi - 10) / 30) * 100));
  const arcR    = 44;
  const arcC    = 2 * Math.PI * arcR;
  const arcOff  = arcC - (bmiPct / 100) * arcC;
  const arcCol  = bmi < 18.5 ? "#60A5FA" : bmi < 25 ? "#10B981" : bmi < 30 ? "#F59E0B" : "#EF4444";

  /* ─── render ────────────────────────────────────────────────────────────── */
  return (
    <main className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 space-y-5">

        {/* ══════════════════════════════════════════════════
            HERO CARD
        ══════════════════════════════════════════════════ */}
        <section
          className="rounded-3xl overflow-hidden"
          style={{
            background: "var(--ink)",
            boxShadow: "0 24px 64px rgba(12,10,21,0.4)",
          }}
        >
          {/* subtle gradient glows */}
          <div
            className="absolute inset-0 pointer-events-none rounded-3xl"
            style={{
              background:
                "radial-gradient(ellipse at 15% 0%, rgba(90,81,232,0.18) 0%, transparent 55%)," +
                "radial-gradient(ellipse at 85% 80%, rgba(139,92,246,0.12) 0%, transparent 50%)",
            }}
          />

          <div className="relative grid md:grid-cols-[1fr_260px] gap-0">

            {/* ── LEFT: inputs ────────────────────────────── */}
            <div className="p-7 md:p-10">
              {/* brand label */}
              <div className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full"
                style={{ background: "rgba(90,81,232,0.18)", border: "1px solid rgba(90,81,232,0.3)" }}>
                <div className="w-1.5 h-1.5 rounded-full bg-[#86EFAC] animate-pulse" />
                <span className="text-[10px] font-bold tracking-[0.2em] text-[#A5B4FC]">FITPLATE · SWIGGY MCP · GROQ AI</span>
              </div>

              <h1 className="text-4xl sm:text-5xl font-extrabold text-white leading-[1.08] tracking-tight mb-3">
                Eat right for<br />
                <span style={{ background: "linear-gradient(135deg,#A5B4FC,#8B5CF6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  your body.
                </span>
              </h1>
              <p className="text-sm text-[#9CA3AF] leading-relaxed mb-7 max-w-md">
                Tell us your stats and goals. We&apos;ll calculate your BMI, then surface live Swiggy
                food and Instamart grocery picks matched to your exact calorie and macro targets.
              </p>

              {/* stat inputs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {(["height", "weight", "age"] as const).map(f => (
                  <label
                    key={f}
                    className="group block rounded-2xl p-3.5 cursor-text transition-all duration-200"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
                    onFocus={() => {}} // handled by CSS
                  >
                    <span className="block text-[9px] font-bold tracking-[0.15em] uppercase mb-1.5"
                      style={{ color: "#6B7280" }}>
                      {f === "height" ? "Height (cm)" : f === "weight" ? "Weight (kg)" : "Age (yrs)"}
                    </span>
                    <input
                      type="number"
                      value={String(input[f])}
                      onChange={e => numField(f, e.target.value)}
                      className="w-full text-2xl font-bold text-white bg-transparent focus:outline-none"
                      style={{ color: "#F9FAFB" }}
                    />
                  </label>
                ))}

                {/* gender */}
                <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="block text-[9px] font-bold tracking-[0.15em] uppercase mb-2" style={{ color: "#6B7280" }}>Gender</span>
                  <div className="flex gap-2">
                    {(["male", "female"] as const).map(g => (
                      <button key={g} type="button"
                        onClick={() => setInput(i => ({ ...i, gender: g }))}
                        className="flex-1 py-1.5 rounded-xl text-xs font-bold transition-all duration-150"
                        style={input.gender === g
                          ? { background: "linear-gradient(135deg,#5A51E8,#8B5CF6)", color: "#fff", boxShadow: "0 2px 8px rgba(90,81,232,0.4)" }
                          : { background: "rgba(255,255,255,0.06)", color: "#9CA3AF", border: "1px solid rgba(255,255,255,0.08)" }
                        }
                      >{g === "male" ? "M" : "F"}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* location / address panel */}
              {status?.swiggy.connected && (
                <div className="mb-4 rounded-2xl p-4 space-y-3"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <p className="text-[9px] font-bold tracking-[0.16em] uppercase" style={{ color: "#6B7280" }}>Delivery address</p>

                  <button type="button" onClick={detectLocation} disabled={locDetecting}
                    className="flex items-center gap-2.5 w-full rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-200 disabled:opacity-50"
                    style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", color: detected ? "#86EFAC" : "#D1D5DB" }}>
                    {locDetecting
                      ? <Loader2 size={13} className="animate-spin" style={{ color: "#A5B4FC" }} />
                      : <Navigation size={13} style={{ color: detected ? "#86EFAC" : "#6B7280" }} />}
                    {locDetecting ? "Detecting your location…" : detected ? `${detected.lat}, ${detected.lng}` : "Detect my location"}
                    {detected && <span className="ml-auto text-[10px] font-bold" style={{ color: "#86EFAC" }}>✓ Detected</span>}
                  </button>

                  {addrsLoading ? (
                    <div className="flex items-center gap-2 text-xs" style={{ color: "#6B7280" }}>
                      <Loader2 size={12} className="animate-spin" /> Loading saved addresses…
                    </div>
                  ) : (
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      {[
                        { label: "Food delivery", addrs: foodAddrs, val: foodAddrId, set: setFoodAddrId, Icon: Utensils },
                        { label: "Instamart",     addrs: imAddrs,   val: imAddrId,   set: setImAddrId,   Icon: ShoppingCart },
                      ].map(({ label, addrs, val, set, Icon }) => (
                        <div key={label}>
                          <p className="flex items-center gap-1 text-[9px] font-bold tracking-[0.12em] uppercase mb-1.5" style={{ color: "#6B7280" }}>
                            <Icon size={9} /> {label}
                          </p>
                          {addrs.length === 0
                            ? <p className="text-xs italic" style={{ color: "#4B5563" }}>No saved addresses</p>
                            : (
                              <div className="relative">
                                <select value={val} onChange={e => set(e.target.value)}
                                  className="w-full appearance-none rounded-xl px-3 py-2.5 pr-8 text-xs font-semibold cursor-pointer transition-all"
                                  style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", color: "#E5E7EB" }}>
                                  {addrs.map(a => (
                                    <option key={a.id} value={a.id} style={{ background: "#1A1726", color: "#fff" }}>
                                      {a.label} — {a.addressLine.slice(0, 36)}{a.addressLine.length > 36 ? "…" : ""}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={11} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#6B7280" }} />
                              </div>
                            )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(foodAddrId || imAddrId) && !addrsLoading && (
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#86EFAC" }}>
                      <MapPin size={10} /> Results scoped to your delivery location
                    </div>
                  )}
                </div>
              )}

              {/* diet */}
              <div className="flex flex-wrap gap-2 mb-4">
                {(["veg", "non-veg", "vegan"] as const).map(d => (
                  <button key={d} type="button"
                    onClick={() => setInput(i => ({ ...i, diet: d }))}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-150"
                    style={input.diet === d
                      ? { background: "rgba(16,185,129,0.18)", border: "1px solid rgba(16,185,129,0.4)", color: "#6EE7B7" }
                      : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "#9CA3AF" }
                    }>
                    <Leaf size={10} style={{ color: input.diet === d ? "#6EE7B7" : "#4B5563" }} />
                    {d === "veg" ? "Vegetarian" : d === "non-veg" ? "Non-Veg" : "Vegan"}
                  </button>
                ))}
              </div>

              {/* goals */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-7">
                {GOALS.map(({ value, label, sub, Icon, color }) => {
                  const on = input.goal === value;
                  return (
                    <button key={value} type="button"
                      onClick={() => setInput(i => ({ ...i, goal: value }))}
                      className="text-left rounded-2xl p-3.5 transition-all duration-200"
                      style={on
                        ? { background: `${color}18`, border: `1px solid ${color}50`, boxShadow: `0 0 0 1px ${color}30` }
                        : { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }
                      }>
                      <Icon size={16} className="mb-2" style={{ color: on ? color : "#4B5563" }} />
                      <p className="text-xs font-bold" style={{ color: on ? "#F9FAFB" : "#9CA3AF" }}>{label}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: on ? "#6B7280" : "#374151" }}>{sub}</p>
                    </button>
                  );
                })}
              </div>

              {/* CTA row */}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => runPlan(input)} disabled={loading}
                  className="flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{
                    background: loading ? "rgba(90,81,232,0.5)" : "linear-gradient(135deg,#5A51E8,#8B5CF6)",
                    boxShadow: loading ? "none" : "0 4px 16px rgba(90,81,232,0.4)",
                  }}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                  {loading ? "Analysing your profile…" : "Get my food plan"}
                </button>

                <div className={`flex items-center gap-1.5 text-xs font-semibold ${ready ? "text-[#6EE7B7]" : "text-[#F59E0B]"}`}>
                  {ready ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
                  {readyMsg}
                </div>

                {status && !status.swiggy.connected && (
                  <a href="/api/auth/swiggy/start"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all duration-150"
                    style={{ border: "1px solid rgba(90,81,232,0.4)", color: "#A5B4FC", background: "rgba(90,81,232,0.08)" }}>
                    <PlugZap size={13} /> Connect Swiggy
                  </a>
                )}
              </div>
            </div>

            {/* ── RIGHT: BMI panel ────────────────────────── */}
            <div className="hidden md:flex flex-col items-center justify-center gap-5 p-8"
              style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
              {/* arc */}
              <div className="relative">
                <svg width="160" height="160" viewBox="0 0 100 100" className="-rotate-90">
                  <defs>
                    <linearGradient id="arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%"   stopColor={arcCol} />
                      <stop offset="100%" stopColor={arcCol + "AA"} />
                    </linearGradient>
                  </defs>
                  {/* track */}
                  <circle cx="50" cy="50" r={arcR} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                  {/* healthy range hint */}
                  <circle cx="50" cy="50" r={arcR} fill="none" stroke="rgba(16,185,129,0.12)" strokeWidth="7"
                    strokeDasharray={`${arcC}`}
                    strokeDashoffset={arcC - ((50 / 100) * arcC)}
                    strokeLinecap="round"
                    style={{ transform: `rotate(${(18.5 - 10) / 30 * 360}deg)`, transformOrigin: "50% 50%" }}
                  />
                  {/* fill */}
                  <circle cx="50" cy="50" r={arcR} fill="none" stroke="url(#arc-grad)" strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={`${arcC}`}
                    strokeDashoffset={arcOff}
                    style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1), stroke 0.4s" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[34px] font-extrabold text-white leading-none">{bmi.toFixed(1)}</span>
                  <span className="text-[9px] font-bold tracking-[0.18em] mt-1" style={{ color: "#6B7280" }}>BMI</span>
                </div>
              </div>

              {result ? (
                <>
                  <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold"
                    style={{ background: `${arcCol}18`, border: `1px solid ${arcCol}40`, color: arcCol }}>
                    {bmiCategoryEmoji(result.bmiResult.category)} {bmiCategoryLabel(result.bmiResult.category)}
                  </div>

                  <div className="w-full rounded-2xl p-4 space-y-3"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold tracking-[0.14em] uppercase" style={{ color: "#4B5563" }}>Daily targets</p>
                    {[
                      { label: "Calories", val: `${result.bmiResult.targets.calories}`, col: "#A5B4FC" },
                      { label: "Protein",  val: `${result.bmiResult.targets.protein}g`, col: "#6EE7B7" },
                      { label: "Fat",      val: `${result.bmiResult.targets.fat}g`,     col: "#FCA5A5" },
                      { label: "Carbs",    val: `${result.bmiResult.targets.carbs}g`,   col: "#FCD34D" },
                    ].map(t => (
                      <div key={t.label} className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: t.col }} />
                        <span className="text-[11px] flex-1" style={{ color: "#9CA3AF" }}>{t.label}</span>
                        <span className="text-[11px] font-bold text-white">{t.val}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center text-xs leading-relaxed px-2" style={{ color: "#4B5563" }}>
                  Submit your stats to see your BMI category and macro targets
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════
            ERROR
        ══════════════════════════════════════════════════ */}
        {error && (
          <div className="animate-fade-up flex items-start gap-3 rounded-2xl px-5 py-4 text-sm font-medium"
            style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B" }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            CALORIE TRACKER
        ══════════════════════════════════════════════════ */}
        {result && (
          <div className="animate-fade-up rounded-2xl overflow-hidden"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>

            {/* numbers row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 divide-x" style={{ borderBottom: "1px solid var(--border-dim)" }}>
              {[
                { label: "Daily target",    val: target,          unit: "kcal", col: "var(--text-1)" },
                { label: "Food",            val: foodCal,         unit: "kcal", col: "#F97316"       },
                { label: "Groceries",       val: imCal,           unit: "kcal", col: "#7C3AED"       },
                { label: "Combined",        val: totalCal,        unit: "kcal", col: "#10B981"       },
                { label: "Total spend",     val: `₹${Math.round(foodSpend + imSpend)}`, unit: "", col: "var(--text-1)" },
              ].map(({ label, val, unit, col }) => (
                <div key={label} className="flex flex-col items-center justify-center py-4 px-3 gap-0.5">
                  <span className="text-[21px] font-extrabold leading-none transition-all duration-300" style={{ color: col }}>
                    {typeof val === "number" ? val.toLocaleString() : val}
                  </span>
                  <span className="text-[9px] font-bold tracking-[0.1em] uppercase mt-1" style={{ color: "var(--text-3)" }}>
                    {label}{unit ? ` (${unit})` : ""}
                  </span>
                </div>
              ))}
            </div>

            {/* segmented progress bar */}
            <div className="px-5 py-4">
              <div className="flex justify-between text-xs font-semibold mb-2.5" style={{ color: "var(--text-2)" }}>
                <span>
                  {totalPct > 0
                    ? <><strong style={{ color: "var(--text-1)" }}>{Math.round(totalPct)}%</strong> of daily calories selected</>
                    : "Add items to track calories"}
                </span>
                <span style={{ color: "var(--text-3)" }}>
                  {Math.max(0, target - totalCal)} kcal remaining
                </span>
              </div>

              {/* bar */}
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: "var(--border-dim)" }}>
                <div className="h-full rounded-l-full transition-all duration-500"
                  style={{ width: `${foodPct}%`, background: "#F97316" }} />
                <div className="h-full transition-all duration-500"
                  style={{ width: `${imPct}%`, background: "#7C3AED",
                    borderRadius: foodPct === 0 ? "9999px 0 0 9999px" : foodPct + imPct >= 100 ? "0 9999px 9999px 0" : "0" }} />
              </div>

              {/* legend */}
              {totalCal > 0 && (
                <div className="flex flex-wrap gap-4 mt-2.5 text-[11px]" style={{ color: "var(--text-3)" }}>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#F97316" }} />
                    Food {foodCal} kcal
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#7C3AED" }} />
                    Groceries {imCal} kcal
                  </span>
                  {totalItems > 0 && (
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: "#10B981" }} />
                      {totalItems} item{totalItems !== 1 ? "s" : ""} in cart
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            EMPTY / LOADING
        ══════════════════════════════════════════════════ */}
        {!result && !error && (
          <div className="rounded-3xl p-14 flex flex-col items-center text-center gap-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>
            {loading ? (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,rgba(90,81,232,0.1),rgba(139,92,246,0.1))" }}>
                  <Loader2 size={26} className="animate-spin" style={{ color: "#5A51E8" }} />
                </div>
                <div>
                  <p className="font-bold text-base mb-1.5" style={{ color: "var(--text-1)" }}>
                    Building your personalised plan…
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: "var(--text-3)" }}>
                    Calculating BMI · Generating search terms · Calling Swiggy MCP · Ranking by calorie fit
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,rgba(16,185,129,0.1),rgba(16,185,129,0.05))" }}>
                  <ShoppingBasket size={26} style={{ color: "#10B981" }} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold mb-2" style={{ color: "var(--text-1)" }}>
                    Enter your stats to get started
                  </h2>
                  <p className="text-sm leading-relaxed max-w-md" style={{ color: "var(--text-3)" }}>
                    FitPlate calculates your BMI and daily macro targets, then pulls live Swiggy food
                    and Instamart grocery picks personalised to your goal — ready to add to cart.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            RESULTS
        ══════════════════════════════════════════════════ */}
        {result && (
          <div className="animate-fade-up space-y-4">

            {/* header + meal tabs */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-extrabold" style={{ color: "var(--text-1)" }}>
                  Your personalised picks
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  Live from Swiggy · BMI {result.bmiResult.bmi} · {GOALS.find(g => g.value === input.goal)?.label}
                  {result.searchTerms.food.length ? ` · searched "${result.searchTerms.food.join('", "')}"` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MEAL_TABS.map(t => (
                  <button key={t.id} type="button" onClick={() => setMealTab(t.id)}
                    className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150"
                    style={mealTab === t.id
                      ? { background: "var(--ink)", color: "#fff" }
                      : { background: "var(--surface)", color: "var(--text-2)", border: "1px solid var(--border)" }
                    }>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* cart success message */}
            {cartMsg && (
              <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold"
                style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46" }}>
                <CheckCircle2 size={15} />
                {cartMsg}
              </div>
            )}

            {/* food + instamart grid */}
            <div className="grid gap-4 md:grid-cols-2">

              {/* ── FOOD SECTION ── */}
              <div className="rounded-2xl overflow-hidden flex flex-col"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>

                {/* section header */}
                <div className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--border-dim)", background: "linear-gradient(90deg,#FFF7ED,#FFFBF7)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,#F97316,#EA580C)", boxShadow: "0 2px 6px rgba(249,115,22,0.35)" }}>
                      <Utensils size={13} className="text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: "#9A3412" }}>SWIGGY FOOD</p>
                      <p className="text-[10px]" style={{ color: "#C2410C" }}>
                        {result.foodItems.length} items · ₹{Math.round(foodSpend)} selected
                      </p>
                    </div>
                  </div>
                  {foodCal > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: "#FFF7ED", color: "#F97316", border: "1px solid #FED7AA" }}>
                      {foodCal} kcal
                    </span>
                  )}
                </div>

                {/* items */}
                <div className="flex-1 divide-y" style={{ borderColor: "var(--border-dim)" }}>
                  {filteredFood.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                      <Utensils size={28} style={{ color: "var(--border)" }} />
                      <p className="text-sm text-center px-6" style={{ color: "var(--text-3)" }}>
                        {result.foodItems.length === 0
                          ? "Connect Swiggy with a saved address to get food picks."
                          : "No items match this meal filter."}
                      </p>
                    </div>
                  ) : filteredFood.map(item => (
                    <FoodCard key={item.id} item={item}
                      qty={foodQty[item.id] ?? 0}
                      onChange={q => { setCartReady(c => ({ ...c, food: false })); setFoodQty(s => ({ ...s, [item.id]: q })); }} />
                  ))}
                </div>

                {/* cart actions */}
                <div className="p-4 grid grid-cols-2 gap-2.5"
                  style={{ borderTop: "1px solid var(--border-dim)", background: "var(--surface-dim)" }}>
                  <Btn
                    onClick={() => updateCart("food")} disabled={cartBusy !== null}
                    loading={cartBusy === "food"}
                    variant="secondary" label="Update cart" />
                  <Btn
                    onClick={() => placeOrder("food")} disabled={cartBusy !== null || !cartReady.food}
                    loading={false} variant="food" label="Place order" />
                </div>
                {!cartReady.food && filteredFood.length > 0 && (
                  <p className="text-center text-[10px] pb-3" style={{ color: "var(--text-3)" }}>
                    Update cart first, then place order
                  </p>
                )}
              </div>

              {/* ── INSTAMART SECTION ── */}
              <div className="rounded-2xl overflow-hidden flex flex-col"
                style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow-card)" }}>

                <div className="flex items-center justify-between px-5 py-3.5"
                  style={{ borderBottom: "1px solid var(--border-dim)", background: "linear-gradient(90deg,#F5F3FF,#FDFCFF)" }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)", boxShadow: "0 2px 6px rgba(124,58,237,0.35)" }}>
                      <ShoppingCart size={13} className="text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-bold" style={{ color: "#4C1D95" }}>INSTAMART</p>
                      <p className="text-[10px]" style={{ color: "#6D28D9" }}>
                        {result.instamartItems.length} items · ₹{Math.round(imSpend)} selected
                      </p>
                    </div>
                  </div>
                  {imCal > 0 && (
                    <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{ background: "#F5F3FF", color: "#7C3AED", border: "1px solid #DDD6FE" }}>
                      {imCal} kcal
                    </span>
                  )}
                </div>

                <div className="flex-1 divide-y" style={{ borderColor: "var(--border-dim)" }}>
                  {result.instamartItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-14 gap-3">
                      <ShoppingCart size={28} style={{ color: "var(--border)" }} />
                      <p className="text-sm text-center px-6" style={{ color: "var(--text-3)" }}>
                        Connect Swiggy with a saved address to get grocery picks.
                      </p>
                    </div>
                  ) : result.instamartItems.map(item => (
                    <InstamartCard key={item.spinId} item={item}
                      qty={imQty[item.spinId] ?? 0}
                      onChange={q => { setCartReady(c => ({ ...c, instamart: false })); setImQty(s => ({ ...s, [item.spinId]: q })); }} />
                  ))}
                </div>

                <div className="p-4 grid grid-cols-2 gap-2.5"
                  style={{ borderTop: "1px solid var(--border-dim)", background: "var(--surface-dim)" }}>
                  <Btn
                    onClick={() => updateCart("instamart")} disabled={cartBusy !== null}
                    loading={cartBusy === "instamart"}
                    variant="secondary" label="Update cart" />
                  <Btn
                    onClick={() => placeOrder("instamart")} disabled={cartBusy !== null || !cartReady.instamart}
                    loading={false} variant="instamart" label="Place order" />
                </div>
                {!cartReady.instamart && result.instamartItems.length > 0 && (
                  <p className="text-center text-[10px] pb-3" style={{ color: "var(--text-3)" }}>
                    Update cart first, then place order
                  </p>
                )}
              </div>
            </div>

            {/* ── SHARE CARD ── */}
            <div className="rounded-3xl overflow-hidden relative"
              style={{
                background: "linear-gradient(135deg, #0C0A15 0%, #1A1040 50%, #0C0A15 100%)",
                boxShadow: "0 16px 48px rgba(12,10,21,0.3)",
              }}>
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse at 20% 50%, rgba(90,81,232,0.2) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(139,92,246,0.15) 0%, transparent 60%)" }} />
              <div className="relative p-7 flex flex-wrap items-center justify-between gap-5">
                <div>
                  <p className="text-[9px] font-bold tracking-[0.2em] mb-2" style={{ color: "#A5B4FC" }}>✦ SHAREABLE PLAN</p>
                  <p className="text-xl font-extrabold text-white mb-1">
                    BMI {result.bmiResult.bmi} · {bmiCategoryLabel(result.bmiResult.category)}
                  </p>
                  <p className="text-sm font-medium" style={{ color: "#C4B5FD" }}>
                    {GOALS.find(g => g.value === input.goal)?.label} · {target.toLocaleString()} kcal/day · {result.bmiResult.targets.protein}g protein
                  </p>
                </div>
                <div className="flex flex-wrap gap-2.5">
                  <button type="button" onClick={copyLink}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-150"
                    style={{ background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.15)" }}>
                    <Share2 size={14} /> Copy link
                  </button>
                  <a href={`https://wa.me/?text=${encodeURIComponent(`My FitPlate plan — BMI ${result.bmiResult.bmi}, ${GOALS.find(g => g.value === input.goal)?.label}. Check yours: ${typeof window !== "undefined" ? shareUrl() : ""}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-all duration-150"
                    style={{ background: "linear-gradient(135deg,#5A51E8,#8B5CF6)", boxShadow: "0 4px 14px rgba(90,81,232,0.4)" }}>
                    Share on WhatsApp
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

/* ─── sub-components ────────────────────────────────────────────────────────── */

function FoodCard({ item, qty, onChange }: { item: RankedFoodItem; qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex gap-4 px-5 py-4 transition-colors duration-150" style={{ background: qty > 0 ? "#FFFBF7" : "transparent" }}>
      {/* icon */}
      <div className="w-[56px] h-[56px] rounded-xl flex-shrink-0 flex items-center justify-center"
        style={{ background: item.isVeg ? "linear-gradient(135deg,#ECFDF5,#D1FAE5)" : "linear-gradient(135deg,#FFF7ED,#FFE4C8)" }}>
        <Utensils size={20} style={{ color: item.isVeg ? "#10B981" : "#F97316" }} />
      </div>

      <div className="flex-1 min-w-0">
        {/* veg dot + name */}
        <div className="flex items-start gap-2 mb-1">
          <div className={`mt-[3px] w-[11px] h-[11px] rounded-[2px] border-[1.5px] flex items-center justify-center flex-shrink-0 ${item.isVeg ? "border-green-600" : "border-red-600"}`}>
            <div className={`w-[5px] h-[5px] rounded-full ${item.isVeg ? "bg-green-600" : "bg-red-600"}`} />
          </div>
          <p className="text-sm font-bold leading-snug flex-1" style={{ color: "var(--text-1)" }}>{item.name}</p>
        </div>

        <p className="text-[11px] mb-2" style={{ color: "var(--text-3)" }}>
          {item.restaurantName}{item.rating ? ` · ★ ${item.rating}` : ""}
        </p>

        {/* tags */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.estimatedCalories > 0 && <Tag label={`${item.estimatedCalories} kcal`} bg="#FFF7ED" col="#EA580C" />}
          {item.estimatedProtein  > 0 && <Tag label={`${item.estimatedProtein}g protein`} bg="#EFF6FF" col="#1D4ED8" />}
          {item.fitTag               && <Tag label={item.fitTag} bg="#F0FDF4" col="#15803D" />}
          {item.mealTime && item.mealTime !== "any" && <Tag label={item.mealTime} bg="#FAF5FF" col="#6D28D9" />}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-extrabold" style={{ color: "var(--text-1)" }}>₹{Math.round(item.price)}</span>
          <QtyCtrl qty={qty} onChange={onChange} disabled={!item.inStock} accent="#F97316" />
        </div>
      </div>
    </div>
  );
}

function InstamartCard({ item, qty, onChange }: { item: RankedInstamartItem; qty: number; onChange: (q: number) => void }) {
  const disc = item.mrp > 0 ? Math.round((item.discount / item.mrp) * 100) : 0;
  return (
    <div className="flex gap-4 px-5 py-4 transition-colors duration-150" style={{ background: qty > 0 ? "#FAF9FF" : "transparent" }}>
      {/* icon */}
      <div className="relative w-[56px] h-[56px] rounded-xl flex-shrink-0 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,#F5F3FF,#EDE9FE)" }}>
        <Package size={20} style={{ color: "#7C3AED" }} />
        {disc > 0 && (
          <span className="absolute -top-1.5 -right-1.5 text-[9px] font-extrabold px-1.5 py-0.5 rounded-full text-white"
            style={{ background: "linear-gradient(135deg,#10B981,#059669)", boxShadow: "0 1px 4px rgba(16,185,129,0.4)" }}>
            {disc}%
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold tracking-[0.12em] uppercase mb-0.5" style={{ color: "var(--text-3)" }}>{item.brand}</p>
        <p className="text-sm font-bold leading-snug mb-1" style={{ color: "var(--text-1)" }}>{item.name}</p>
        <p className="text-[11px] mb-2" style={{ color: "var(--text-3)" }}>{item.quantityDescription}</p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {item.fitTag               && <Tag label={item.fitTag} bg="#F0FDF4" col="#15803D" />}
          {item.estimatedCalories > 0 && <Tag label={`~${item.estimatedCalories} kcal/serving`} bg="#FFF7ED" col="#EA580C" />}
          {item.estimatedProtein  > 0 && <Tag label={`${item.estimatedProtein}g protein`} bg="#EFF6FF" col="#1D4ED8" />}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold" style={{ color: "var(--text-1)" }}>₹{Math.round(item.offerPrice)}</span>
            {item.mrp > item.offerPrice && (
              <span className="text-[11px] line-through" style={{ color: "var(--text-3)" }}>₹{Math.round(item.mrp)}</span>
            )}
          </div>
          <QtyCtrl qty={qty} onChange={onChange} disabled={!item.inStock} accent="#7C3AED" />
        </div>
      </div>
    </div>
  );
}

function Tag({ label, bg, col }: { label: string; bg: string; col: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: bg, color: col }}>
      {label}
    </span>
  );
}

function QtyCtrl({ qty, onChange, disabled, accent }: { qty: number; onChange: (q: number) => void; disabled?: boolean; accent: string }) {
  if (qty === 0) {
    return (
      <button type="button" disabled={disabled} onClick={() => onChange(1)}
        className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 disabled:opacity-40"
        style={{ border: `1.5px solid ${accent}`, color: accent, background: "transparent" }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = accent; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = accent; }}>
        ADD
      </button>
    );
  }
  return (
    <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1.5px solid ${accent}` }}>
      <button type="button" onClick={() => onChange(Math.max(0, qty - 1))}
        className="px-2.5 py-1.5 transition-colors duration-100"
        style={{ color: accent }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = accent; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = accent; }}>
        <Minus size={11} />
      </button>
      <span className="min-w-[28px] text-center text-xs font-bold" style={{ color: accent }}>{qty}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(qty + 1)}
        className="px-2.5 py-1.5 transition-colors duration-100 disabled:opacity-40"
        style={{ color: accent }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = accent; (e.currentTarget as HTMLButtonElement).style.color = "#fff"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; (e.currentTarget as HTMLButtonElement).style.color = accent; }}>
        <Plus size={11} />
      </button>
    </div>
  );
}

function Btn({ onClick, disabled, loading, variant, label }: {
  onClick: () => void; disabled: boolean; loading: boolean;
  variant: "food" | "instamart" | "secondary"; label: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    food:      { background: "#F97316", color: "#fff", boxShadow: "0 2px 8px rgba(249,115,22,0.3)" },
    instamart: { background: "#7C3AED", color: "#fff", boxShadow: "0 2px 8px rgba(124,58,237,0.3)" },
    secondary: { background: "var(--ink)", color: "#fff" },
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="h-11 rounded-xl text-xs font-bold transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      style={styles[variant]}>
      {loading ? <Loader2 className="animate-spin mx-auto" size={14} /> : label}
    </button>
  );
}
