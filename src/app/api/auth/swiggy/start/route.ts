import { NextResponse } from "next/server";
import { getOrigin, startSwiggyAuthorization } from "@/lib/swiggy-oauth";

export async function GET(request: Request) {
  try {
    const redirectTo = await startSwiggyAuthorization(getOrigin(request));
    return NextResponse.redirect(redirectTo);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to start Swiggy authorization.";
    return NextResponse.redirect(`${getOrigin(request)}/?swiggyError=${encodeURIComponent(message)}`);
  }
}
