import { NextResponse } from "next/server";
import { callSwiggyTool, summarizeToolResult } from "@/lib/swiggy-mcp";
import { getOrigin } from "@/lib/swiggy-oauth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (body?.confirmed !== true) {
      return NextResponse.json({ ok: false, errors: ["Explicit confirmation is required before placing an Instamart order."] }, { status: 400 });
    }

    const { addressId, paymentMethod } = body;
    if (!addressId) {
      return NextResponse.json({ ok: false, errors: ["addressId is required before Instamart checkout."] }, { status: 400 });
    }

    const origin = getOrigin(request);
    const cart = await callSwiggyTool("instamart", "get_cart", { addressId }, origin);
    const total = extractTotal(cart);
    if (Number.isFinite(total) && total >= 1000) {
      return NextResponse.json(
        { ok: false, cart, errors: ["Instamart Builders Club checkout must stay below Rs 1000. Reduce the cart or place this order in the Swiggy app."] },
        { status: 400 },
      );
    }

    const order = await callSwiggyTool(
      "instamart",
      "checkout",
      { addressId, ...(paymentMethod ? { paymentMethod } : {}) },
      origin,
    );

    return NextResponse.json({ ok: true, cart, order, message: summarizeToolResult(order) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to place Instamart order.";
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500 });
  }
}

function extractTotal(value: unknown) {
  const text = JSON.stringify(value);
  const match = text.match(/"(?:total|grandTotal|finalTotal|amount)"\s*:\s*"?([0-9]+(?:\.[0-9]+)?)/i);
  return match ? Number(match[1]) : Number.NaN;
}
