import { NextRequest, NextResponse } from "next/server";
import { captureToolCall } from "@/lib/swiggy-mcp";
import type { SwiggyAddress } from "@/lib/types";

type RawRecord = Record<string, unknown>;

function extractAddresses(data: unknown, server: SwiggyAddress["server"]): SwiggyAddress[] {
  if (!data || typeof data !== "object") return [];

  const addresses: SwiggyAddress[] = [];
  collectAddressObjects(data, addresses, server);
  return addresses;
}

function collectAddressObjects(
  value: unknown,
  output: SwiggyAddress[],
  server: SwiggyAddress["server"],
) {
  if (!value || typeof value !== "object") return;

  if (Array.isArray(value)) {
    value.forEach((v) => collectAddressObjects(v, output, server));
    return;
  }

  const rec = value as RawRecord;

  // An address object: must have an ID and some address text
  const id = str(rec.addressId) ?? str(rec.id);
  const addressLine =
    str(rec.addressLine) ??
    str(rec.flatNo) ??
    str(rec.landmark) ??
    str(rec.address);

  if (id && addressLine && !output.find((a) => a.id === id)) {
    const category = str(rec.addressCategory) ?? str(rec.tag) ?? str(rec.label) ?? "";
    output.push({
      id,
      label: toLabel(category),
      addressLine: redactPhone(addressLine),
      server,
    });
  }

  // Recurse into all child values
  Object.values(rec).forEach((v) => collectAddressObjects(v, output, server));
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function toLabel(raw: string): string {
  if (!raw) return "Saved address";
  const map: Record<string, string> = {
    HOME: "Home",
    WORK: "Work",
    OTHER: "Other",
    home: "Home",
    work: "Work",
    other: "Other",
  };
  return map[raw] ?? raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function redactPhone(text: string): string {
  return text.replace(/(?:\+?91[-\s]?)?[6-9]\d{9}/g, "***");
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") ?? req.nextUrl.origin;

  try {
    const [foodResult, instamartResult] = await Promise.all([
      captureToolCall("food", "get_addresses", {}, origin),
      captureToolCall("instamart", "get_addresses", {}, origin),
    ]);

    const foodAddresses =
      foodResult.status === "ok" ? extractAddresses(foodResult.data, "food") : [];
    const instamartAddresses =
      instamartResult.status === "ok"
        ? extractAddresses(instamartResult.data, "instamart")
        : [];

    return NextResponse.json({
      ok: true,
      food: foodAddresses,
      instamart: instamartAddresses,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, food: [], instamart: [], error: err instanceof Error ? err.message : "Failed" },
      { status: 500 },
    );
  }
}
