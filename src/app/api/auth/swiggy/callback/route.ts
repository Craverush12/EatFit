import { NextResponse } from "next/server";
import { finishSwiggyAuthorization, getOrigin } from "@/lib/swiggy-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const origin = getOrigin(request);

  if (!code) {
    return NextResponse.redirect(`${origin}/?swiggyError=${encodeURIComponent("Missing Swiggy authorization code.")}`);
  }

  try {
    await finishSwiggyAuthorization(origin, code, state);
    return NextResponse.redirect(`${origin}/?swiggy=connected`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to finish Swiggy authorization.";
    return NextResponse.redirect(`${origin}/?swiggyError=${encodeURIComponent(message)}`);
  }
}
