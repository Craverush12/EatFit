"use client";

import {
  CheckCircle2,
  Compass,
  Loader2,
  Minus,
  Plus,
  PlugZap,
  Share2,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import type { BMIInput, BMIPlanResponse, RankedFoodItem, RankedInstamartItem } from "@/lib/types";
import { bmiCategoryEmoji, bmiCategoryLabel } from "@/lib/bmi";

type StatusResponse = {
  groqConfigured: boolean;
  swiggy: { connected: boolean; hasPendingAuthorization: boolean };
};

type MealTab = "all" | "breakfast" | "lunch" | "dinner" | "snack";

const defaultInput: BMIInput = {
  height: 170,
  weight: 70,
  age: 25,
  gender: "male",
  diet: "non-veg",
  goal: "healthy",
};

const GOAL_OPTIONS: { value: BMIInput["goal"]; label: string; icon: string; sub: string }[] = [
  { value: "lose", label: "Lose weight", icon: "🔥", sub: "Calorie deficit" },
  { value: "healthy", label: "Eat healthier", icon: "🥗", sub: "Balanced macros" },
  { value: "muscle", label: "Gain muscle", icon: "💪", sub: "High protein" },
  { value: "maintain", label: "Maintain", icon: "⚖️", sub: "Stay the course" },
];

function computeClientBMI(height: number, weight: number) {
  const h = height / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}

export function FitPlate() {
  const [input, setInput] = useState<BMIInput>(defaultInput);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [result, setResult] = useState<BMIPlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mealTab, setMealTab] = useState<MealTab>("all");
  const [foodQty, setFoodQty] = useState<Record<string, number>>({});
  const [imQty, setImQty] = useState<Record<string, number>>({});
  const [cartBusy, setCartBusy] = useState<"food" | "instamart" | null>(null);
  const [cartMsg, setCartMsg] = useState<string | null>(null);
  const [cartReady, setCartReady] = useState({ food: false, instamart: false });

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => null);
  }, []);

  // Auto-populate from share URL params
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const h = parseInt(p.get("h") ?? "", 10);
    const w = parseInt(p.get("w") ?? "", 10);
    const age = parseInt(p.get("age") ?? "", 10);
    if (h > 0 && w > 0 && age > 0) {
      const next: BMIInput = {
        height: h,
        weight: w,
        age,
        gender: (p.get("g") as BMIInput["gender"]) ?? "male",
        diet: (p.get("diet") as BMIInput["diet"]) ?? "non-veg",
        goal: (p.get("goal") as BMIInput["goal"]) ?? "healthy",
      };
      setInput(next);
      setTimeout(() => runPlan(next), 300);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readiness = useMemo(() => {
    if (!status) return "Checking setup…";
    if (!status.groqConfigured) return "Add GROQ_API_KEY to .env.local";
    if (!status.swiggy.connected) return "Connect Swiggy for live picks";
    return "Ready";
  }, [status]);

  const isReady = status?.groqConfigured && status?.swiggy.connected;

  async function runPlan(planInput: BMIInput) {
    setLoading(true);
    setError(null);
    setResult(null);
    setFoodQty({});
    setImQty({});
    setCartMsg(null);
    setCartReady({ food: false, instamart: false });

    try {
      const res = await fetch("/api/bmi-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(planInput),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.errors?.[0] ?? "Plan failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Plan failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateCart(kind: "food" | "instamart") {
    if (!result) return;
    setCartBusy(kind);
    setCartMsg(null);
    setError(null);

    try {
      if (kind === "food") {
        const selected = result.foodItems.filter((i) => (foodQty[i.id] ?? 0) > 0);
        if (!selected.length) {
          setError("Select at least one food item.");
          setCartBusy(null);
          return;
        }
        const res = await fetch("/api/cart/food", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            restaurantId: result.foodRestaurantId,
            restaurantName: result.foodItems[0]?.restaurantName ?? "Restaurant",
            addressId: result.foodAddressId,
            cartItems: selected.map((i) => ({ itemId: i.id, quantity: foodQty[i.id] ?? 1 })),
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.errors?.[0] ?? "Cart update failed");
        setCartMsg(body.message ?? "Food cart updated.");
        setCartReady((c) => ({ ...c, food: true }));
      } else {
        const selected = result.instamartItems.filter((i) => (imQty[i.spinId] ?? 0) > 0);
        if (!selected.length) {
          setError("Select at least one grocery item.");
          setCartBusy(null);
          return;
        }
        const res = await fetch("/api/cart/instamart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            confirmed: true,
            selectedAddressId: result.instamartAddressId,
            items: selected.map((i) => ({ spinId: i.spinId, quantity: imQty[i.spinId] ?? 1 })),
          }),
        });
        const body = await res.json();
        if (!res.ok || !body.ok) throw new Error(body.errors?.[0] ?? "Cart update failed");
        setCartMsg(body.message ?? "Instamart cart updated.");
        setCartReady((c) => ({ ...c, instamart: true }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cart update failed");
    } finally {
      setCartBusy(null);
    }
  }

  async function placeOrder(kind: "food" | "instamart") {
    if (!result) return;
    const addressId = kind === "food" ? result.foodAddressId : result.instamartAddressId;
    if (!addressId) return;
    setCartBusy(kind);
    setCartMsg(null);
    try {
      const res = await fetch(`/api/order/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          addressId,
          restaurantName: result.foodItems[0]?.restaurantName,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.errors?.[0] ?? "Order failed");
      setCartMsg(body.message ?? `${kind === "food" ? "Food" : "Instamart"} order placed.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Order failed");
    } finally {
      setCartBusy(null);
    }
  }

  const selectedFoodCal = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.estimatedCalories * (foodQty[i.id] ?? 0), 0) ?? 0;

  const selectedFoodTotal = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.price * (foodQty[i.id] ?? 0), 0) ?? 0;

  const selectedImTotal = result?.instamartItems
    .filter((i) => (imQty[i.spinId] ?? 0) > 0)
    .reduce((s, i) => s + i.offerPrice * (imQty[i.spinId] ?? 0), 0) ?? 0;

  const dailyTarget = result?.bmiResult.targets.calories ?? 0;
  const calPct = dailyTarget > 0 ? Math.min(100, Math.round((selectedFoodCal / dailyTarget) * 100)) : 0;

  const filteredFood = useMemo(() => {
    if (!result) return [];
    if (mealTab === "all") return result.foodItems;
    return result.foodItems.filter((i) => i.mealTime === mealTab || i.mealTime === "any");
  }, [result, mealTab]);

  function shareUrl() {
    const p = new URLSearchParams({
      h: String(input.height),
      w: String(input.weight),
      age: String(input.age),
      g: input.gender,
      diet: input.diet,
      goal: input.goal,
    });
    return `${window.location.origin}?${p.toString()}`;
  }

  function copyShareLink() {
    navigator.clipboard.writeText(shareUrl()).catch(() => null);
    setCartMsg("Link copied! Share it with friends.");
  }

  function numInput(field: "height" | "weight" | "age", val: string) {
    const n = parseInt(val, 10);
    if (!Number.isNaN(n) && n > 0) setInput((i) => ({ ...i, [field]: n }));
  }

  // Live BMI from current inputs (before server response)
  const liveBmi = result?.bmiResult.bmi ?? computeClientBMI(input.height, input.weight);
  const bmiPct = Math.min(100, Math.max(0, ((liveBmi - 10) / (40 - 10)) * 100));
  const arcCircumference = 2 * Math.PI * 45; // r=45
  const arcOffset = arcCircumference - (bmiPct / 100) * arcCircumference;
  const arcColor =
    liveBmi < 18.5 ? "#60A5FA" : liveBmi < 25 ? "#4ADE80" : liveBmi < 30 ? "#F59E0B" : "#F87171";

  return (
    <main className="min-h-screen bg-[#F7F6F3]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-5">

        {/* ── INPUT CARD ── */}
        <div className="rounded-2xl bg-[#0C0F0A] p-6 md:p-8 grid gap-8 md:grid-cols-[1fr_220px] items-start">
          <div>
            <p className="text-[11px] font-bold tracking-[0.2em] text-[#86EFAC] mb-4">
              FITPLATE · POWERED BY SWIGGY
            </p>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight mb-2">
              Eat right for <span className="text-[#86EFAC]">your</span> body.
            </h1>
            <p className="text-sm text-[#6B7280] mb-6 max-w-lg">
              Enter your stats. We&apos;ll find the best food on Swiggy and stock your kitchen via
              Instamart — personalised to your BMI and goal.
            </p>

            {/* Stat inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(["height", "weight", "age"] as const).map((field) => (
                <label
                  key={field}
                  className="block bg-white/5 border border-white/10 rounded-xl p-3 cursor-text hover:border-[#86EFAC]/40 transition-colors"
                >
                  <span className="block text-[10px] font-bold tracking-[0.1em] text-[#9CA3AF] uppercase mb-1">
                    {field === "height" ? "Height (cm)" : field === "weight" ? "Weight (kg)" : "Age (yrs)"}
                  </span>
                  <input
                    type="number"
                    value={String(input[field])}
                    onChange={(e) => numInput(field, e.target.value)}
                    className="w-full bg-transparent text-2xl font-black text-white focus:outline-none"
                  />
                </label>
              ))}
              {/* Gender */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                <span className="block text-[10px] font-bold tracking-[0.1em] text-[#9CA3AF] uppercase mb-2">
                  Gender
                </span>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setInput((i) => ({ ...i, gender: g }))}
                      className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${
                        input.gender === g
                          ? "bg-[#86EFAC] text-[#052e16]"
                          : "text-[#9CA3AF] border border-white/10"
                      }`}
                    >
                      {g === "male" ? "♂ M" : "♀ F"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Diet */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["veg", "non-veg", "vegan"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setInput((i) => ({ ...i, diet: d }))}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${
                    input.diet === d
                      ? "bg-[#86EFAC] text-[#052e16] border-[#86EFAC]"
                      : "border-white/15 text-[#D1D5DB]"
                  }`}
                >
                  {d === "veg" ? "🌿 Veg" : d === "non-veg" ? "🍗 Non-Veg" : "🌱 Vegan"}
                </button>
              ))}
            </div>

            {/* Goals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {GOAL_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setInput((i) => ({ ...i, goal: g.value }))}
                  className={`text-left rounded-xl border p-3 transition-colors ${
                    input.goal === g.value
                      ? "border-[#86EFAC] bg-[#86EFAC]/10"
                      : "border-white/10 bg-white/5"
                  }`}
                >
                  <div className="text-lg mb-1">{g.icon}</div>
                  <div className="text-xs font-bold text-[#E5E7EB]">{g.label}</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{g.sub}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => runPlan(input)}
                disabled={loading}
                className="flex items-center gap-2 bg-[#86EFAC] text-[#052e16] text-sm font-black px-6 py-3 rounded-xl hover:bg-[#6ee7b7] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {loading ? "Building your plan…" : "Get my food plan →"}
              </button>

              <div
                className={`flex items-center gap-2 text-xs font-bold ${
                  isReady ? "text-[#86EFAC]" : "text-[#F59E0B]"
                }`}
              >
                {isReady ? <CheckCircle2 size={14} /> : <Compass size={14} />}
                {readiness}
              </div>

              {status && !status.swiggy.connected && (
                <a
                  href="/api/auth/swiggy/start"
                  className="flex items-center gap-2 border border-[#86EFAC]/40 text-[#86EFAC] text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#86EFAC]/10 transition-colors"
                >
                  <PlugZap size={13} /> Connect Swiggy
                </a>
              )}
            </div>
          </div>

          {/* BMI Arc */}
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="8"
                />
                <circle
                  cx="50" cy="50" r="45"
                  fill="none"
                  stroke={arcColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${arcCircumference}`}
                  strokeDashoffset={arcOffset}
                  style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{liveBmi.toFixed(1)}</span>
                <span className="text-[10px] font-bold text-[#9CA3AF] tracking-widest">BMI</span>
              </div>
            </div>

            {result ? (
              <>
                <span
                  className="text-xs font-bold px-3 py-1.5 rounded-full"
                  style={{ background: arcColor + "22", color: arcColor }}
                >
                  {bmiCategoryEmoji(result.bmiResult.category)}{" "}
                  {bmiCategoryLabel(result.bmiResult.category)}
                </span>

                <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-[#9CA3AF] tracking-[0.12em] uppercase">
                    Daily targets
                  </p>
                  {[
                    { label: "Calories", val: `${result.bmiResult.targets.calories}`, color: "#86EFAC", pct: 65 },
                    { label: "Protein", val: `${result.bmiResult.targets.protein}g`, color: "#60A5FA", pct: 78 },
                    { label: "Fat limit", val: `${result.bmiResult.targets.fat}g`, color: "#F87171", pct: 45 },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-[#D1D5DB] w-16 flex-shrink-0">{t.label}</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ background: t.color, width: `${t.pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-white w-10 text-right flex-shrink-0">
                        {t.val}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-[#6B7280] text-center">
                Live BMI from your inputs
              </p>
            )}
          </div>
        </div>

        {/* ── ERRORS ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* ── CALORIE TRACKER ── */}
        {result && (
          <div className="rounded-xl bg-white border border-[#EAE7E2] p-4 flex flex-wrap items-center gap-4">
            <div className="text-center min-w-[70px]">
              <div className="text-xl font-black">{dailyTarget}</div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Daily target</div>
            </div>
            <div className="w-px h-9 bg-[#EEE]" />
            <div className="text-center min-w-[70px]">
              <div className="text-xl font-black text-[#16A34A]">{selectedFoodCal}</div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Selected cal</div>
            </div>
            <div className="w-px h-9 bg-[#EEE]" />
            <div className="text-center min-w-[70px]">
              <div className="text-xl font-black text-[#6B7280]">
                {Math.max(0, dailyTarget - selectedFoodCal)}
              </div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Remaining</div>
            </div>
            <div className="flex-1 min-w-[120px]">
              <div className="h-2 bg-[#F0EDE8] rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    background: "linear-gradient(90deg,#86EFAC,#34D399)",
                    width: `${calPct}%`,
                  }}
                />
              </div>
              <p className="text-xs text-[#888]">
                <strong className="text-[#111]">{calPct}%</strong> of daily calories selected
              </p>
            </div>
          </div>
        )}

        {/* ── EMPTY / LOADING STATE ── */}
        {!result && !error && (
          <div className="rounded-2xl bg-white border border-[#EAE7E2] p-12 flex flex-col items-center text-center gap-4">
            {loading ? (
              <>
                <Loader2 size={40} className="animate-spin text-[#86EFAC]" />
                <p className="text-sm font-semibold text-[#6B7280]">
                  Calculating BMI → generating search terms → calling Swiggy MCP → ranking results…
                </p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-2xl bg-[#F0FFF8] flex items-center justify-center">
                  <ShoppingBasket size={32} className="text-[#16A34A]" />
                </div>
                <div>
                  <h2 className="text-2xl font-black mb-2">Enter your stats to get started</h2>
                  <p className="text-sm text-[#6B7280] max-w-md">
                    FitPlate will calculate your BMI, generate personalised search terms, and pull
                    live Swiggy food and grocery picks matched to your calorie and macro targets.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Your personalised picks</h2>
                <p className="text-sm text-[#6B7280]">
                  Live from Swiggy · BMI {result.bmiResult.bmi} ·{" "}
                  {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                  {result.searchTerms.food.length
                    ? ` · "${result.searchTerms.food.join('", "')}"`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "breakfast", "lunch", "dinner", "snack"] as MealTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMealTab(tab)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                      mealTab === tab
                        ? "bg-[#111] text-white border-[#111]"
                        : "bg-white text-[#555] border-[#E0DDD8]"
                    }`}
                  >
                    {tab === "all"
                      ? "All"
                      : tab === "breakfast"
                      ? "🌅 Breakfast"
                      : tab === "lunch"
                      ? "☀️ Lunch"
                      : tab === "dinner"
                      ? "🌙 Dinner"
                      : "🥤 Snacks"}
                  </button>
                ))}
              </div>
            </div>

            {cartMsg && (
              <div className="rounded-xl border border-[#86EFAC]/40 bg-[#F0FFF8] p-3 text-sm font-semibold text-[#065F46]">
                {cartMsg}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              {/* FOOD SECTION */}
              <div className="rounded-2xl bg-white border border-[#EAE7E2] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
                  <span className="text-xs font-bold tracking-[0.1em] uppercase text-[#888]">
                    🛵 Swiggy Food
                  </span>
                  <span className="text-xs font-bold text-[#FC5523]">
                    Selected ₹{Math.round(selectedFoodTotal)}
                  </span>
                </div>

                {filteredFood.length === 0 && (
                  <div className="p-8 text-center text-sm text-[#888]">
                    {result.foodItems.length === 0
                      ? "Connect Swiggy with a saved address to get food picks."
                      : "No items match this meal filter."}
                  </div>
                )}

                {filteredFood.map((item) => (
                  <FoodCard
                    key={item.id}
                    item={item}
                    qty={foodQty[item.id] ?? 0}
                    onChange={(q) => {
                      setCartReady((c) => ({ ...c, food: false }));
                      setFoodQty((s) => ({ ...s, [item.id]: q }));
                    }}
                  />
                ))}

                <div className="p-3 border-t border-[#F0EDE8] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("food")}
                    className="h-10 text-xs font-black bg-[#1F695C] text-white rounded-lg disabled:opacity-40 hover:bg-[#175548] transition-colors"
                  >
                    {cartBusy === "food" ? (
                      <Loader2 className="animate-spin mx-auto" size={14} />
                    ) : (
                      "Update Food cart"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.food}
                    onClick={() => placeOrder("food")}
                    className="h-10 text-xs font-black bg-[#FC5523] text-white rounded-lg disabled:opacity-40 hover:bg-[#e04a1e] transition-colors"
                  >
                    Place Food order
                  </button>
                </div>
                {!cartReady.food && (
                  <p className="px-3 pb-2 text-[10px] text-[#888]">Update cart first, then place order.</p>
                )}
              </div>

              {/* INSTAMART SECTION */}
              <div className="rounded-2xl bg-white border border-[#EAE7E2] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
                  <span className="text-xs font-bold tracking-[0.1em] uppercase text-[#5856D6]">
                    🛒 Instamart Groceries
                  </span>
                  <span className="text-xs font-bold text-[#5856D6]">
                    Selected ₹{Math.round(selectedImTotal)}
                  </span>
                </div>

                {result.instamartItems.length === 0 && (
                  <div className="p-8 text-center text-sm text-[#888]">
                    Connect Swiggy with a saved address to get grocery picks.
                  </div>
                )}

                {result.instamartItems.map((item) => (
                  <InstamartCard
                    key={item.spinId}
                    item={item}
                    qty={imQty[item.spinId] ?? 0}
                    onChange={(q) => {
                      setCartReady((c) => ({ ...c, instamart: false }));
                      setImQty((s) => ({ ...s, [item.spinId]: q }));
                    }}
                  />
                ))}

                <div className="p-3 border-t border-[#F0EDE8] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("instamart")}
                    className="h-10 text-xs font-black bg-[#5856D6] text-white rounded-lg disabled:opacity-40 hover:bg-[#4846c4] transition-colors"
                  >
                    {cartBusy === "instamart" ? (
                      <Loader2 className="animate-spin mx-auto" size={14} />
                    ) : (
                      "Update Instamart cart"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.instamart}
                    onClick={() => placeOrder("instamart")}
                    className="h-10 text-xs font-black bg-[#FC5523] text-white rounded-lg disabled:opacity-40 hover:bg-[#e04a1e] transition-colors"
                  >
                    Place Instamart order
                  </button>
                </div>
                {!cartReady.instamart && (
                  <p className="px-3 pb-2 text-[10px] text-[#888]">Update cart first, then place order.</p>
                )}
              </div>
            </div>

            {/* SHARE CARD */}
            <div className="rounded-2xl bg-gradient-to-r from-[#064E3B] to-[#047857] p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-[#6EE7B7] tracking-[0.15em] uppercase mb-1">
                  ✦ Shareable plan
                </p>
                <p className="text-lg font-black text-white">
                  BMI {result.bmiResult.bmi} · {bmiCategoryLabel(result.bmiResult.category)} ·{" "}
                  {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                </p>
                <p className="text-sm text-[#A7F3D0]">
                  {result.bmiResult.targets.calories} cal/day · {result.bmiResult.targets.protein}g
                  protein target
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex items-center gap-2 bg-white text-[#065F46] text-xs font-black px-4 py-2.5 rounded-xl hover:bg-[#F0FFF8] transition-colors"
                >
                  <Share2 size={13} /> Copy link
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Check out my FitPlate plan: ${typeof window !== "undefined" ? shareUrl() : ""}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/30 text-white text-xs font-black px-4 py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  📤 WhatsApp
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function FoodCard({
  item,
  qty,
  onChange,
}: {
  item: RankedFoodItem;
  qty: number;
  onChange: (q: number) => void;
}) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[#F5F3F0] last:border-0">
      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#FFF5F0] to-[#FFE4D6] flex items-center justify-center text-2xl flex-shrink-0">
        {item.isVeg ? "🥗" : "🍗"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <div
            className={`w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 ${
              item.isVeg ? "border-[#2E7D32]" : "border-[#C62828]"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full ${
                item.isVeg ? "bg-[#2E7D32]" : "bg-[#C62828]"
              }`}
            />
          </div>
          <span className="text-[10px] text-[#888]">{item.isVeg ? "Veg" : "Non-veg"}</span>
        </div>
        <p className="text-sm font-bold text-[#111] truncate">{item.name}</p>
        <p className="text-[11px] text-[#888] mb-1.5">
          {item.restaurantName}
          {item.rating ? ` · ★ ${item.rating}` : ""}
        </p>
        <div className="flex flex-wrap gap-1 mb-2">
          {item.estimatedCalories > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#15803D]">
              {item.estimatedCalories} cal
            </span>
          )}
          {item.estimatedProtein > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8]">
              {item.estimatedProtein}g protein
            </span>
          )}
          {item.fitTag && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#C2410C]">
              ✓ {item.fitTag}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-[#111]">₹{Math.round(item.price)}</span>
          <QtyControl qty={qty} onChange={onChange} disabled={!item.inStock} color="orange" />
        </div>
      </div>
    </div>
  );
}

function InstamartCard({
  item,
  qty,
  onChange,
}: {
  item: RankedInstamartItem;
  qty: number;
  onChange: (q: number) => void;
}) {
  const discountPct = item.mrp > 0 ? Math.round((item.discount / item.mrp) * 100) : 0;
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[#F5F3F0] last:border-0">
      <div className="relative w-16 h-16 rounded-xl bg-[#F0F9FF] flex items-center justify-center text-2xl flex-shrink-0">
        🛒
        {discountPct > 0 && (
          <span className="absolute -top-1 -right-1 bg-[#16A34A] text-white text-[9px] font-black px-1 py-0.5 rounded">
            {discountPct}%
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide mb-0.5">
          {item.brand}
        </p>
        <p className="text-sm font-bold text-[#111] truncate">{item.name}</p>
        <p className="text-[11px] text-[#888] mb-1.5">{item.quantityDescription}</p>
        {item.fitTag && (
          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#15803D] mb-2">
            ✓ {item.fitTag}
          </span>
        )}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-[#111]">₹{Math.round(item.offerPrice)}</span>
            {item.mrp > item.offerPrice && (
              <span className="text-[11px] text-[#AAA] line-through">₹{Math.round(item.mrp)}</span>
            )}
          </div>
          <QtyControl qty={qty} onChange={onChange} disabled={!item.inStock} color="purple" />
        </div>
      </div>
    </div>
  );
}

function QtyControl({
  qty,
  onChange,
  disabled,
  color,
}: {
  qty: number;
  onChange: (q: number) => void;
  disabled?: boolean;
  color: "orange" | "purple";
}) {
  const isOrange = color === "orange";
  const borderText = isOrange ? "border-[#FC5523] text-[#FC5523]" : "border-[#5856D6] text-[#5856D6]";
  const hoverBg = isOrange
    ? "hover:bg-[#FC5523] hover:text-white"
    : "hover:bg-[#5856D6] hover:text-white";

  if (qty === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(1)}
        className={`border ${borderText} ${hoverBg} text-xs font-black px-4 py-1.5 rounded-lg disabled:opacity-40 transition-colors`}
      >
        ADD
      </button>
    );
  }

  return (
    <div className={`flex items-center border ${borderText} rounded-lg overflow-hidden`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, qty - 1))}
        className={`px-2 py-1.5 ${borderText} ${hoverBg} transition-colors`}
      >
        <Minus size={12} />
      </button>
      <span
        className={`px-3 text-xs font-black ${
          isOrange ? "text-[#FC5523]" : "text-[#5856D6]"
        }`}
      >
        {qty}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        className={`px-2 py-1.5 ${borderText} ${hoverBg} transition-colors disabled:opacity-40`}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
