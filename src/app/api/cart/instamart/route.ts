import { NextResponse } from "next/server";
import { callSwiggyTool } from "@/lib/swiggy-mcp";
import { getOrigin } from "@/lib/swiggy-oauth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.confirmed !== true) {
      return NextResponse.json({ ok: false, errors: ["Explicit confirmation is required before updating Instamart cart."] }, { status: 400 });
    }

    const { selectedAddressId, items } = body;
    if (!selectedAddressId || !Array.isArray(items)) {
      return NextResponse.json({ ok: false, errors: ["selectedAddressId and items are required."] }, { status: 400 });
    }

    const update = await callSwiggyTool("instamart", "update_cart", { selectedAddressId, items }, getOrigin(request));
    const cart = await callSwiggyTool("instamart", "get_cart", { selectedAddressId }, getOrigin(request));
    return NextResponse.json({ ok: true, update, cart, message: "Instamart cart updated. Review the cart summary before checkout." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update Instamart cart.";
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}
