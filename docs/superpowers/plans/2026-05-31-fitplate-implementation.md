# FitPlate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Swiggy Evening Planner with FitPlate — a BMI-based food and grocery recommender that uses Swiggy Food and Instamart MCP to surface personalized, directly-cartable meal and grocery picks.

**Architecture:** Pure-math BMI/TDEE calculation → Groq generates Swiggy-optimised search terms → parallel MCP calls for food menu search and Instamart product search → Groq re-ranks raw results by calorie/macro fit → Swiggy-style UI cards with one-tap ADD to existing cart routes.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, Groq SDK (llama-3.3-70b-versatile), Swiggy MCP (food + instamart servers), `@modelcontextprotocol/sdk`, lucide-react

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/types.ts` | Extend | Add BMI*, MacroTargets, RankedFoodItem, RankedInstamartItem, BMIPlanResponse |
| `src/lib/bmi.ts` | Create | Pure BMI math: calculateBMI, getBMICategory, computeBMR, computeTDEE, computeTargetCalories, computeMacroTargets |
| `src/lib/commerce.ts` | Extend | Export extractFoodOptionsFromSearches + extractInstamartOptionsFromSearches (multi-snapshot versions) |
| `src/lib/groq.ts` | Extend | Add generateFoodSearchTerms() + its fallback helper |
| `src/lib/food-ranker.ts` | Create | rankFoodItems() + rankInstamartItems() — Groq re-ranking with calorie tags |
| `src/app/api/bmi-plan/route.ts` | Create | Orchestration: BMI math → Groq search terms → parallel MCP → Groq ranking |
| `src/components/FitPlate.tsx` | Create | Full UI: dark input card, BMI arc, calorie tracker, Swiggy-style food/instamart cards |
| `src/app/page.tsx` | Update | Import FitPlate instead of EveningPlanner |
| `src/components/EveningPlanner.tsx` | Delete | Superseded |
| `src/app/api/plan/route.ts` | Delete | Superseded |
| `src/lib/planner.ts` | Delete | Superseded |

---

## Task 1: Extend types.ts

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add BMI types at the end of the file**

Open `src/lib/types.ts` and append after the last existing type:

```ts
export type BMIInput = {
  height: number;
  weight: number;
  age: number;
  gender: "male" | "female";
  diet: "veg" | "non-veg" | "vegan";
  goal: "lose" | "healthy" | "muscle" | "maintain";
};

export type MacroTargets = {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type BMIResult = {
  bmi: number;
  category: "underweight" | "normal" | "overweight" | "obese";
  tdee: number;
  targets: MacroTargets;
};

export type RankedFoodItem = FoodOption & {
  estimatedCalories: number;
  estimatedProtein: number;
  fitTag: string;
  fitReason: string;
  mealTime: "breakfast" | "lunch" | "dinner" | "snack" | "any";
};

export type RankedInstamartItem = InstamartOption & {
  fitTag: string;
  healthBenefit: string;
};

export type BMIPlanResponse = {
  ok: boolean;
  bmiResult: BMIResult;
  foodItems: RankedFoodItem[];
  instamartItems: RankedInstamartItem[];
  searchTerms: { food: string[]; grocery: string[] };
  foodAddressId?: string;
  instamartAddressId?: string;
  foodRestaurantId?: string;
  errors: string[];
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat(types): add BMI, macro, and FitPlate response types"
```

---

## Task 2: Create bmi.ts

**Files:**
- Create: `src/lib/bmi.ts`

- [ ] **Step 1: Create the file with pure BMI math**

```ts
export type BMICategory = "underweight" | "normal" | "overweight" | "obese";

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function getBMICategory(bmi: number): BMICategory {
  if (bmi < 18.5) return "underweight";
  if (bmi < 25) return "normal";
  if (bmi < 30) return "overweight";
  return "obese";
}

export function computeBMR(
  weightKg: number,
  heightCm: number,
  age: number,
  gender: "male" | "female",
): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(gender === "male" ? base + 5 : base - 161);
}

export function computeTDEE(bmr: number): number {
  return Math.round(bmr * 1.375);
}

export function computeTargetCalories(
  tdee: number,
  goal: "lose" | "healthy" | "muscle" | "maintain",
): number {
  if (goal === "lose") return Math.max(1200, tdee - 500);
  if (goal === "muscle") return tdee + 300;
  return tdee;
}

export function computeMacroTargets(
  targetCalories: number,
  weightKg: number,
  goal: "lose" | "healthy" | "muscle" | "maintain",
) {
  const protein = Math.round(goal === "muscle" ? weightKg * 1.6 : weightKg * 1.2);
  const fat = Math.round((targetCalories * 0.28) / 9);
  const carbs = Math.max(0, Math.round((targetCalories - protein * 4 - fat * 9) / 4));
  return { calories: targetCalories, protein, fat, carbs };
}

export function bmiCategoryLabel(category: BMICategory): string {
  return {
    underweight: "Underweight",
    normal: "Healthy weight",
    overweight: "Slightly overweight",
    obese: "Obese",
  }[category];
}

export function bmiCategoryEmoji(category: BMICategory): string {
  return { underweight: "📉", normal: "✅", overweight: "⚠️", obese: "🔴" }[category];
}
```

- [ ] **Step 2: Verify math by mental check**

  - BMI 78kg / (1.72m)² = 78 / 2.9584 = 26.4 ✓
  - Male BMR: 10×78 + 6.25×172 − 5×26 + 5 = 780 + 1075 − 130 + 5 = 1730
  - TDEE: 1730 × 1.375 = 2379 ✓
  - Lose weight: 2379 − 500 = 1879 → protein 78×1.2 = 94g, fat (1879×0.28)/9 = 58g ✓

- [ ] **Step 3: Commit**

```bash
git add src/lib/bmi.ts
git commit -m "feat(bmi): add BMI, TDEE, and macro calculation utilities"
```

---

## Task 3: Extend commerce.ts with multi-snapshot extractors

**Files:**
- Modify: `src/lib/commerce.ts`

The existing `extractFoodOptions` and `extractInstamartOptions` are private and handle a single tool call snapshot. We need exported versions that accept arrays of snapshots (one per search query) and merge+deduplicate results.

- [ ] **Step 1: Add the two exported functions at the bottom of commerce.ts (before the private helpers)**

Add this block after the `buildCommerceOptions` function and before `function extractFoodOptions`:

```ts
export function extractFoodOptionsFromSearches(
  snapshots: ToolCallSnapshot[],
  addressId: string,
  restaurantId: string | undefined,
  restaurantName: string | undefined,
): FoodOption[] {
  const seen = new Set<string>();
  const all: FoodOption[] = [];
  for (const snap of snapshots) {
    if (snap.status !== "ok") continue;
    const items = extractFoodOptions(snap.data, addressId, restaurantId, restaurantName);
    for (const item of items) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        all.push(item);
      }
    }
  }
  return all.sort((a, b) => scoreFoodOption(b) - scoreFoodOption(a)).slice(0, 20);
}

export function extractInstamartOptionsFromSearches(
  snapshots: ToolCallSnapshot[],
  addressId: string,
): InstamartOption[] {
  const seen = new Set<string>();
  const all: InstamartOption[] = [];
  for (const snap of snapshots) {
    if (snap.status !== "ok") continue;
    const items = extractInstamartOptions(snap.data, addressId);
    for (const item of items) {
      if (!seen.has(item.spinId)) {
        seen.add(item.spinId);
        all.push(item);
      }
    }
  }
  return all.sort((a, b) => scoreInstamartOption(b) - scoreInstamartOption(a)).slice(0, 20);
}
```

Also add a helper to extract restaurant info from multiple snapshots — add after the block above:

```ts
export function extractRestaurantFromSearches(
  snapshots: ToolCallSnapshot[],
): { id: string; name: string } | undefined {
  for (const snap of snapshots) {
    if (snap.status !== "ok") continue;
    const restaurants = getStructured<Record<string, unknown>[]>(snap.data, "restaurants");
    const hit = restaurants.find(
      (r) => typeof r.id === "string" && typeof r.name === "string",
    );
    if (hit) return { id: String(hit.id), name: String(hit.name) };
  }
  return undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/commerce.ts
git commit -m "feat(commerce): export multi-snapshot food and instamart extractors"
```

---

## Task 4: Add generateFoodSearchTerms to groq.ts

**Files:**
- Modify: `src/lib/groq.ts`

- [ ] **Step 1: Add the import for BMICategory at top of groq.ts**

Add to the existing import line:
```ts
import type { EveningPlanInput, ToolCallSnapshot, EveningPlan } from "@/lib/types";
import type { BMICategory } from "@/lib/bmi";
```

- [ ] **Step 2: Append generateFoodSearchTerms and its fallback at the bottom of groq.ts**

```ts
export async function generateFoodSearchTerms(
  category: BMICategory,
  goal: "lose" | "healthy" | "muscle" | "maintain",
  diet: "veg" | "non-veg" | "vegan",
): Promise<{ foodQueries: string[]; groceryQueries: string[] }> {
  const fallback = buildFallbackSearchTerms(category, goal, diet);

  try {
    const response = await getGroq().chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON. Generate Swiggy search queries for food delivery and grocery delivery based on BMI and health goal. Use real Indian dish and product names that appear on Swiggy.",
        },
        {
          role: "user",
          content: JSON.stringify({
            schema: { foodQueries: "string[] exactly 3", groceryQueries: "string[] exactly 3" },
            bmiCategory: category,
            goal,
            diet,
            context:
              "India, Swiggy food delivery and Instamart grocery. Queries must be real menu item names on Indian food delivery apps. No generic terms like 'lean protein'.",
          }),
        },
      ],
    });

    const parsed = safeJson<{ foodQueries?: string[]; groceryQueries?: string[] }>(
      response.choices[0]?.message?.content,
      {},
    );

    return {
      foodQueries:
        Array.isArray(parsed.foodQueries) && parsed.foodQueries.length === 3
          ? parsed.foodQueries
          : fallback.foodQueries,
      groceryQueries:
        Array.isArray(parsed.groceryQueries) && parsed.groceryQueries.length === 3
          ? parsed.groceryQueries
          : fallback.groceryQueries,
    };
  } catch {
    return fallback;
  }
}

function buildFallbackSearchTerms(
  category: BMICategory,
  goal: string,
  diet: string,
): { foodQueries: string[]; groceryQueries: string[] } {
  const isVeg = diet === "veg" || diet === "vegan";

  const food: Record<string, Record<string, string[]>> = {
    underweight: {
      muscle: isVeg
        ? ["paneer butter masala", "dal makhani rice", "mango lassi"]
        : ["chicken biryani", "mutton curry rice", "egg bhurji"],
      default: isVeg
        ? ["paneer curry", "aloo paratha", "banana shake"]
        : ["chicken curry rice", "egg curry", "mutton biryani"],
    },
    normal: {
      muscle: isVeg
        ? ["paneer tikka", "soya chunk curry", "chickpea salad"]
        : ["grilled chicken", "egg white omelette", "tuna wrap"],
      default: isVeg
        ? ["vegetable bowl", "dal tadka roti", "fruit bowl"]
        : ["grilled chicken salad", "egg omelette", "fish curry"],
    },
    overweight: {
      lose: isVeg
        ? ["quinoa salad bowl", "dal soup", "grilled paneer tikka"]
        : ["grilled chicken salad", "egg white wrap", "fish tikka"],
      default: isVeg
        ? ["vegetable soup", "sprouts salad", "oats porridge"]
        : ["chicken soup", "grilled fish", "boiled eggs"],
    },
    obese: {
      lose: isVeg
        ? ["green salad", "vegetable soup", "sprouts"]
        : ["chicken clear soup", "grilled fish", "boiled eggs"],
      default: isVeg
        ? ["salad bowl", "vegetable soup", "dal soup"]
        : ["chicken soup", "fish tikka", "egg salad"],
    },
  };

  const grocery: Record<string, string[]> = {
    underweight: isVeg
      ? ["peanut butter", "dry fruits mix", "mass gainer"]
      : ["whey protein", "dry fruits", "mass gainer protein"],
    normal: isVeg
      ? ["mixed nuts almonds", "greek yogurt", "muesli no sugar"]
      : ["almonds roasted", "greek yogurt", "protein bar"],
    overweight: isVeg
      ? ["almonds roasted", "millet", "green tea"]
      : ["almonds", "greek yogurt low fat", "green tea"],
    obese: isVeg
      ? ["green tea", "oats", "chia seeds"]
      : ["green tea", "oats", "almonds roasted"],
  };

  const goalKey = goal in (food[category] ?? {}) ? goal : "default";

  return {
    foodQueries: food[category]?.[goalKey] ?? food.normal.default,
    groceryQueries: grocery[category] ?? grocery.normal,
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/groq.ts
git commit -m "feat(groq): add generateFoodSearchTerms with BMI-based fallbacks"
```

---

## Task 5: Create food-ranker.ts

**Files:**
- Create: `src/lib/food-ranker.ts`

- [ ] **Step 1: Create the file**

```ts
import Groq from "groq-sdk";
import type { FoodOption, InstamartOption, RankedFoodItem, RankedInstamartItem, MacroTargets } from "@/lib/types";

let groqClient: Groq | null = null;

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  if (!groqClient) groqClient = new Groq({ apiKey });
  return groqClient;
}

function safeJson<T>(content: string | null | undefined, fallback: T): T {
  if (!content) return fallback;
  try {
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

type FoodRankResult = {
  id: string;
  estimatedCalories: number;
  estimatedProtein: number;
  fitTag: string;
  fitReason: string;
  mealTime: "breakfast" | "lunch" | "dinner" | "snack" | "any";
};

type ImRankResult = {
  spinId: string;
  fitTag: string;
  healthBenefit: string;
};

export async function rankFoodItems(
  rawItems: FoodOption[],
  targets: MacroTargets,
): Promise<RankedFoodItem[]> {
  if (!rawItems.length) return [];

  const perMealCalories = Math.round(targets.calories / 3);

  const simplified = rawItems.slice(0, 20).map((item) => ({
    id: item.id,
    name: item.name,
    restaurantName: item.restaurantName,
    price: item.price,
    isVeg: item.isVeg,
    rating: item.rating,
  }));

  try {
    const response = await getGroq().chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON. You are a nutritionist ranking Indian food delivery items by calorie and macro fit. Estimate nutritional values from the dish name. Be conservative.",
        },
        {
          role: "user",
          content: JSON.stringify({
            schema: {
              ranked: [
                {
                  id: "string — original id, unchanged",
                  estimatedCalories: "number — calories for one serving",
                  estimatedProtein: "number — grams of protein",
                  fitTag: "one of: Low carb | High protein | Balanced | Calorie dense | Light meal",
                  fitReason: "string — max 6 words why this fits the goal",
                  mealTime: "one of: breakfast | lunch | dinner | snack | any",
                },
              ],
            },
            targetCaloriesPerMeal: perMealCalories,
            proteinTargetPerDay: targets.protein,
            items: simplified,
            instruction: `Rank best to worst fit. Exclude items you estimate exceed ${perMealCalories * 2} calories per serving.`,
          }),
        },
      ],
    });

    const parsed = safeJson<{ ranked?: FoodRankResult[] }>(
      response.choices[0]?.message?.content,
      {},
    );
    const ranked = parsed.ranked ?? [];
    const itemMap = new Map(rawItems.map((item) => [item.id, item]));

    return ranked
      .filter((r) => itemMap.has(r.id))
      .slice(0, 8)
      .map((r) => ({
        ...itemMap.get(r.id)!,
        estimatedCalories: r.estimatedCalories ?? 0,
        estimatedProtein: r.estimatedProtein ?? 0,
        fitTag: r.fitTag ?? "Balanced",
        fitReason: r.fitReason ?? "",
        mealTime: r.mealTime ?? "any",
      }));
  } catch {
    return rawItems.slice(0, 8).map((item) => ({
      ...item,
      estimatedCalories: 0,
      estimatedProtein: 0,
      fitTag: "Balanced",
      fitReason: "",
      mealTime: "any" as const,
    }));
  }
}

export async function rankInstamartItems(
  rawItems: InstamartOption[],
  targets: MacroTargets,
): Promise<RankedInstamartItem[]> {
  if (!rawItems.length) return [];

  const simplified = rawItems.slice(0, 20).map((item) => ({
    spinId: item.spinId,
    brand: item.brand,
    name: item.name,
    quantityDescription: item.quantityDescription,
    offerPrice: item.offerPrice,
    discount: item.discount,
  }));

  try {
    const response = await getGroq().chat.completions.create({
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return only JSON. You are a nutritionist ranking grocery items by how well they support a health goal.",
        },
        {
          role: "user",
          content: JSON.stringify({
            schema: {
              ranked: [
                {
                  spinId: "string — original spinId, unchanged",
                  fitTag:
                    "one of: Zero sugar | High fibre | High protein | Low GI | Probiotic | Healthy fat | Antioxidant",
                  healthBenefit: "string — max 10 words, plain English benefit for this item",
                },
              ],
            },
            calorieTarget: targets.calories,
            proteinTarget: targets.protein,
            items: simplified,
          }),
        },
      ],
    });

    const parsed = safeJson<{ ranked?: ImRankResult[] }>(
      response.choices[0]?.message?.content,
      {},
    );
    const ranked = parsed.ranked ?? [];
    const itemMap = new Map(rawItems.map((item) => [item.spinId, item]));

    return ranked
      .filter((r) => itemMap.has(r.spinId))
      .slice(0, 8)
      .map((r) => ({
        ...itemMap.get(r.spinId)!,
        fitTag: r.fitTag ?? "Healthy",
        healthBenefit: r.healthBenefit ?? "",
      }));
  } catch {
    return rawItems.slice(0, 8).map((item) => ({
      ...item,
      fitTag: "Healthy",
      healthBenefit: "",
    }));
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/food-ranker.ts
git commit -m "feat(food-ranker): add Groq-based calorie/macro re-ranking for food and instamart items"
```

---

## Task 6: Create /api/bmi-plan/route.ts

**Files:**
- Create: `src/app/api/bmi-plan/route.ts`

- [ ] **Step 1: Create the orchestration route**

```ts
import { NextRequest, NextResponse } from "next/server";
import {
  calculateBMI,
  getBMICategory,
  computeBMR,
  computeTDEE,
  computeTargetCalories,
  computeMacroTargets,
} from "@/lib/bmi";
import { generateFoodSearchTerms } from "@/lib/groq";
import { rankFoodItems, rankInstamartItems } from "@/lib/food-ranker";
import { captureToolCall, firstAddressId, firstRestaurantId } from "@/lib/swiggy-mcp";
import {
  extractFoodOptionsFromSearches,
  extractInstamartOptionsFromSearches,
  extractRestaurantFromSearches,
} from "@/lib/commerce";
import type { BMIInput, BMIPlanResponse } from "@/lib/types";

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;

  try {
    const body = (await req.json()) as BMIInput;
    const { height, weight, age, gender, diet, goal } = body;

    const bmi = calculateBMI(weight, height);
    const category = getBMICategory(bmi);
    const bmr = computeBMR(weight, height, age, gender);
    const tdee = computeTDEE(bmr);
    const targetCalories = computeTargetCalories(tdee, goal);
    const targets = computeMacroTargets(targetCalories, weight, goal);
    const bmiResult = { bmi, category, tdee, targets };

    const searchTerms = await generateFoodSearchTerms(category, goal, diet);
    const vegFilter = diet === "veg" || diet === "vegan" ? 1 : 0;

    const [foodAddresses, instamartAddresses] = await Promise.all([
      captureToolCall("food", "get_addresses", {}, origin),
      captureToolCall("instamart", "get_addresses", {}, origin),
    ]);

    const foodAddressId =
      foodAddresses.status === "ok" ? firstAddressId(foodAddresses.data) : undefined;
    const instamartAddressId =
      instamartAddresses.status === "ok" ? firstAddressId(instamartAddresses.data) : undefined;

    const [foodSearchResults, instamartSearchResults] = await Promise.all([
      foodAddressId
        ? Promise.all(
            searchTerms.foodQueries.map((q) =>
              captureToolCall(
                "food",
                "search_menu",
                { addressId: foodAddressId, query: q, vegFilter },
                origin,
              ),
            ),
          )
        : Promise.resolve([]),
      instamartAddressId
        ? Promise.all(
            searchTerms.groceryQueries.map((q) =>
              captureToolCall(
                "instamart",
                "search_products",
                { addressId: instamartAddressId, query: q },
                origin,
              ),
            ),
          )
        : Promise.resolve([]),
    ]);

    const restaurant = extractRestaurantFromSearches(foodSearchResults);
    const foodRestaurantId =
      restaurant?.id ??
      (foodSearchResults.find((r) => r.status === "ok")
        ? firstRestaurantId(foodSearchResults.find((r) => r.status === "ok")!.data)
        : undefined);
    const foodRestaurantName = restaurant?.name;

    const rawFoodOptions = extractFoodOptionsFromSearches(
      foodSearchResults,
      foodAddressId ?? "",
      foodRestaurantId,
      foodRestaurantName,
    );
    const rawInstamartOptions = extractInstamartOptionsFromSearches(
      instamartSearchResults,
      instamartAddressId ?? "",
    );

    const [foodItems, instamartItems] = await Promise.all([
      rankFoodItems(rawFoodOptions, targets),
      rankInstamartItems(rawInstamartOptions, targets),
    ]);

    const errors = [
      !foodAddressId ? "Connect Swiggy to load food picks" : null,
      !instamartAddressId ? "Connect Swiggy to load grocery picks" : null,
      ...foodSearchResults
        .filter((r) => r.status === "error")
        .map((r) => r.error ?? "Food search error"),
      ...instamartSearchResults
        .filter((r) => r.status === "error")
        .map((r) => r.error ?? "Instamart search error"),
    ].filter((e): e is string => Boolean(e));

    return NextResponse.json({
      ok: true,
      bmiResult,
      foodItems,
      instamartItems,
      searchTerms,
      foodAddressId,
      instamartAddressId,
      foodRestaurantId,
      errors,
    } satisfies BMIPlanResponse);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        bmiResult: null,
        foodItems: [],
        instamartItems: [],
        searchTerms: { food: [], grocery: [] },
        errors: [err instanceof Error ? err.message : "Plan failed"],
      },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bmi-plan/route.ts
git commit -m "feat(api): add /api/bmi-plan orchestration route"
```

---

## Task 7: Create FitPlate.tsx

**Files:**
- Create: `src/components/FitPlate.tsx`

- [ ] **Step 1: Create the component**

```tsx
"use client";

import {
  CheckCircle2,
  Compass,
  Loader2,
  Minus,
  Navigation,
  Plus,
  PlugZap,
  Share2,
  ShoppingBasket,
  Sparkles,
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { BMIInput, BMIPlanResponse, RankedFoodItem, RankedInstamartItem } from "@/lib/types";
import { bmiCategoryEmoji, bmiCategoryLabel } from "@/lib/bmi";

type StatusResponse = {
  groqConfigured: boolean;
  swiggy: { connected: boolean; hasPendingAuthorization: boolean };
};

type MealTab = "all" | "breakfast" | "lunch" | "dinner" | "snack";

const today = new Date().toISOString().slice(0, 10);

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

  const readiness = useMemo(() => {
    if (!status) return "Checking setup…";
    if (!status.groqConfigured) return "Add GROQ_API_KEY to .env.local";
    if (!status.swiggy.connected) return "Connect Swiggy for live picks";
    return "Ready";
  }, [status]);

  const isReady = status?.groqConfigured && status?.swiggy.connected;

  async function submitPlan() {
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
        body: JSON.stringify(input),
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
        if (!selected.length) { setError("Select at least one food item."); setCartBusy(null); return; }
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
        if (!selected.length) { setError("Select at least one grocery item."); setCartBusy(null); return; }
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

  const selectedFoodTotal = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.price * (foodQty[i.id] ?? 0), 0) ?? 0;

  const selectedImTotal = result?.instamartItems
    .filter((i) => (imQty[i.spinId] ?? 0) > 0)
    .reduce((s, i) => s + i.offerPrice * (imQty[i.spinId] ?? 0), 0) ?? 0;

  const selectedCalories = result?.foodItems
    .filter((i) => (foodQty[i.id] ?? 0) > 0)
    .reduce((s, i) => s + i.estimatedCalories * (foodQty[i.id] ?? 0), 0) ?? 0;

  const dailyTarget = result?.bmiResult.targets.calories ?? 0;
  const calPct = dailyTarget > 0 ? Math.min(100, Math.round((selectedCalories / dailyTarget) * 100)) : 0;

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

  function numInput(field: keyof BMIInput, val: string) {
    const n = parseInt(val, 10);
    if (!Number.isNaN(n) && n > 0) setInput((i) => ({ ...i, [field]: n }));
  }

  // Parse share params from URL on first load
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
      // auto-submit after setting input
      setTimeout(() => {
        fetch("/api/bmi-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        })
          .then((r) => r.json())
          .then((data) => { if (data.ok) setResult(data); })
          .catch(() => null);
      }, 200);
    }
  }, []);

  const bmi = result?.bmiResult.bmi ?? computeClientBMI(input.height, input.weight);
  const bmiPct = Math.min(100, Math.max(0, ((bmi - 10) / (40 - 10)) * 100));
  const arcDash = 283; // 2π × r45
  const arcOffset = arcDash - (bmiPct / 100) * arcDash;
  const arcColor = bmi < 18.5 ? "#60A5FA" : bmi < 25 ? "#4ADE80" : bmi < 30 ? "#F59E0B" : "#F87171";

  return (
    <main className="min-h-screen bg-[#F7F6F3]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 space-y-6">

        {/* ── INPUT CARD ── */}
        <div className="rounded-2xl bg-[#0C0F0A] p-6 md:p-8 grid gap-8 md:grid-cols-[1fr_240px] items-center">
          <div>
            <p className="text-xs font-bold tracking-[0.2em] text-[#86EFAC] mb-4">FITPLATE · POWERED BY SWIGGY</p>
            <h1 className="text-4xl sm:text-5xl font-black text-white leading-tight tracking-tight mb-2">
              Eat right for <span className="text-[#86EFAC]">your</span> body.
            </h1>
            <p className="text-sm text-[#6B7280] mb-6 max-w-lg">
              Enter your stats. We&apos;ll find the best food on Swiggy and stock your kitchen via Instamart — personalised to your BMI and goal.
            </p>

            {/* stat inputs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(["height", "weight", "age"] as const).map((field) => (
                <label key={field} className="block bg-white/5 border border-white/10 rounded-xl p-3 cursor-text hover:border-[#86EFAC]/40 transition-colors">
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
                <span className="block text-[10px] font-bold tracking-[0.1em] text-[#9CA3AF] uppercase mb-2">Gender</span>
                <div className="flex gap-2">
                  {(["male", "female"] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setInput((i) => ({ ...i, gender: g }))}
                      className={`flex-1 text-xs font-bold py-1 rounded-lg transition-colors ${input.gender === g ? "bg-[#86EFAC] text-[#052e16]" : "text-[#9CA3AF] border border-white/10"}`}
                    >
                      {g === "male" ? "♂ M" : "♀ F"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* diet */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["veg", "non-veg", "vegan"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setInput((i) => ({ ...i, diet: d }))}
                  className={`px-4 py-2 rounded-full text-xs font-bold border transition-colors ${input.diet === d ? "bg-[#86EFAC] text-[#052e16] border-[#86EFAC]" : "border-white/15 text-[#D1D5DB]"}`}
                >
                  {d === "veg" ? "🌿 Veg" : d === "non-veg" ? "🍗 Non-Veg" : "🌱 Vegan"}
                </button>
              ))}
            </div>

            {/* goals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
              {GOAL_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => setInput((i) => ({ ...i, goal: g.value }))}
                  className={`text-left rounded-xl border p-3 transition-colors ${input.goal === g.value ? "border-[#86EFAC] bg-[#86EFAC]/10" : "border-white/10 bg-white/5"}`}
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
                onClick={submitPlan}
                disabled={loading}
                className="flex items-center gap-2 bg-[#86EFAC] text-[#052e16] text-sm font-black px-6 py-3 rounded-xl hover:bg-[#6ee7b7] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                {loading ? "Building your plan…" : "Get my food plan →"}
              </button>

              <div className={`flex items-center gap-2 text-xs font-bold ${isReady ? "text-[#86EFAC]" : "text-[#F59E0B]"}`}>
                {isReady ? <CheckCircle2 size={14} /> : <Compass size={14} />}
                {readiness}
              </div>

              {status && (!status.swiggy.connected) && (
                <a
                  href="/api/auth/swiggy/start"
                  className="flex items-center gap-2 border border-[#86EFAC]/40 text-[#86EFAC] text-xs font-bold px-4 py-2 rounded-xl hover:bg-[#86EFAC]/10 transition-colors"
                >
                  <PlugZap size={13} /> Connect Swiggy
                </a>
              )}
            </div>
          </div>

          {/* BMI ARC */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative w-40 h-40">
              <svg className="w-40 h-40 -rotate-90" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="45" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                <circle
                  cx="48" cy="48" r="45" fill="none"
                  stroke={arcColor}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${arcDash}`}
                  strokeDashoffset={arcOffset}
                  style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-black text-white">{bmi.toFixed(1)}</span>
                <span className="text-[10px] font-bold text-[#9CA3AF] tracking-widest">BMI</span>
              </div>
            </div>

            {result && (
              <>
                <span className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: arcColor + "22", color: arcColor }}>
                  {bmiCategoryEmoji(result.bmiResult.category)} {bmiCategoryLabel(result.bmiResult.category)}
                </span>

                <div className="w-full bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                  <p className="text-[10px] font-bold text-[#9CA3AF] tracking-[0.12em] uppercase">Daily targets</p>
                  {[
                    { label: "Calories", val: `${result.bmiResult.targets.calories}`, color: "#86EFAC", pct: 65 },
                    { label: "Protein", val: `${result.bmiResult.targets.protein}g`, color: "#60A5FA", pct: 78 },
                    { label: "Fat limit", val: `${result.bmiResult.targets.fat}g`, color: "#F87171", pct: 45 },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-2">
                      <span className="text-[11px] text-[#D1D5DB] w-16 flex-shrink-0">{t.label}</span>
                      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ background: t.color, width: `${t.pct}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-white w-10 text-right flex-shrink-0">{t.val}</span>
                    </div>
                  ))}
                </div>
              </>
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
              <div className="text-xl font-black text-[#16A34A]">{selectedCalories}</div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Selected cal</div>
            </div>
            <div className="w-px h-9 bg-[#EEE]" />
            <div className="text-center min-w-[70px]">
              <div className="text-xl font-black text-[#6B7280]">{Math.max(0, dailyTarget - selectedCalories)}</div>
              <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wide">Remaining</div>
            </div>
            <div className="flex-1 min-w-[120px]">
              <div className="h-2 bg-[#F0EDE8] rounded-full overflow-hidden mb-1">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ background: "linear-gradient(90deg,#86EFAC,#34D399)", width: `${calPct}%` }}
                />
              </div>
              <p className="text-xs text-[#888]"><strong className="text-[#111]">{calPct}%</strong> of daily calories selected</p>
            </div>
          </div>
        )}

        {/* ── RESULTS ── */}
        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black">Your personalised picks</h2>
                <p className="text-sm text-[#6B7280]">
                  Live from Swiggy · BMI {result.bmiResult.bmi} · {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                  {result.searchTerms.food.length ? ` · searched: "${result.searchTerms.food.join('", "')}"` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(["all", "breakfast", "lunch", "dinner", "snack"] as MealTab[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMealTab(tab)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${mealTab === tab ? "bg-[#111] text-white border-[#111]" : "bg-white text-[#555] border-[#E0DDD8]"}`}
                  >
                    {tab === "all" ? "All" : tab === "breakfast" ? "🌅 Breakfast" : tab === "lunch" ? "☀️ Lunch" : tab === "dinner" ? "🌙 Dinner" : "🥤 Snacks"}
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
                  <span className="text-xs font-bold tracking-[0.1em] uppercase text-[#888]">🛵 Swiggy Food</span>
                  <span className="text-xs font-bold text-[#FC5523]">Selected ₹{Math.round(selectedFoodTotal)}</span>
                </div>

                {filteredFood.length === 0 && (
                  <div className="p-8 text-center text-sm text-[#888]">
                    {result.foodItems.length === 0
                      ? "Connect Swiggy and add a saved address to get food picks."
                      : "No items match this meal filter."}
                  </div>
                )}

                {filteredFood.map((item) => (
                  <FoodCard
                    key={item.id}
                    item={item}
                    qty={foodQty[item.id] ?? 0}
                    onChange={(q) => { setCartReady((c) => ({ ...c, food: false })); setFoodQty((s) => ({ ...s, [item.id]: q })); }}
                  />
                ))}

                <div className="p-3 border-t border-[#F0EDE8] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("food")}
                    className="h-10 text-xs font-black bg-[#1F695C] text-white rounded-lg disabled:opacity-40"
                  >
                    {cartBusy === "food" ? <Loader2 className="animate-spin mx-auto" size={14} /> : "Update Food cart"}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.food}
                    onClick={async () => {
                      if (!result.foodAddressId) return;
                      setCartBusy("food");
                      const res = await fetch("/api/order/food", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirmed: true, addressId: result.foodAddressId }),
                      }).catch(() => null);
                      const body = await res?.json().catch(() => null);
                      setCartMsg(body?.message ?? "Order placed.");
                      setCartBusy(null);
                    }}
                    className="h-10 text-xs font-black bg-[#FC5523] text-white rounded-lg disabled:opacity-40"
                  >
                    Place Food order
                  </button>
                </div>
              </div>

              {/* INSTAMART SECTION */}
              <div className="rounded-2xl bg-white border border-[#EAE7E2] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0EDE8]">
                  <span className="text-xs font-bold tracking-[0.1em] uppercase text-[#5856D6]">🛒 Instamart Groceries</span>
                  <span className="text-xs font-bold text-[#5856D6]">Selected ₹{Math.round(selectedImTotal)}</span>
                </div>

                {result.instamartItems.length === 0 && (
                  <div className="p-8 text-center text-sm text-[#888]">
                    Connect Swiggy and add a saved address to get grocery picks.
                  </div>
                )}

                {result.instamartItems.map((item) => (
                  <InstamartCard
                    key={item.spinId}
                    item={item}
                    qty={imQty[item.spinId] ?? 0}
                    onChange={(q) => { setCartReady((c) => ({ ...c, instamart: false })); setImQty((s) => ({ ...s, [item.spinId]: q })); }}
                  />
                ))}

                <div className="p-3 border-t border-[#F0EDE8] grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={cartBusy !== null}
                    onClick={() => updateCart("instamart")}
                    className="h-10 text-xs font-black bg-[#5856D6] text-white rounded-lg disabled:opacity-40"
                  >
                    {cartBusy === "instamart" ? <Loader2 className="animate-spin mx-auto" size={14} /> : "Update Instamart cart"}
                  </button>
                  <button
                    type="button"
                    disabled={cartBusy !== null || !cartReady.instamart}
                    onClick={async () => {
                      if (!result.instamartAddressId) return;
                      setCartBusy("instamart");
                      const res = await fetch("/api/order/instamart", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ confirmed: true, addressId: result.instamartAddressId }),
                      }).catch(() => null);
                      const body = await res?.json().catch(() => null);
                      setCartMsg(body?.message ?? "Order placed.");
                      setCartBusy(null);
                    }}
                    className="h-10 text-xs font-black bg-[#FC5523] text-white rounded-lg disabled:opacity-40"
                  >
                    Place Instamart order
                  </button>
                </div>
              </div>
            </div>

            {/* SHARE CARD */}
            <div className="rounded-2xl bg-gradient-to-r from-[#064E3B] to-[#047857] p-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold text-[#6EE7B7] tracking-[0.15em] uppercase mb-1">✦ Shareable plan</p>
                <p className="text-lg font-black text-white">
                  BMI {result.bmiResult.bmi} · {bmiCategoryLabel(result.bmiResult.category)} · {GOAL_OPTIONS.find((g) => g.value === input.goal)?.label}
                </p>
                <p className="text-sm text-[#A7F3D0]">{result.bmiResult.targets.calories} cal/day · {result.bmiResult.targets.protein}g protein target</p>
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
                  href={`https://wa.me/?text=${encodeURIComponent("Check out my FitPlate plan: " + shareUrl())}`}
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

        {/* EMPTY STATE */}
        {!result && !loading && !error && (
          <div className="rounded-2xl bg-white border border-[#EAE7E2] p-12 flex flex-col items-center text-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-[#F0FFF8] flex items-center justify-center">
              <ShoppingBasket size={32} className="text-[#16A34A]" />
            </div>
            <div>
              <h2 className="text-2xl font-black mb-2">Enter your stats to get started</h2>
              <p className="text-sm text-[#6B7280] max-w-md">
                FitPlate will calculate your BMI, generate personalised search terms, and pull live Swiggy food and grocery picks matched to your calorie and macro targets.
              </p>
            </div>
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-white border border-[#EAE7E2] p-12 flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-[#86EFAC]" />
            <p className="text-sm font-semibold text-[#6B7280]">Calculating BMI → generating search terms → calling Swiggy MCP → ranking results…</p>
          </div>
        )}
      </div>
    </main>
  );
}

function computeClientBMI(height: number, weight: number) {
  const h = height / 100;
  return Math.round((weight / (h * h)) * 10) / 10;
}

function FoodCard({ item, qty, onChange }: { item: RankedFoodItem; qty: number; onChange: (q: number) => void }) {
  return (
    <div className="flex gap-3 px-4 py-3 border-b border-[#F5F3F0] last:border-0">
      <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#FFF5F0] to-[#FFE4D6] flex items-center justify-center text-2xl flex-shrink-0">
        {item.isVeg ? "🥗" : "🍗"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <div className={`w-3 h-3 rounded-sm border flex items-center justify-center flex-shrink-0 ${item.isVeg ? "border-[#2E7D32]" : "border-[#C62828]"}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? "bg-[#2E7D32]" : "bg-[#C62828]"}`} />
          </div>
          <span className="text-[10px] text-[#888]">{item.isVeg ? "Veg" : "Non-veg"}</span>
        </div>
        <p className="text-sm font-bold text-[#111] truncate">{item.name}</p>
        <p className="text-[11px] text-[#888] mb-1.5">{item.restaurantName}{item.rating ? ` · ★ ${item.rating}` : ""}</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {item.estimatedCalories > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#15803D]">{item.estimatedCalories} cal</span>
          )}
          {item.estimatedProtein > 0 && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8]">{item.estimatedProtein}g protein</span>
          )}
          {item.fitTag && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#FFF7ED] text-[#C2410C]">✓ {item.fitTag}</span>
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

function InstamartCard({ item, qty, onChange }: { item: RankedInstamartItem; qty: number; onChange: (q: number) => void }) {
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
        <p className="text-[10px] font-bold text-[#888] uppercase tracking-wide mb-0.5">{item.brand}</p>
        <p className="text-sm font-bold text-[#111] truncate">{item.name}</p>
        <p className="text-[11px] text-[#888] mb-1.5">{item.quantityDescription}</p>
        {item.fitTag && (
          <span className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#F0FDF4] text-[#15803D] mb-2">✓ {item.fitTag}</span>
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

function QtyControl({ qty, onChange, disabled, color }: { qty: number; onChange: (q: number) => void; disabled?: boolean; color: "orange" | "purple" }) {
  const isOrange = color === "orange";
  const borderText = isOrange ? "border-[#FC5523] text-[#FC5523]" : "border-[#5856D6] text-[#5856D6]";
  const hoverBg = isOrange ? "hover:bg-[#FC5523] hover:text-white" : "hover:bg-[#5856D6] hover:text-white";

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
      <button type="button" onClick={() => onChange(Math.max(0, qty - 1))} className={`px-2 py-1 ${borderText} ${hoverBg} transition-colors`}>
        <Minus size={12} />
      </button>
      <span className={`px-3 text-xs font-black ${isOrange ? "text-[#FC5523]" : "text-[#5856D6]"}`}>{qty}</span>
      <button type="button" disabled={disabled} onClick={() => onChange(qty + 1)} className={`px-2 py-1 ${borderText} ${hoverBg} transition-colors disabled:opacity-40`}>
        <Plus size={12} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/FitPlate.tsx
git commit -m "feat(ui): add FitPlate component with Swiggy-style food and instamart cards"
```

---

## Task 8: Update page.tsx and add bmiCategoryLabel/Emoji exports

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/lib/bmi.ts` (verify exports are present — they were added in Task 2)

- [ ] **Step 1: Replace page.tsx content**

```tsx
import { FitPlate } from "@/components/FitPlate";

export default function Home() {
  return <FitPlate />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire FitPlate as the root page"
```

---

## Task 9: Delete obsolete files

**Files:**
- Delete: `src/components/EveningPlanner.tsx`
- Delete: `src/app/api/plan/route.ts`
- Delete: `src/lib/planner.ts`

- [ ] **Step 1: Delete the files**

```bash
git rm src/components/EveningPlanner.tsx src/app/api/plan/route.ts src/lib/planner.ts
git commit -m "chore: remove EveningPlanner, /api/plan, and planner.ts — superseded by FitPlate"
```

---

## Task 10: Verify in browser

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000 with no TypeScript errors

- [ ] **Step 2: Check the input card**

Open http://localhost:3000. Verify:
- Dark input card renders with height/weight/age inputs, gender toggle, diet chips, goal grid
- BMI arc shows a value computed from defaults (170cm, 70kg → ~24.2)
- "Get my food plan" button is visible
- Swiggy connect button shows if not authenticated

- [ ] **Step 3: Connect Swiggy and submit**

Click "Connect Swiggy", complete OAuth, return to the page.
Enter your stats, click "Get my food plan".

Expected:
- Loading state shown ("Calculating BMI → generating search terms…")
- After 5-15 seconds: BMI ring updates, macro targets appear, food and instamart cards load
- Each food card has name, restaurant, calorie tag, protein tag, fitTag, price, ADD button
- Each instamart card has brand, name, discount badge, offer price, ADD button, fitTag

- [ ] **Step 4: Test add to cart**

Click ADD on a food item (qty becomes 1). Calorie tracker bar updates.
Click "Update Food cart". Confirm the cart message appears.

- [ ] **Step 5: Test share**

Click "Copy link". Paste into a new tab. Verify the form pre-fills and auto-submits with the shared stats.

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address any issues found during manual verification"
```
