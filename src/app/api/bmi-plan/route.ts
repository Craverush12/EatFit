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

    // Step 3: Use pre-selected address IDs from the request, or fall back to fetching
    let foodAddressId: string | undefined = body.foodAddressId;
    let instamartAddressId: string | undefined = body.instamartAddressId;

    if (!foodAddressId || !instamartAddressId) {
      const [foodAddresses, instamartAddresses] = await Promise.all([
        !foodAddressId ? captureToolCall("food", "get_addresses", {}, origin) : Promise.resolve(null),
        !instamartAddressId ? captureToolCall("instamart", "get_addresses", {}, origin) : Promise.resolve(null),
      ]);
      if (!foodAddressId && foodAddresses?.status === "ok") {
        foodAddressId = firstAddressId(foodAddresses.data);
      }
      if (!instamartAddressId && instamartAddresses?.status === "ok") {
        instamartAddressId = firstAddressId(instamartAddresses.data);
      }
    }

    // Step 4: Get a restaurant ID via search_restaurants (required for cart)
    // then run all menu + grocery searches in parallel
    const foodRestaurantSearch = foodAddressId
      ? await captureToolCall(
          "food",
          "search_restaurants",
          { addressId: foodAddressId, query: searchTerms.foodQueries[0] ?? "healthy food" },
          origin,
        )
      : null;

    const foodRestaurantId = foodRestaurantSearch?.status === "ok"
      ? firstRestaurantId(foodRestaurantSearch.data)
      : undefined;

    // Extract restaurant name from the search result
    const foodRestaurantName = (() => {
      if (!foodRestaurantSearch?.data) return undefined;
      const data = foodRestaurantSearch.data as Record<string, unknown>;
      const sc = data.structuredContent as Record<string, unknown> | undefined;
      const restaurants = sc?.restaurants;
      if (Array.isArray(restaurants) && restaurants.length > 0) {
        const first = restaurants[0] as Record<string, unknown>;
        return typeof first.name === "string" ? first.name : undefined;
      }
      return undefined;
    })();

    // Step 5: Search food menus + instamart in parallel
    const [foodSearchResults, instamartSearchResults] = await Promise.all([
      foodAddressId
        ? Promise.all(
            searchTerms.foodQueries.map((q) =>
              captureToolCall(
                "food",
                "search_menu",
                {
                  addressId: foodAddressId,
                  query: q,
                  vegFilter,
                  ...(foodRestaurantId ? { restaurantIdOfAddedItem: foodRestaurantId } : {}),
                },
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
