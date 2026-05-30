import { firstAddressId, firstRestaurantId } from "@/lib/swiggy-mcp";
import type { CommerceOptions, FoodOption, InstamartOption, ToolCallSnapshot } from "@/lib/types";

type RecordValue = Record<string, unknown>;

export function buildCommerceOptions(toolCalls: ToolCallSnapshot[]): CommerceOptions {
  const foodAddresses = toolCalls.find((call) => call.server === "food" && call.tool === "get_addresses");
  const instamartAddresses = toolCalls.find((call) => call.server === "instamart" && call.tool === "get_addresses");
  const foodRestaurantSearch = toolCalls.find((call) => call.server === "food" && call.tool === "search_restaurants");
  const foodMenu = toolCalls.find((call) => call.server === "food" && call.tool === "search_menu");
  const instamartSearch = toolCalls.find((call) => call.server === "instamart" && call.tool === "search_products");

  const foodAddressId = foodAddresses?.status === "ok" ? firstAddressId(foodAddresses.data) : undefined;
  const instamartAddressId = instamartAddresses?.status === "ok" ? firstAddressId(instamartAddresses.data) : undefined;
  const restaurant = firstRestaurant(foodRestaurantSearch?.data);
  const foodRestaurantId = restaurant?.id || (foodRestaurantSearch?.status === "ok" ? firstRestaurantId(foodRestaurantSearch.data) : undefined);
  const foodRestaurantName = restaurant?.name;

  return {
    foodAddressId,
    instamartAddressId,
    foodRestaurantId,
    foodRestaurantName,
    foodOptions: extractFoodOptions(foodMenu?.data, foodAddressId, foodRestaurantId, foodRestaurantName),
    instamartOptions: extractInstamartOptions(instamartSearch?.data, instamartAddressId),
  };
}

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
    for (const item of extractFoodOptions(snap.data, addressId, restaurantId, restaurantName)) {
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
    for (const item of extractInstamartOptions(snap.data, addressId)) {
      if (!seen.has(item.spinId)) {
        seen.add(item.spinId);
        all.push(item);
      }
    }
  }
  return all.sort((a, b) => scoreInstamartOption(b) - scoreInstamartOption(a)).slice(0, 20);
}

export function extractRestaurantFromSearches(
  snapshots: ToolCallSnapshot[],
): { id: string; name: string } | undefined {
  for (const snap of snapshots) {
    if (snap.status !== "ok") continue;
    const restaurants = getStructured<RecordValue[]>(snap.data, "restaurants");
    const hit = restaurants.find(
      (r) => typeof r.id === "string" && typeof r.name === "string",
    );
    if (hit) return { id: String(hit.id), name: String(hit.name) };
  }
  return undefined;
}

function extractFoodOptions(
  value: unknown,
  addressId?: string,
  restaurantId?: string,
  restaurantName?: string,
): FoodOption[] {
  if (!addressId || !restaurantId) return [];
  const items = getStructured<RecordValue[]>(value, "items");

  return items
    .map((item): FoodOption | undefined => {
      const id = stringValue(item.menu_item_id) || stringValue(item.id);
      const name = stringValue(item.name);
      const price = numberValue(item.price);
      if (!id || !name || !Number.isFinite(price)) return undefined;

      return {
        id,
        restaurantId,
        restaurantName: restaurantName || "Selected restaurant",
        addressId,
        name,
        price,
        rating: stringValue(item.rating),
        totalRatings: stringValue(item.totalRatings),
        isVeg: booleanValue(item.isVeg),
        imageUrl: stringValue(item.imageUrl),
        inStock: numberValue(item.inStock) !== 0,
        hasVariants: booleanValue(item.hasVariants),
        hasAddons: booleanValue(item.hasAddons),
      };
    })
    .filter((option): option is FoodOption => Boolean(option))
    .sort((a, b) => scoreFoodOption(b) - scoreFoodOption(a))
    .slice(0, 10);
}

function extractInstamartOptions(value: unknown, addressId?: string): InstamartOption[] {
  if (!addressId) return [];
  const products = getStructured<RecordValue[]>(value, "products");
  const options = products.flatMap((product) => {
    const variations = Array.isArray(product.variations) ? (product.variations as RecordValue[]) : [];
    return variations.map((variation): InstamartOption | undefined => {
      const spinId = stringValue(variation.spinId);
      const name = stringValue(variation.displayName) || stringValue(product.displayName);
      const brand = stringValue(variation.brandName) || stringValue(product.brand) || "Instamart";
      const quantityDescription = stringValue(variation.quantityDescription) || "1 item";
      const price = objectValue(variation.price);
      const mrp = numberValue(price?.mrp);
      const offerPrice = numberValue(price?.offerPrice);
      if (!spinId || !name || !Number.isFinite(offerPrice)) return undefined;

      return {
        spinId,
        addressId,
        productId: stringValue(product.productId),
        brand,
        name,
        quantityDescription,
        mrp: Number.isFinite(mrp) ? mrp : offerPrice,
        offerPrice,
        discount: Math.max(0, (Number.isFinite(mrp) ? mrp : offerPrice) - offerPrice),
        imageUrl: stringValue(variation.imageUrl),
        inStock: booleanValue(variation.isInStockAndAvailable) !== false,
        isPromoted: booleanValue(product.isPromoted) === true,
      };
    });
  });

  return options
    .filter((option): option is InstamartOption => Boolean(option))
    .sort((a, b) => scoreInstamartOption(b) - scoreInstamartOption(a))
    .slice(0, 16);
}

function firstRestaurant(value: unknown) {
  const restaurants = getStructured<RecordValue[]>(value, "restaurants");
  const restaurant = restaurants.find((entry) => stringValue(entry.id) && stringValue(entry.name));
  if (!restaurant) return undefined;
  return {
    id: stringValue(restaurant.id),
    name: stringValue(restaurant.name),
  };
}

function getStructured<T>(value: unknown, key: string): T {
  const record = objectValue(value);
  const structured = objectValue(record?.structuredContent);
  const direct = structured?.[key];
  if (Array.isArray(direct)) return direct as T;
  return [] as T;
}

function scoreFoodOption(option: FoodOption) {
  const rating = Number(option.rating || 0);
  const priceScore = Math.max(0, 500 - option.price) / 100;
  return (option.inStock ? 10 : 0) + rating + priceScore + (option.isVeg ? 0.2 : 0);
}

function scoreInstamartOption(option: InstamartOption) {
  const discountPct = option.mrp > 0 ? (option.discount / option.mrp) * 100 : 0;
  const priceScore = Math.max(0, 300 - option.offerPrice) / 100;
  return (option.inStock ? 10 : 0) + discountPct + priceScore - (option.isPromoted ? 2 : 0);
}

function objectValue(value: unknown) {
  return value && typeof value === "object" ? (value as RecordValue) : undefined;
}

function stringValue(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.replace(/[^\d.]/g, ""));
  return Number.NaN;
}

function booleanValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}
