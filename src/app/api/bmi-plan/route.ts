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

    // Step 1: BMI math (pure, instant)
    const bmi = calculateBMI(weight, height);
    const category = getBMICategory(bmi);
    const bmr = computeBMR(weight, height, age, gender);
    const tdee = computeTDEE(bmr);
    const targetCalories = computeTargetCalories(tdee, goal);
    const targets = computeMacroTargets(targetCalories, weight, goal);
    const bmiResult = { bmi, category, tdee, targets };

    // Step 2: Groq generates search terms
    const searchTerms = await generateFoodSearchTerms(category, goal, diet);
    const vegFilter = diet === "veg" || diet === "vegan" ? 1 : 0;

    // Step 3: Get saved addresses from both servers in parallel
    const [foodAddresses, instamartAddresses] = await Promise.all([
      captureToolCall("food", "get_addresses", {}, origin),
      captureToolCall("instamart", "get_addresses", {}, origin),
    ]);

    const foodAddressId =
      foodAddresses.status === "ok" ? firstAddressId(foodAddresses.data) : undefined;
    const instamartAddressId =
      instamartAddresses.status === "ok" ? firstAddressId(instamartAddresses.data) : undefined;

    // Step 4: Search food + instamart in parallel across all queries
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

    // Step 5: Extract restaurant info for cart payload
    const restaurant = extractRestaurantFromSearches(foodSearchResults);
    const foodRestaurantId =
      restaurant?.id ??
      (() => {
        const first = foodSearchResults.find((r) => r.status === "ok");
        return first ? firstRestaurantId(first.data) : undefined;
      })();
    const foodRestaurantName = restaurant?.name;

    // Step 6: Parse raw MCP results into typed options
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

    // Step 7: Groq re-ranks by calorie/macro fit
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
      searchTerms: { food: searchTerms.foodQueries, grocery: searchTerms.groceryQueries },
      foodAddressId,
      instamartAddressId,
      foodRestaurantId,
      errors,
    } satisfies BMIPlanResponse);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        bmiResult: { bmi: 0, category: "normal", tdee: 0, targets: { calories: 0, protein: 0, fat: 0, carbs: 0 } },
        foodItems: [],
        instamartItems: [],
        searchTerms: { food: [], grocery: [] },
        errors: [err instanceof Error ? err.message : "Plan failed"],
      },
      { status: 500 },
    );
  }
}
