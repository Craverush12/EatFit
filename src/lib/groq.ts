import Groq from "groq-sdk";
import type { EveningPlanInput, ToolCallSnapshot, EveningPlan } from "@/lib/types";
import type { BMICategory } from "@/lib/bmi";

type Strategy = {
  dineoutQuery: string;
  dineoutEntityType?: string;
  foodQueries: string[];
  groceryQueries: string[];
};

let groqClient: Groq | null = null;

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GROQ_API_KEY. Add it to .env.local and restart the dev server.");
  }

  if (!groqClient) {
    groqClient = new Groq({ apiKey });
  }

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

export async function createSearchStrategy(input: EveningPlanInput): Promise<Strategy> {
  const fallback: Strategy = {
    dineoutQuery: input.vibe || input.locality || "restaurants",
    dineoutEntityType: input.vibe ? "RESTAURANT_CATEGORY" : "locality",
    foodQueries: [input.diet === "veg" ? "veg dinner" : "biryani", "dessert"],
    groceryQueries: [input.snacks || "snacks", "beverages"],
  };

  const response = await getGroq().chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.25,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return only JSON. Convert a user evening plan request into concise Swiggy search terms. Do not invent private user data.",
      },
      {
        role: "user",
        content: JSON.stringify({
          schema: {
            dineoutQuery: "string",
            dineoutEntityType: "locality | CUISINE | RESTAURANT_CATEGORY | omitted",
            foodQueries: "string[] max 3",
            groceryQueries: "string[] max 3",
          },
          request: input,
        }),
      },
    ],
  });

  const parsed = safeJson<Partial<Strategy>>(response.choices[0]?.message?.content, fallback);

  return {
    dineoutQuery: parsed.dineoutQuery || fallback.dineoutQuery,
    dineoutEntityType: parsed.dineoutEntityType || fallback.dineoutEntityType,
    foodQueries: (parsed.foodQueries?.length ? parsed.foodQueries : fallback.foodQueries).slice(0, 3),
    groceryQueries: (parsed.groceryQueries?.length ? parsed.groceryQueries : fallback.groceryQueries).slice(0, 3),
  };
}

export async function rankPlansWithGroq(input: EveningPlanInput, toolCalls: ToolCallSnapshot[]) {
  const fallbackPlans = buildFallbackPlans(input, toolCalls);

  const response = await getGroq().chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "Return only JSON with a plans array. Build practical evening plans from Swiggy tool summaries. Never claim checkout, order placement, or table booking happened. Cart payloads must be omitted unless exact tool-ready payloads are present.",
      },
      {
        role: "user",
        content: JSON.stringify({
          schema: {
            plans: [
              {
                id: "string",
                title: "string",
                score: "number 0-100",
                vibeMatch: "string",
                estimatedCost: "string",
                distance: "string",
                timeline: "string[]",
                dineout: { restaurant: "string", slot: "string", offer: "string", why: "string" },
                food: { suggestion: "string", restaurant: "string", note: "string" },
                instamart: { suggestion: "string", note: "string" },
                cautions: "string[]",
              },
            ],
          },
          request: input,
          swiggyToolSummaries: toolCalls.map(({ server, tool, status, summary, error }) => ({
            server,
            tool,
            status,
            summary,
            error,
          })),
        }),
      },
    ],
  });

  const parsed = safeJson<{ plans?: EveningPlan[] }>(response.choices[0]?.message?.content, {
    plans: fallbackPlans,
  });

  return parsed.plans?.length ? parsed.plans.slice(0, 3) : fallbackPlans;
}

function buildFallbackPlans(input: EveningPlanInput, toolCalls: ToolCallSnapshot[]): EveningPlan[] {
  const dineout = toolCalls.find((call) => call.server === "dineout" && call.status === "ok");
  const food = toolCalls.find((call) => call.server === "food" && call.status === "ok");
  const instamart = toolCalls.find((call) => call.server === "instamart" && call.status === "ok");

  return [
    {
      id: "plan-1",
      title: `${input.vibe || "Curated"} evening near ${input.locality || input.city}`,
      score: 78,
      vibeMatch: "Built from available Swiggy search results and your constraints.",
      estimatedCost: input.budget || "Check live Swiggy pricing",
      distance: "Use the live Swiggy result distance before committing.",
      timeline: [
        `${input.timeWindow}: shortlist a Dineout option`,
        "Add a food backup only if the reservation plan changes",
        "Pick snacks or beverages for later from Instamart",
      ],
      dineout: {
        restaurant: dineout?.summary || "No Dineout result available yet",
        slot: "Review live available slots before booking.",
        offer: "Check returned offers in Swiggy.",
        why: "Matches the requested location and evening intent.",
      },
      food: {
        suggestion: food?.summary || "No Food result available yet",
        restaurant: "Confirm restaurant from live result.",
        note: "Food cart updates are disabled until you explicitly confirm.",
      },
      instamart: {
        suggestion: instamart?.summary || "No Instamart result available yet",
        note: "Instamart cart updates require a confirmed variant and quantity.",
      },
      cautions: ["No checkout, order, or table booking is performed in this v1 demo."],
    },
  ];
}

// ── FitPlate: BMI-based search term generation ──────────────────────────────

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
            "Return only JSON. Generate Swiggy search queries for food delivery and grocery delivery based on BMI category and health goal. Use real Indian dish and product names that appear on Swiggy.",
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
