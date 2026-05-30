import { NextResponse } from "next/server";
import { clearSwiggyTokens, getOrigin } from "@/lib/swiggy-oauth";

export async function POST() {
  clearSwiggyTokens();
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  clearSwiggyTokens();
  return NextResponse.redirect(getOrigin(request));
}
