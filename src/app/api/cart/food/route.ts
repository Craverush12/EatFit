import { NextResponse } from "next/server";
import { callSwiggyTool } from "@/lib/swiggy-mcp";
import { getOrigin } from "@/lib/swiggy-oauth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.confirmed !== true) {
      return NextResponse.json({ ok: false, errors: ["Explicit confirmation is required before updating Food cart."] }, { status: 400 });
    }

    const { restaurantId, addressId, cartItems, restaurantName } = body;
    if (!restaurantId || !addressId || !Array.isArray(cartItems)) {
      return NextResponse.json({ ok: false, errors: ["restaurantId, addressId, and cartItems are required."] }, { status: 400 });
    }

    const update = await callSwiggyTool(
      "food",
      "update_food_cart",
      { restaurantId, addressId, cartItems, restaurantName },
      getOrigin(request),
    );
    const cart = await callSwiggyTool("food", "get_food_cart", { addressId }, getOrigin(request));
    return NextResponse.json({ ok: true, update, cart, message: "Food cart updated. Review the cart summary before placing the order." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Food cart.";
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}
