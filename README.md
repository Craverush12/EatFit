# Swiggy AI Evening Planner

A local Next.js demo that uses Groq for intent/ranking and Swiggy Builders Club MCP tools for Dineout, Food, and Instamart planning.

## Setup

```bash
cp .env.example .env.local
```

Add `GROQ_API_KEY` to `.env.local`.

## Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect Swiggy**, finish the OAuth/OTP flow, then build an evening plan.

## Safety

- Discovery tools run automatically after authorization.
- Food and Instamart cart updates require explicit confirmation.
- Checkout, order placement, and Dineout booking are intentionally not implemented in v1.

## API Routes

- `GET /api/auth/swiggy/start`
- `GET /api/auth/swiggy/callback`
- `GET|POST /api/auth/swiggy/logout`
- `GET /api/status`
- `POST /api/plan`
- `POST /api/cart/food`
- `POST /api/cart/instamart`

Swiggy access tokens are stored in server memory for local development and are lost when the dev server restarts.

## Local Verification

These checks should pass before testing with live credentials:

```bash
npm run lint
npm run build
```

Expected setup state before credentials are added:

- `GET /api/status` returns `groqConfigured: false` until `.env.local` contains `GROQ_API_KEY`.
- `POST /api/plan` returns a clear setup error until Groq is configured and Swiggy OAuth is complete.
- `GET /api/auth/swiggy/start` redirects to Swiggy's OAuth consent/login page.

After adding `GROQ_API_KEY`, restart the dev server so Next.js reloads `.env.local`.
