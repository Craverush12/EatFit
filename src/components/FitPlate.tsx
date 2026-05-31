"use client";

import {
  CheckCircle2,
  Compass,
  Flame,
  Leaf,
  Loader2,
  Minus,
  Package,
  Plus,
  PlugZap,
  Share2,
  ShoppingBasket,
  ShoppingCart,
  Sparkles,
  Utensils,
  Dumbbell,
  Scale,
  Salad,
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

const GOAL_OPTIONS: {
  value: BMIInput["goal"];
  label: string;
  Icon: React.ElementType;
  sub: string;
}[] = [
  { value: "lose", label: "Lose weight", Icon: Flame, sub: "Calorie deficit" },
  { value: "healthy", label: "Eat healthier", Icon: Salad, sub: "Balanced macros" },
  { value: "muscle", label: "Gain muscle", Icon: Dumbbell, sub: "High protein" },
  { value: "maintain", label: "Maintain", Icon: Scale, sub: "Stay the course" },
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

  // Auto-submit from share URL params
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

  // ── Cart totals ────────────────────────────────────────────────────────────
  const selectedFoodCal = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.estimatedCalories * (foodQty[i.id] ?? 0), 0) ?? 0;

  const selectedImCal = result?.instamartItems
    .filter((i) => (imQty[i.spinId] ?? 0) > 0)
    .reduce((s, i) => s + i.estimatedCalories * (imQty[i.spinId] ?? 0), 0) ?? 0;

  const totalSelectedCal = selectedFoodCal + selectedImCal;

  const selectedFoodTotal = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.price * (foodQty[i.id] ?? 0), 0) ?? 0;

  const selectedImTotal = result?.instamartItems
    .filter((i) => (imQty[i.spinId] ?? 0) > 0)
    .reduce((s, i) => s + i.offerPrice * (imQty[i.spinId] ?? 0), 0) ?? 0;

  const totalItemsInCart =
    Object.values(foodQty).reduce((s, q) => s + q, 0) +
    Object.values(imQty).reduce((s, q) => s + q, 0);

  const dailyTarget = result?.bmiResult.targets.calories ?? 0;
  const calPct =
    dailyTarget > 0 && totalSelectedCal > 0
      ? Math.min(100, Math.round((totalSelectedCal / dailyTarget) * 100))
      : 0;

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

  // Live BMI arc
  const liveBmi = result?.bmiResult.bmi ?? computeClientBMI(input.height, input.weight);
  const bmiPct = Math.min(100, Math.max(0, ((liveBmi - 10) / (40 - 10)) * 100));
  const arcC = 2 * Math.PI * 45;
  const arcOffset = arcC - (bmiPct / 100) * arcC;
  const arcColor =
    liveBmi < 18.5 ? "#60A5FA" : liveBmi < 25 ? "#4ADE80" : liveBmi < 30 ? "#F59E0B" : "#F87171";

  return (
    <main className="min-h-screen bg-[#F4F3F0]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-5">

        {/* ── INPUT CARD ── */}
        <div className="rounded-3xl bg-[#0A0D08] shadow-2xl p-6 md:p-8 grid gap-8 md:grid-cols-[1fr_220px] items-start">
          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-[#86EFAC] mb-4">
              FITPLATE · POWERED BY SWIGGY
            </p>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-[1.05] tracking-tight mb-2">
              Eat right for{" "}
              <span className="text-[#86EFAC]">your</span> body.
            </h1>
            <p className="text-sm text-[#6B7280] mb-6 max-w-lg leading-relaxed">
              Enter your stats. We&apos;ll calculate your BMI, then pull personalised food and
              grocery picks directly from Swiggy — matched to your calorie and macro targets.
            </p>

            {/* Stat inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(["height", "weight", "age"] as const).map((field) => (
                <label
                  key={field}
                  className="block bg-white/[0.06] border border-white/[0.09] rounded-2xl p-3 cursor-text
                             hover:border-[#86EFAC]/50 hover:bg-white/[0.09] transition-all duration-200"
                >
                  <span className="block text-[10px] font-bold tracking-[0.12em] text-[#9CA3AF] uppercase mb-1">
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
              <div className="bg-white/[0.06] border border-white/[0.09] rounded-2xl p-3">
                <span className="block text-[10px] font-bold tracking-[0.12em] text-[#9CA3AF] uppercase mb-2">
                  Gender
                </span>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setInput((i) => ({ ...i, gender: g }))}
                      className={`flex-1 text-xs font-bold py-1.5 rounded-xl transition-all duration-200 ${
                        input.gender === g
                          ? "bg-[#86EFAC] text-[#052e16] shadow-lg shadow-[#86EFAC]/20"
                          : "text-[#9CA3AF] border border-white/10 hover:border-white/20"
                      }`}
                    >
                      {g === "male" ? "M" : "F"}
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
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border transition-all duration-200 ${
                    input.diet === d
                      ? "bg-[#86EFAC] text-[#052e16] border-[#86EFAC] shadow-lg shadow-[#86EFAC]/20"
                      : "border-white/15 text-[#D1D5DB] hover:border-white/30"
                  }`}
                >
                  <Leaf size={11} />
                  {d === "veg" ? "Veg" : d === "non-veg" ? "Non-Veg" : "Vegan"}
                </button>
              ))}
            </div>

            {/* Goals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {GOAL_OPTIONS.map(({ value, label, Icon, sub }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInput((i) => ({ ...i, goal: value }))}
                  className={`text-left rounded-2xl border p-3 transition-all duration-200 ${
                    input.goal === value
                      ? "border-[#86EFAC] bg-[#86EFAC]/10 shadow-lg shadow-[#86EFAC]/10"
                      : "border-white/[0.09] bg-white/[0.04] hover:border-white/20"
                  }`}
                >
                  <Icon
                    size={18}
                    className={`mb-2 ${input.goal === value ? "text-[#86EFAC]" : "text-[#6B7280]"}`}
                  />
                  <div className="text-xs font-bold text-[#E5E7EB]">{label}</div>
                  <div className="text-[10px] text-[#6B7280] mt-0.5">{sub}</div>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => runPlan(input)}
                disabled={loading}
                className="flex items-center gap-2 bg-[#86EFAC] text-[#052e16] text-sm font-black
                           px-6 py-3 rounded-2xl shadow-lg shadow-[#86EFAC]/25
                           hover:bg-[#6ee7b7] hover:shadow-[#86EFAC]/40
                           disabled:opacity-60 disabled:cursor-not-allowed
                           transition-all duration-200"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {loading ? "Building your plan…" : "Get my food plan →"}
              </button>

              <div className={`flex items-center gap-2 text-xs font-bold ${isReady ? "text-[#86EFAC]" : "text-[#F59E0B]"}`}>
                {isReady ? <CheckCircle2 size={14} /> : <Compass size={14} />}
                {readiness}
              </div>

              {status && !status.swiggy.connected && (
                <a
                  href="/api/auth/swiggy/start"
                  className="flex items-center gap-2 border border-[#86EFAC]/40 text-[#86EFAC]
                             text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#86EFAC]/10 transition-colors"
                >
                  <PlugZap size={13} /> Connect Swiggy
                </a>
              )}
            </div>
          </div>

          {/* ── BMI ARC ── */}
          <div className="flex flex-col items-center gap-4 pt-2">
            <div className="relative w-36 h-36">
              <svg className="w-36 h-36 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8" />
                <circle
                  cx="50" cy="50" r="45" fill="none"
                  stroke={arcColor} strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${arcC}`} strokeDashoffset={arcOffset}
                  style={{ transition: "stroke-dashoffset 0.7s ease, stroke 0.4s ease" }}
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

                <div className="w-full bg-white/[0.05] border border-white/[0.08] rounded-2xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-[#9CA3AF] tracking-[0.12em] uppercase">
                    Daily targets
                  </p>
                  {[
                    { label: "Calories", val: `${result.bmiResult.targets.calories}`, color: "#86EFAC" },
                    { label: "Protein", val: `${result.bmiResult.targets.protein}g`, color: "#60A5FA" },
                    { label: "Fat", val: `${result.bmiResult.targets.fat}g`, color: "#F87171" },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-[#D1D5DB] w-14 flex-shrink-0">{t.label}</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ background: t.color, width: "60%" }} />
                      </div>
                      <span className="text-[11px] font-bold text-white w-12 text-right flex-shrink-0">
                        {t.val}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-[#6B7280] text-center">
                Live BMI preview
              </p>
            )}
          </div>
        </div>

        {/* ── ERRORS ── */}
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* ── CALORIE + CART TRACKER ── */}
        {result && (
          <div className="rounded-2xl bg-white border border-[#E8E5E0] shadow-sm p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-4">
              {/* Daily target */}
              <div className="flex flex-col items-center min-w-[64px]">
                <div className="text-xl font-black text-[#111]">{dailyTarget}</div>
                <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wide mt-0.5">Cal target</div>
              </div>
              <div className="w-px h-9 bg-[#EEE]" />

              {/* Food cal */}
              <div className="flex flex-col items-center min-w-[64px]">
                <div className="text-xl font-black text-[#FC5523]">{selectedFoodCal}</div>
                <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wide mt-0.5">Food kcal</div>
              </div>
              <div className="w-px h-9 bg-[#EEE]" />

              {/* Instamart cal */}
              <div className="flex flex-col items-center min-w-[64px]">
                <div className="text-xl font-black text-[#5856D6]">{selectedImCal}</div>
                <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wide mt-0.5">Grocery kcal</div>
              </div>
              <div className="w-px h-9 bg-[#EEE]" />

              {/* Total */}
              <div className="flex flex-col items-center min-w-[64px]">
                <div className="text-xl font-black text-[#16A34A]">{totalSelectedCal}</div>
                <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wide mt-0.5">Total kcal</div>
              </div>
              <div className="w-px h-9 bg-[#EEE]" />

              {/* Spend */}
              <div className="flex flex-col items-center min-w-[64px]">
                <div className="text-xl font-black text-[#111]">
                  ₹{Math.round(selectedFoodTotal + selectedImTotal)}
                </div>
                <div className="text-[10px] font-semibold text-[#999] uppercase tracking-wide mt-0.5">Spend</div>
              </div>

              {/* Progress bar — flex-1 */}
              <div className="flex-1 min-w-[160px]">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[11px] font-bold text-[#111]">
                    {calPct > 0
                      ? `${calPct}% of daily target`
                      : "Add items to track calories"}
                  </span>
                  <span className="text-[11px] text-[#888]">
                    {Math.max(0, dailyTarget - totalSelectedCal)} kcal left
                  </span>
                </div>
                <div className="h-2.5 bg-[#F0EDE8] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      background:
                        calPct >= 100
                          ? "#F87171"
                          : calPct >= 80
                          ? "#F59E0B"
                          : "linear-gradient(90deg,#86EFAC,#34D399)",
                      width: `${Math.max(calPct, 0)}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Segmented breakdown of bar */}
            {totalSelectedCal > 0 && (
              <div className="flex items-center gap-3 text-[11px] text-[#888]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#FC5523]" />
                  Food: {selectedFoodCal} kcal
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#5856D6]" />
                  Groceries: {selectedImCal} kcal
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                  Combined: {totalSelectedCal} / {dailyTarget} kcal
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── EMPTY / LOADING ── */}
        {!result && !error && (
          <div className="rounded-3xl bg-white border border-[#E8E5E0] shadow-sm p-14 flex flex-col items-center text-center gap-5">
            {loading ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-[#F0FFF8] flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-[#16A34A]" />
                </div>
                <div>
                  <p className="font-bold text-[#111] mb-1">Fetching your personalised plan…</p>
                  <p className="text-sm text-[#6B7280]">
                    Calculating BMI → generating search terms → calling Swiggy MCP → ranking results
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-[#F0FFF8] flex items-center justify-center">
                  <ShoppingBasket size={28} className="text-[#16A34A]" />
                </div>
                <div>
                  <h2 className="text-2xl font-black mb-2">Enter your stats to get started</h2>
                  <p className="text-sm text-[#6B7280] max-w-md leading-relaxed">
                    FitPlate calculates your BMI and macro targets, then surfaces live Swiggy food
                    and Instamart grocery picks personalised to your goal.
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && (
          <div className="space-y-4">

            {/* Header + meal tabs */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-[#111]">Your personalised picks</h2>
                <p className="text-sm text-[#888] mt-0.5">
                  Live from Swiggy · BMI {result.bmiResult.bmi} ·{" "}
                  {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                  {result.searchTerms.food.length
                    ? ` · searched "${result.searchTerms.food.join('", "')}"`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "breakfast", "lunch", "dinner", "snack"] as MealTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMealTab(tab)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 ${
                      mealTab === tab
                        ? "bg-[#111] text-white border-[#111] shadow"
                        : "bg-white text-[#555] border-[#DDD] hover:border-[#999]"
                    }`}
                  >
                    {tab === "all" ? "All" : tab === "breakfast" ? "Breakfast" : tab === "lunch" ? "Lunch" : tab === "dinner" ? "Dinner" : "Snacks"}
                  </button>
                ))}
              </div>
            </div>

            {/* Cart / success message */}
            {cartMsg && (
              <div className="rounded-xl border border-[#86EFAC]/40 bg-[#F0FFF8] px-4 py-3 text-sm font-semibold text-[#065F46]">
                {cartMsg}
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">

              {/* ── SWIGGY FOOD ── */}
              <div className="rounded-2xl bg-white border border-[#EAE7E2] shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0EDE8] bg-gradient-to-r from-[#FFF5F0] to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#FC5523] flex items-center justify-center">
                      <Utensils size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold tracking-wide text-[#FC5523]">SWIGGY FOOD</span>
                  </div>
                  <span className="text-xs font-bold text-[#FC5523]">
                    Selected ₹{Math.round(selectedFoodTotal)}
                  </span>
                </div>

                {filteredFood.length === 0 && (
                  <div className="p-10 text-center">
                    <Utensils size={28} className="text-[#DDD] mx-auto mb-3" />
                    <p className="text-sm text-[#999]">
                      {result.foodItems.length === 0
                        ? "Connect Swiggy with a saved address to get food picks."
                        : "No items match this meal filter."}
                    </p>
                  </div>
                )}

                <div className="divide-y divide-[#F5F3F0]">
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
                </div>

                <div className="p-4 border-t border-[#F0EDE8] grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("food")}
                    className="h-11 text-xs font-black bg-[#1F695C] text-white rounded-xl
                               disabled:opacity-40 hover:bg-[#175548] transition-colors shadow-sm"
                  >
                    {cartBusy === "food"
                      ? <Loader2 className="animate-spin mx-auto" size={14} />
                      : "Update Food cart"}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.food}
                    onClick={() => placeOrder("food")}
                    className="h-11 text-xs font-black bg-[#FC5523] text-white rounded-xl
                               disabled:opacity-40 hover:bg-[#e04a1e] transition-colors shadow-sm"
                  >
                    Place Food order
                  </button>
                </div>
                {!cartReady.food && filteredFood.length > 0 && (
                  <p className="px-4 pb-3 text-[10px] text-[#AAA]">Update cart first, then place order.</p>
                )}
              </div>

              {/* ── INSTAMART ── */}
              <div className="rounded-2xl bg-white border border-[#EAE7E2] shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0EDE8] bg-gradient-to-r from-[#F5F3FF] to-white">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#5856D6] flex items-center justify-center">
                      <ShoppingCart size={13} className="text-white" />
                    </div>
                    <span className="text-xs font-bold tracking-wide text-[#5856D6]">INSTAMART GROCERIES</span>
                  </div>
                  <span className="text-xs font-bold text-[#5856D6]">
                    Selected ₹{Math.round(selectedImTotal)}
                  </span>
                </div>

                {result.instamartItems.length === 0 && (
                  <div className="p-10 text-center">
                    <ShoppingCart size={28} className="text-[#DDD] mx-auto mb-3" />
                    <p className="text-sm text-[#999]">
                      Connect Swiggy with a saved address to get grocery picks.
                    </p>
                  </div>
                )}

                <div className="divide-y divide-[#F5F3F0]">
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
                </div>

                <div className="p-4 border-t border-[#F0EDE8] grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("instamart")}
                    className="h-11 text-xs font-black bg-[#5856D6] text-white rounded-xl
                               disabled:opacity-40 hover:bg-[#4846c4] transition-colors shadow-sm"
                  >
                    {cartBusy === "instamart"
                      ? <Loader2 className="animate-spin mx-auto" size={14} />
                      : "Update Instamart cart"}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.instamart}
                    onClick={() => placeOrder("instamart")}
                    className="h-11 text-xs font-black bg-[#FC5523] text-white rounded-xl
                               disabled:opacity-40 hover:bg-[#e04a1e] transition-colors shadow-sm"
                  >
                    Place Instamart order
                  </button>
                </div>
                {!cartReady.instamart && result.instamartItems.length > 0 && (
                  <p className="px-4 pb-3 text-[10px] text-[#AAA]">Update cart first, then place order.</p>
                )}
              </div>
            </div>

            {/* ── SHARE CARD ── */}
            <div className="rounded-3xl bg-gradient-to-br from-[#052e16] via-[#064E3B] to-[#065F46]
                            p-6 flex flex-wrap items-center justify-between gap-4 shadow-xl">
              <div>
                <p className="text-[10px] font-bold text-[#6EE7B7] tracking-[0.18em] uppercase mb-1.5">
                  ✦ Shareable plan
                </p>
                <p className="text-xl font-black text-white">
                  BMI {result.bmiResult.bmi} · {bmiCategoryLabel(result.bmiResult.category)} ·{" "}
                  {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                </p>
                <p className="text-sm text-[#A7F3D0] mt-0.5">
                  {result.bmiResult.targets.calories} kcal/day · {result.bmiResult.targets.protein}g
                  protein target
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="flex items-center gap-2 bg-white text-[#065F46] text-xs font-black
                             px-4 py-2.5 rounded-xl hover:bg-[#F0FFF8] transition-colors shadow"
                >
                  <Share2 size={13} /> Copy link
                </button>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `My FitPlate plan — BMI ${result.bmiResult.bmi}, goal: ${GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}. Check yours: ${typeof window !== "undefined" ? shareUrl() : ""}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 border border-white/25 text-white text-xs font-black
                             px-4 py-2.5 rounded-xl hover:bg-white/10 transition-colors"
                >
                  Share on WhatsApp
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ── SUB-COMPONENTS ────────────────────────────────────────────────────────────

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
    <div className="flex gap-3 px-4 py-3.5 hover:bg-[#FAFAF8] transition-colors">
      {/* Icon placeholder */}
      <div
        className="w-[60px] h-[60px] rounded-xl flex-shrink-0 flex items-center justify-center"
        style={{
          background: item.isVeg
            ? "linear-gradient(135deg,#F0FDF4,#DCFCE7)"
            : "linear-gradient(135deg,#FFF7ED,#FFEDD5)",
        }}
      >
        <Utensils
          size={22}
          className={item.isVeg ? "text-[#16A34A]" : "text-[#EA580C]"}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Veg / non-veg dot */}
        <div className="flex items-center gap-1.5 mb-1">
          <div
            className={`w-3 h-3 rounded-sm border-[1.5px] flex items-center justify-center flex-shrink-0 ${
              item.isVeg ? "border-[#2E7D32]" : "border-[#C62828]"
            }`}
          >
            <div className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-[#2E7D32]" : "bg-[#C62828]"}`} />
          </div>
          <span className="text-[10px] text-[#999]">{item.isVeg ? "Pure Veg" : "Non-veg"}</span>
        </div>

        <p className="text-sm font-bold text-[#111] leading-snug">{item.name}</p>
        <p className="text-[11px] text-[#888] mt-0.5 mb-2">
          {item.restaurantName}
          {item.rating ? ` · ★ ${item.rating}` : ""}
        </p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-2.5">
          {item.estimatedCalories > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#15803D]">
              {item.estimatedCalories} kcal
            </span>
          )}
          {item.estimatedProtein > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
              {item.estimatedProtein}g protein
            </span>
          )}
          {item.fitTag && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C]">
              {item.fitTag}
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
    <div className="flex gap-3 px-4 py-3.5 hover:bg-[#FAFAF8] transition-colors">
      {/* Icon placeholder */}
      <div className="relative w-[60px] h-[60px] rounded-xl flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-[#F5F3FF] to-[#EDE9FE]">
        <Package size={22} className="text-[#5856D6]" />
        {discountPct > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#16A34A] text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow">
            {discountPct}%
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-[#888] uppercase tracking-[0.08em] mb-0.5">
          {item.brand}
        </p>
        <p className="text-sm font-bold text-[#111] leading-snug">{item.name}</p>
        <p className="text-[11px] text-[#888] mt-0.5 mb-2">{item.quantityDescription}</p>

        {/* Tags */}
        <div className="flex flex-wrap gap-1 mb-2.5">
          {item.fitTag && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F0FDF4] text-[#15803D]">
              {item.fitTag}
            </span>
          )}
          {item.estimatedCalories > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#FFF7ED] text-[#C2410C]">
              ~{item.estimatedCalories} kcal/serving
            </span>
          )}
          {item.estimatedProtein > 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
              {item.estimatedProtein}g protein
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-black text-[#111]">₹{Math.round(item.offerPrice)}</span>
            {item.mrp > item.offerPrice && (
              <span className="text-[11px] text-[#CCC] line-through">₹{Math.round(item.mrp)}</span>
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
  const borderText = isOrange
    ? "border-[#FC5523] text-[#FC5523]"
    : "border-[#5856D6] text-[#5856D6]";
  const hoverClasses = isOrange
    ? "hover:bg-[#FC5523] hover:text-white"
    : "hover:bg-[#5856D6] hover:text-white";

  if (qty === 0) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(1)}
        className={`border ${borderText} ${hoverClasses} text-[11px] font-black px-4 py-1.5
                    rounded-lg disabled:opacity-40 transition-colors`}
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
        className={`px-2 py-1.5 ${borderText} ${hoverClasses} transition-colors`}
      >
        <Minus size={11} />
      </button>
      <span className={`px-3 text-xs font-black min-w-[28px] text-center ${isOrange ? "text-[#FC5523]" : "text-[#5856D6]"}`}>
        {qty}
      </span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(qty + 1)}
        className={`px-2 py-1.5 ${borderText} ${hoverClasses} transition-colors disabled:opacity-40`}
      >
        <Plus size={11} />
      </button>
    </div>
  );
}
