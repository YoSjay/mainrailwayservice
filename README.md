# SJTweaks Main API (Railway)

Standalone repo: deploy this folder as **one** Railway service + **a second** PostgreSQL database (profiles / app data — not password storage).

## What’s in here

- `server.js` — Express; public `POST /v1/signup` forwards to your **Auth** service
- `sql/001-main.sql` — run once on your Main Postgres
- `railway.toml` — Railway build/deploy + `/health`
- `.env.example` — copy to `.env` locally

## Quick start

1. Create a **new empty GitHub repo** (e.g. `sjtweaks-main-api`).
2. Copy **everything inside this folder** into that repo (this folder = repo root), **without** `node_modules`.
3. Deploy the **Auth** service first; note its public URL.
4. On Railway for **this** service: add **PostgreSQL** (separate from Auth DB), run `sql/001-main.sql`, set `AUTH_SERVICE_URL` to your Auth service URL, and **`INTERNAL_AUTH_KEY`** matching the Auth service.

Do not commit `.env`.
