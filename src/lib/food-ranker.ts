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
  estimatedCalories: number;
  estimatedProtein: number;
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
                  estimatedCalories: "number — calories per typical single serving (e.g. 30g of muesli, 1 cup of oats, 1 protein bar). Use 0 if truly unknown.",
                  estimatedProtein: "number — grams of protein per that same serving. Use 0 if unknown.",
                },
              ],
            },
            calorieTarget: targets.calories,
            proteinTarget: targets.protein,
            items: simplified,
            instruction: "Estimate nutritional values for one typical serving of the product, not the entire package.",
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
        estimatedCalories: r.estimatedCalories ?? 0,
        estimatedProtein: r.estimatedProtein ?? 0,
      }));
  } catch {
    return rawItems.slice(0, 8).map((item) => ({
      ...item,
      fitTag: "Healthy",
      healthBenefit: "",
      estimatedCalories: 0,
      estimatedProtein: 0,
    }));
  }
}
