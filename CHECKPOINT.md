# AgoraXchangeExperimental — Checkpoint (2026-09-05)

Local build of the Lumière MVP. The public showcase (`mdnr/LumireXchangeExperimental`, GitHub Pages)
stays untouched as a static demo. This repo is where the marketplace MVP is built: backend + DB +
auth + seller tools, ready to deploy to a free server later.

## What's done

- **Stack**: .NET 10 minimal API + EF Core 10 (SQLite) + ASP.NET Identity (JWT) + React 19 / Vite / TS.
- **Database**: `AgoraXchangeExperimental.Server/Data/` — `Models.cs`, `AppDbContext.cs`, `DbSeeder.cs`,
  initial EF migration in `Data/Migrations/`. SQLite file = `app.db` (gitignored, recreated by seeder).
- **Auth API** (`/api/auth`): `POST /register` (optional `role: "seller"`), `POST /login`,
  `GET /me`. JWT bearer; roles `Seller` / `User`.
- **Products API** (`/api/products`): `GET /` (filter `category`, sort `price-asc|price-desc|newest`,
  returns `{ products, categories }`), `GET /{slug}` (detail + related), `POST /` (seller),
  `PUT /{slug}` (seller/owner), `DELETE /{slug}` (seller/owner), `POST /{slug}/model` (GLB/glTF upload).
- **Seed data**: 4 Lumière products (Aurora headphones, Pulse watch, Echo speaker, Lumen lamp) + demo
  accounts:
  - Seller: `seller@lumiere.app` / `Seller123!`
  - Buyer: `buyer@lumiere.app` / `Buyer123!`
- Verified: server builds clean, runs, `GET /api/products` returns 4 products + 3 categories.

## Next up (frontend)

1. Add frontend deps: `react-router-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`.
2. API client + auth context (JWT in localStorage) + routing shell.
3. Pages: Home, Catalogue, Product detail (+ ported 3D `ProductViewer` from showcase patterns).
4. Login / Register; Seller dashboard (CRUD + GLB upload + material editor).
5. Vite proxy: add `/models` → server (uploaded/seed GLB files live in `Server/wwwroot/models/`).
6. Generate placeholder GLB models for the 4 seeds; user can drop real .glb files in later.
7. Verify: `dotnet build`, `npm run build`, `npm run lint`.

## How to run

- AppHost (Aspire): `dotnet run --project AgoraXchangeExperimental.AppHost` (launches server + Vite).
- Server alone: `dotnet run --project AgoraXchangeExperimental.Server` → http://localhost:5582 (`/api/products`).
- Frontend alone: `cd frontend && npm run dev` (proxies `/api` to the server).

## Notes

- JWT key is a dev-only key in `appsettings.Development.json` — rotate before any real deployment.
- No Docker needed (SQLite). Migrations in place, so switching to another host DB later is EF-walk-in.
- Plan source of truth: `PLAN.md` in the public `LumireXchangeExperimental` repo.