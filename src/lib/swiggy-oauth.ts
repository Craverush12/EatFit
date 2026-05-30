import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { createHash, randomBytes } from "node:crypto";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

type OAuthStore = {
  origin?: string;
  state?: string;
  codeVerifier?: string;
  authorizationUrl?: string;
  clientInformation?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
};

const SWIGGY_AUTH_BASE = "https://mcp.swiggy.com";
const SWIGGY_SCOPE = "mcp:tools mcp:resources mcp:prompts";

function getStore() {
  const holder = globalThis as typeof globalThis & { __swiggyOAuthStore?: OAuthStore };
  if (!holder.__swiggyOAuthStore) {
    holder.__swiggyOAuthStore = {};
  }
  return holder.__swiggyOAuthStore;
}

export function getOrigin(request: Request) {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }

  const url = new URL(request.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "::1") {
    return `http://localhost${url.port ? `:${url.port}` : ""}`;
  }

  return url.origin;
}

export function getSwiggyAuthStatus() {
  const store = getStore();
  return {
    connected: Boolean(store.tokens?.access_token),
    hasPendingAuthorization: Boolean(store.authorizationUrl),
  };
}

export function clearSwiggyTokens() {
  const store = getStore();
  store.state = undefined;
  store.codeVerifier = undefined;
  store.tokens = undefined;
  store.authorizationUrl = undefined;
}

class LocalSwiggyOAuthProvider implements OAuthClientProvider {
  private readonly store = getStore();
  private readonly redirect: string;

  constructor(origin: string) {
    this.store.origin = origin;
    this.redirect = `${origin}/api/auth/swiggy/callback`;
  }

  get redirectUrl() {
    return this.redirect;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "Swiggy AI Evening Planner",
      redirect_uris: [this.redirect],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SWIGGY_SCOPE,
    };
  }

  state() {
    if (!this.store.state) {
      this.store.state = crypto.randomUUID();
    }
    return this.store.state;
  }

  clientInformation() {
    return this.store.clientInformation;
  }

  saveClientInformation(clientInformation: OAuthClientInformationMixed) {
    this.store.clientInformation = clientInformation;
  }

  tokens() {
    return this.store.tokens;
  }

  saveTokens(tokens: OAuthTokens) {
    this.store.tokens = tokens;
    this.store.authorizationUrl = undefined;
  }

  redirectToAuthorization(authorizationUrl: URL) {
    this.store.authorizationUrl = authorizationUrl.toString();
  }

  saveCodeVerifier(codeVerifier: string) {
    this.store.codeVerifier = codeVerifier;
  }

  codeVerifier() {
    if (!this.store.codeVerifier) {
      throw new Error("Swiggy OAuth code verifier is missing. Start authorization again.");
    }
    return this.store.codeVerifier;
  }

  invalidateCredentials(scope: "all" | "client" | "tokens" | "verifier" | "discovery") {
    if (scope === "all" || scope === "client") this.store.clientInformation = undefined;
    if (scope === "all" || scope === "tokens") this.store.tokens = undefined;
    if (scope === "all" || scope === "verifier") this.store.codeVerifier = undefined;
  }
}

export function requireSwiggyAuth(origin?: string) {
  const store = getStore();
  if (!store.tokens?.access_token) {
    throw new Error("Swiggy is not connected. Use Connect Swiggy first, then retry.");
  }
  return new LocalSwiggyOAuthProvider(origin || store.origin || "http://localhost:3000");
}

export async function startSwiggyAuthorization(origin: string) {
  const store = getStore();
  const state = crypto.randomUUID();
  store.state = state;
  store.authorizationUrl = undefined;
  store.origin = origin;

  const provider = new LocalSwiggyOAuthProvider(origin);
  const clientInformation = await ensureClientInformation(provider);
  const clientId = getClientId(clientInformation);
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  provider.saveCodeVerifier(codeVerifier);

  const authorizeUrl = new URL("/auth/authorize", SWIGGY_AUTH_BASE);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", provider.redirectUrl.toString());
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("scope", SWIGGY_SCOPE);

  store.authorizationUrl = authorizeUrl.toString();
  return store.authorizationUrl;
}

export async function finishSwiggyAuthorization(origin: string, code: string, state?: string | null) {
  const store = getStore();
  if (store.state && state && store.state !== state) {
    throw new Error("Swiggy OAuth state mismatch. Start authorization again.");
  }

  const provider = new LocalSwiggyOAuthProvider(origin);
  await ensureClientInformation(provider);
  const response = await fetchWithTimeout(`${SWIGGY_AUTH_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      code_verifier: provider.codeVerifier(),
      redirect_uri: provider.redirectUrl.toString(),
    }),
  });

  if (!response.ok) {
    throw new Error(`Swiggy token exchange failed with HTTP ${response.status}.`);
  }

  const tokens = (await response.json()) as OAuthTokens;
  provider.saveTokens(tokens);
  store.state = undefined;
}

async function ensureClientInformation(provider: LocalSwiggyOAuthProvider) {
  const existing = provider.clientInformation();
  if (existing && getClientId(existing)) {
    return existing;
  }

  const response = await fetchWithTimeout(`${SWIGGY_AUTH_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(provider.clientMetadata),
  });

  if (!response.ok) {
    throw new Error(`Swiggy dynamic client registration failed with HTTP ${response.status}.`);
  }

  const clientInformation = (await response.json()) as OAuthClientInformationMixed;
  provider.saveClientInformation(clientInformation);
  return clientInformation;
}

function getClientId(clientInformation: OAuthClientInformationMixed) {
  const clientId = (clientInformation as { client_id?: unknown }).client_id;
  if (typeof clientId !== "string" || !clientId) {
    throw new Error("Swiggy did not return a client_id during OAuth registration.");
  }
  return clientId;
}

function fetchWithTimeout(url: string, init: RequestInit) {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(15000),
  });
}
