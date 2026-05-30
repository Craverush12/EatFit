import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { requireSwiggyAuth } from "@/lib/swiggy-oauth";
import type { ToolCallSnapshot } from "@/lib/types";

const SERVERS = {
  dineout: "https://mcp.swiggy.com/dineout",
  food: "https://mcp.swiggy.com/food",
  instamart: "https://mcp.swiggy.com/im",
} as const;

export type SwiggyServer = keyof typeof SERVERS;

export async function callSwiggyTool(
  server: SwiggyServer,
  tool: string,
  args: Record<string, unknown>,
  origin?: string,
) {
  const provider = requireSwiggyAuth(origin);
  const client = new Client({ name: "swiggy-evening-planner", version: "0.1.0" }, { capabilities: {} });
  const transport = new StreamableHTTPClientTransport(new URL(SERVERS[server]), { authProvider: provider });

  try {
    await client.connect(transport);
    return await client.callTool({ name: tool, arguments: args });
  } finally {
    await transport.close().catch(() => undefined);
  }
}

export async function captureToolCall(
  server: SwiggyServer,
  tool: string,
  args: Record<string, unknown>,
  origin?: string,
): Promise<ToolCallSnapshot> {
  try {
    const data = await callSwiggyTool(server, tool, args, origin);
    const toolError = getToolError(data);
    if (toolError) {
      return {
        server,
        tool,
        status: "error",
        summary: summarizeToolResult(data, tool),
        data,
        error: toolError,
      };
    }

    return {
      server,
      tool,
      status: "ok",
      summary: summarizeToolResult(data, tool),
      data,
    };
  } catch (error) {
    return {
      server,
      tool,
      status: "error",
      summary: "Tool call failed.",
      error: error instanceof Error ? error.message : "Unknown Swiggy tool error",
    };
  }
}

export function summarizeToolResult(value: unknown, tool?: string) {
  if (tool === "get_addresses" || tool === "get_saved_locations") {
    const count = countAddressLikeObjects(value);
    return count ? `${count} saved location${count === 1 ? "" : "s"} available.` : "No saved locations returned.";
  }

  const text = redactSensitiveText(collectText(value).join(" ").replace(/\s+/g, " ").trim());
  if (text) return text.slice(0, 900);

  const names = collectNamedObjects(value)
    .slice(0, 6)
    .map((item) => {
      const name = String(item.name || item.title || item.restaurantName || item.displayName || "Result");
      const meta = [item.rating, item.costForTwo, item.price, item.distance, item.displayTime]
        .filter(Boolean)
        .join(" | ");
      return meta ? `${name} (${meta})` : name;
    });

  return names.length ? names.join("; ") : redactSensitiveText(JSON.stringify(value)).slice(0, 900);
}

export function firstAddressId(value: unknown) {
  const match = collectNamedObjects(value).find((item) => item.addressId || item.id);
  return typeof match?.addressId === "string"
    ? match.addressId
    : typeof match?.id === "string"
      ? match.id
      : undefined;
}

export function firstRestaurantId(value: unknown) {
  const match = collectNamedObjects(value).find(
    (item) => item.restaurantId || item.id || item.restId || item.restaurant_id,
  );
  const id = match?.restaurantId || match?.restId || match?.restaurant_id || match?.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

function collectText(value: unknown, output: string[] = []): string[] {
  if (!value) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectText(entry, output));
    return output;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      output.push(record.text);
    }
    Object.values(record).forEach((entry) => collectText(entry, output));
  }
  return output;
}

function collectNamedObjects(value: unknown, output: Record<string, unknown>[] = []) {
  if (!value) return output;
  if (Array.isArray(value)) {
    value.forEach((entry) => collectNamedObjects(entry, output));
    return output;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      record.name ||
      record.title ||
      record.restaurantName ||
      record.displayName ||
      record.addressId ||
      record.restaurantId ||
      record.restId ||
      record.restaurant_id ||
      record.id
    ) {
      output.push(record);
    }
    Object.values(record).forEach((entry) => collectNamedObjects(entry, output));
  }
  return output;
}

function getToolError(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record.isError === true) {
    return summarizeToolResult(value) || "Swiggy tool returned an MCP error result.";
  }

  const structuredContent = record.structuredContent;
  if (structuredContent && typeof structuredContent === "object") {
    const structured = structuredContent as Record<string, unknown>;
    if (structured.success === false) {
      const error = structured.error;
      if (error && typeof error === "object" && typeof (error as Record<string, unknown>).message === "string") {
        return (error as Record<string, string>).message;
      }
      return "Swiggy tool returned success=false.";
    }
  }

  return undefined;
}

function countAddressLikeObjects(value: unknown) {
  return collectNamedObjects(value).filter((item) => item.addressLine || item.phoneNumber || item.addressCategory).length;
}

function redactSensitiveText(value: string) {
  return value
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "<email>")
    .replace(/(?:\+?91[-\s]?)?[6-9]\d{9}\b/g, "<phone>")
    .replace(/"phoneNumber"\s*:\s*"[^"]*"/gi, '"phoneNumber":"<phone>"')
    .replace(/"addressLine"\s*:\s*"[^"]*"/gi, '"addressLine":"<address>"');
}
