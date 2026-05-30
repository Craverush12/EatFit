# FitPlate — BMI-based Food & Grocery Planner

**Date:** 2026-05-31  
**Status:** Approved for implementation

---

## Summary

Replace the existing Swiggy AI Evening Planner with FitPlate — a BMI-driven food and grocery recommender. The user enters height, weight, age, gender, diet preference, and a health goal. The app calculates BMI and macro targets, uses Groq to generate Swiggy-optimised search terms, calls the Swiggy Food and Instamart MCP servers in parallel, then uses Groq again to re-rank and tag results by calorie/macro fit. Users can add recommended items directly to their Swiggy Food and Instamart carts.

---

## Product Goals

- **Useful:** Real, personalized food recommendations based on actual BMI math and live Swiggy inventory
- **Viral:** Shareable plan card (WhatsApp / copy link / save as image) with BMI score and goal
- **High-converting:** Swiggy-style item cards with one-tap ADD → existing cart flow; calorie tracker shows progress as items are added

---

## What Is Kept

| File | Kept as-is | Reason |
|------|-----------|--------|
| `src/lib/swiggy-oauth.ts` | ✓ | OAuth flow unchanged |
| `src/app/api/auth/swiggy/*` | ✓ | Auth routes unchanged |
| `src/app/api/cart/food/route.ts` | ✓ | Cart API unchanged |
| `src/app/api/cart/instamart/route.ts` | ✓ | Cart API unchanged |
| `src/app/api/order/food/route.ts` | ✓ | Order API unchanged |
| `src/app/api/order/instamart/route.ts` | ✓ | Order API unchanged |
| `src/app/api/status/route.ts` | ✓ | Status check unchanged |
| `src/lib/swiggy-mcp.ts` | ✓ | MCP client unchanged |
| `src/lib/geo.ts` | ✓ | Geo utils may be reused |

---

## What Is Replaced / Added

| File | Action | Description |
|------|--------|-------------|
| `src/lib/types.ts` | Extend | Add BMI types alongside existing types |
| `src/lib/groq.ts` | Extend | Add `generateFoodSearchTerms()` only |
| `src/lib/bmi.ts` | New | BMI calc, TDEE, macro math, search query builder |
| `src/lib/food-ranker.ts` | New | `rankFoodItems()` + `rankInstamartItems()` — Groq re-ranking, calorie tagging |
| `src/app/api/bmi-plan/route.ts` | New | Orchestration route (replaces /api/plan) |
| `src/components/FitPlate.tsx` | New | Full UI component (replaces EveningPlanner) |
| `src/app/page.tsx` | Update | Import FitPlate instead of EveningPlanner |
| `src/components/EveningPlanner.tsx` | Delete | Superseded by FitPlate |
| `src/app/api/plan/route.ts` | Delete | Superseded by /api/bmi-plan |
| `src/lib/planner.ts` | Delete | Logic replaced by bmi.ts + food-ranker.ts |
| `src/lib/commerce.ts` | Delete | Commerce parsing inlined into bmi-plan route |

---

## User Flow

1. User lands on the page — sees the dark input card with Swiggy connection status
2. Enters: height (cm), weight (kg), age (years), gender (male/female), diet (veg/non-veg/vegan), goal (lose weight / eat healthier / gain muscle / maintain)
3. Clicks "Calculate BMI & get my food plan"
4. BMI ring + macro targets appear immediately (client-side math, instant)
5. Swiggy Food picks and Instamart picks load (server call in progress — skeleton loaders shown)
6. User browses items, filters by meal time tab (All / Breakfast / Lunch / Dinner / Snacks)
7. Clicks ADD on items — calorie tracker bar updates
8. Clicks "Update Food cart" or "Update Instamart cart" — hits existing cart routes
9. Clicks "Share" — generates a shareable card with BMI + goal + selected picks

---

## API Route: POST /api/bmi-plan

**Request body:**
```ts
{
  height: number        // cm
  weight: number        // kg
  age: number           // years
  gender: 'male' | 'female'
  diet: 'veg' | 'non-veg' | 'vegan'
  goal: 'lose' | 'healthy' | 'muscle' | 'maintain'
}
```

**Server steps (in order):**
1. `calculateBMI(height, weight)` — pure math
2. `computeTargets(bmi, weight, height, age, gender, goal)` — TDEE + macros
3. `generateFoodSearchTerms(bmiCategory, goal, diet)` — Groq call → `{ foodQueries: string[], groceryQueries: string[] }`
4. Parallel MCP calls:
   - `food.get_addresses()` → extract `foodAddressId`
   - `instamart.get_addresses()` → extract `instamartAddressId`
5. Parallel MCP calls (once address IDs are available):
   - `food.search_menu(addressId, query, vegFilter)` for each of 3 food queries
   - `instamart.search_products(addressId, query)` for each of 3 grocery queries
6. `rankFoodItems(rawFoodResults, targets)` — Groq re-ranks, tags, filters food items
7. `rankInstamartItems(rawInstamartResults, targets)` — Groq re-ranks, tags grocery items
8. Return `BMIPlanResponse`

**Response:**
```ts
{
  ok: boolean
  bmiResult: BMIResult
  foodItems: RankedFoodItem[]        // top 6, tagged and calorie-filtered
  instamartItems: RankedInstamartItem[]  // top 6, tagged
  searchTerms: { food: string[], grocery: string[] }
  foodAddressId?: string
  instamartAddressId?: string
  foodRestaurantId?: string
  errors: string[]
}
```

---

## BMI & Macro Math (`src/lib/bmi.ts`)

**BMI:**
```
BMI = weight_kg / (height_m)²
```

**Categories:**
- < 18.5 → underweight
- 18.5–24.9 → normal
- 25–29.9 → overweight
- ≥ 30 → obese

**TDEE (Mifflin-St Jeor × 1.375):**
- Male BMR: `10 × weight + 6.25 × height_cm − 5 × age + 5`
- Female BMR: `10 × weight + 6.25 × height_cm − 5 × age − 161`
- TDEE = BMR × 1.375

**Goal calorie adjustments:**
| Goal | Adjustment |
|------|-----------|
| lose | TDEE − 500 |
| healthy | TDEE |
| muscle | TDEE + 300 |
| maintain | TDEE |

**Macro targets:**
- Protein: 1.6 g/kg for muscle goal, 1.2 g/kg for all others
- Fat: 28% of target calories ÷ 9
- Carbs: (target calories − protein×4 − fat×9) ÷ 4

**Search query builder:**
- Inputs: BMI category, goal, diet
- Outputs: 3 food queries + 3 grocery queries
- Passed to Groq which returns specific search strings optimised for Swiggy inventory

---

## Groq Integration (`src/lib/groq.ts` additions)

### `generateFoodSearchTerms(category, goal, diet)`
- Single Groq call (JSON mode)
- Returns `{ foodQueries: string[3], groceryQueries: string[3] }`
- Prompt instructs Groq to return terms that match real Swiggy menu items (e.g., "grilled chicken" not "lean poultry protein")

### `generateFoodSearchTerms(category, goal, diet)` — stays in `groq.ts`
- Single Groq call (JSON mode)
- Returns `{ foodQueries: string[3], groceryQueries: string[3] }`
- Prompt instructs Groq to return terms that match real Swiggy menu items (e.g., "grilled chicken" not "lean poultry protein")

---

## Food Ranker (`src/lib/food-ranker.ts`)

Uses Groq client directly (same pattern as `groq.ts`).

### `rankFoodItems(rawItems, targets)`
- Groq receives: list of raw Swiggy food items (name, restaurant, price, rating) + MacroTargets
- Returns: items re-ordered + each tagged with `{ estimatedCalories, estimatedProtein, fitTag, fitReason, mealTime }`
- `fitTag` values: "Low carb" | "High protein" | "Balanced" | "Calorie dense" | "Light meal"
- `mealTime` values: "breakfast" | "lunch" | "dinner" | "snack" (used by meal tab filter on client)
- Items Groq estimates at more than 2× the per-meal calorie target (target calories ÷ 3) are dropped

### `rankInstamartItems(rawItems, targets)`
- Same Groq pattern
- Returns items tagged with `{ fitTag, healthBenefit }`
- `fitTag` values: "Zero sugar" | "High fibre" | "High protein" | "Low GI" | "Probiotic"
- `healthBenefit` — one plain-English sentence on why this item fits the user's goal

---

## UI Components (`src/components/FitPlate.tsx`)

### Input card (dark, full-width)
- Stat inputs: height, weight, age (large number display, editable)
- Gender toggle: Male / Female
- Diet chips: Veg / Non-Veg / Vegan
- Goal grid (2×2): Lose weight / Eat healthier / Gain muscle / Maintain — each with icon + sub-label
- CTA: "Calculate BMI & get my food plan →"
- Right side: BMI arc ring + macro target bars (shown after first submission, or with example values)

### Calorie tracker bar (shown after results load)
- Daily target | Selected so far | Remaining
- Progress bar (green gradient)
- Updates in real-time as user clicks ADD

### Meal time tabs
- All / Breakfast / Lunch / Dinner / Snacks
- Client-side filter on `fitTag` / meal category returned from Groq

### Swiggy Food cards
- Veg/non-veg indicator dot (green square / red square — matches Swiggy's exact icon)
- Item name, restaurant name, delivery time, star rating
- Tags: calorie estimate, protein estimate, fit tag
- Price + orange ADD button (matches Swiggy's UI language)

### Instamart cards
- Brand name (small, uppercase), product name, quantity description
- Discount badge (green, top-right of image)
- MRP strikethrough + offer price
- Health benefit tag (e.g., "✓ High protein")
- Purple ADD button (matches Instamart's UI language)

### Share card
- Shows: BMI number, category, goal, calorie target, selected item count
- Buttons: Share on WhatsApp | Copy link | Save as image
- Share URL encodes BMI input fields as query params: `/?h=172&w=78&age=26&g=male&diet=veg&goal=healthy` — opening it pre-fills the form and auto-submits so the recipient sees the same plan. No server state required.

### Connection status
- Reuses existing status API — shows "Connect Swiggy" prompt if not authenticated
- If not connected, app still shows BMI result + macro targets; food/instamart picks are disabled with a "Connect Swiggy to load live picks" overlay

---

## Types (`src/lib/types.ts` additions)

```ts
type BMIInput = {
  height: number
  weight: number
  age: number
  gender: 'male' | 'female'
  diet: 'veg' | 'non-veg' | 'vegan'
  goal: 'lose' | 'healthy' | 'muscle' | 'maintain'
}

type BMIResult = {
  bmi: number
  category: 'underweight' | 'normal' | 'overweight' | 'obese'
  tdee: number
  targets: MacroTargets
}

type MacroTargets = {
  calories: number
  protein: number
  fat: number
  carbs: number
}

type RankedFoodItem = FoodOption & {
  estimatedCalories: number
  estimatedProtein: number
  fitTag: string
  fitReason: string
  mealTime?: 'breakfast' | 'lunch' | 'dinner' | 'snack'
}

type RankedInstamartItem = InstamartOption & {
  fitTag: string
  healthBenefit: string
}

type BMIPlanResponse = {
  ok: boolean
  bmiResult: BMIResult
  foodItems: RankedFoodItem[]
  instamartItems: RankedInstamartItem[]
  searchTerms: { food: string[]; grocery: string[] }
  foodAddressId?: string
  instamartAddressId?: string
  foodRestaurantId?: string
  errors: string[]
}
```

---

## Error Handling

- If Swiggy is not connected: return BMI result + targets, set `foodItems: []` and `instamartItems: []`, include error message "Connect Swiggy to load food picks"
- If MCP calls fail: return whatever succeeded; Groq ranking skips empty result sets
- If Groq fails on search term generation: fall back to hardcoded queries per BMI category + goal (defined in `bmi.ts`)
- If Groq fails on ranking: return raw Swiggy results untagged, without calorie estimates

---

## Out of Scope

- Meal planning across multiple days
- Calorie history / tracking over time
- User accounts beyond Swiggy OAuth
- Nutrition database lookups (calorie estimates come from Groq inference on item names)
- Dineout integration (removed entirely in this version)
