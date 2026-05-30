import { NextResponse } from "next/server";
import { getSwiggyAuthStatus } from "@/lib/swiggy-oauth";

export async function GET() {
  return NextResponse.json({
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    swiggy: getSwiggyAuthStatus(),
  });
}
