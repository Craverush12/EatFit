export type EveningPlanInput = {
  locality: string;
  city: string;
  latitude?: number;
  longitude?: number;
  date: string;
  timeWindow: string;
  guests: number;
  vibe: string;
  budget: string;
  diet: string;
  snacks: string;
};

export type ToolCallSnapshot = {
  server: "dineout" | "food" | "instamart";
  tool: string;
  status: "ok" | "error" | "skipped";
  summary: string;
  data?: unknown;
  error?: string;
};

export type EveningPlan = {
  id: string;
  title: string;
  score: number;
  vibeMatch: string;
  estimatedCost: string;
  distance: string;
  timeline: string[];
  dineout: {
    restaurant: string;
    slot: string;
    offer: string;
    why: string;
  };
  food: {
    suggestion: string;
    restaurant: string;
    note: string;
    cartPayload?: unknown;
  };
  instamart: {
    suggestion: string;
    note: string;
    cartPayload?: unknown;
  };
  cautions: string[];
};

export type FoodOption = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  addressId: string;
  name: string;
  price: number;
  rating?: string;
  totalRatings?: string;
  isVeg?: boolean;
  imageUrl?: string;
  inStock: boolean;
  hasVariants?: boolean;
  hasAddons?: boolean;
};

export type InstamartOption = {
  spinId: string;
  addressId: string;
  productId?: string;
  brand: string;
  name: string;
  quantityDescription: string;
  mrp: number;
  offerPrice: number;
  discount: number;
  imageUrl?: string;
  inStock: boolean;
  isPromoted: boolean;
};

export type CommerceOptions = {
  foodAddressId?: string;
  instamartAddressId?: string;
  foodRestaurantId?: string;
  foodRestaurantName?: string;
  foodOptions: FoodOption[];
  instamartOptions: InstamartOption[];
};

export type PlannerResponse = {
  ok: boolean;
  plans: EveningPlan[];
  commerce: CommerceOptions;
  strategy: {
    dineoutQuery: string;
    dineoutEntityType?: string;
    foodQueries: string[];
    groceryQueries: string[];
    coordinates: {
      latitude: number;
      longitude: number;
      label: string;
      source?: "detected" | "preset";
    };
    warnings?: string[];
  };
  toolCalls: ToolCallSnapshot[];
  errors: string[];
};

// ── FitPlate BMI types ──────────────────────────────────────────────────────

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
  estimatedCalories: number;   // per typical serving / per 100g as appropriate
  estimatedProtein: number;    // grams protein per serving
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
