# AgoraXchangeExperimental — Checkpoint (2026-09-06)

Local build of the Lumière MVP. The public showcase (`mdnr/LumireXchangeExperimental`, GitHub Pages)
stays untouched as a static demo. This repo is where the marketplace MVP is built: backend + DB +
auth + seller tools, ready to deploy to a free server later.

## What's done

- **Stack**: .NET 10 minimal API + EF Core 10 (SQLite) + ASP.NET Identity (JWT) + React 19 / Vite / TS
  + react-router + @react-three/fiber/drei (Three.js) + react-router-dom.
- **Database**: `AgoraXchangeExperimental.Server/Data/` — `Models.cs`, `AppDbContext.cs`, `DbSeeder.cs`,
  initial EF migration. SQLite file = `app.db` (gitignored, recreated by seeder).
- **Auth API** (`/api/auth`): `POST /register` (optional `role: "seller"`), `POST /login`,
  `GET /me`. JWT bearer; roles `Seller` / `User`.
- **Products API** (`/api/products`): `GET /` (filter `category`, sort `price-asc|price-desc|newest`,
  returns `{ products, categories }`), `GET /{slug}` (detail + related), `POST /` (seller),
  `PUT /{slug}` (seller/owner), `DELETE /{slug}` (seller/owner), `POST /{slug}/model` (GLB/glTF upload).
- **Static models**: `Program.cs` now serves `wwwroot/` with explicit `.glb`/`.gltf` content types.
  Placeholder GLBs for the 4 seeds live in `Server/wwwroot/models/` (regenerate via
  `node frontend/scripts/generate-placeholder-glb.mjs`).
- **Frontend** (`frontend/src/`):
  - `lib/` — types (DTO-mirroring), API client with bearer-token injection, `AuthProvider` context
    (JWT in localStorage), price formatting.
  - `components/` — `Navbar`, `Footer`, `ProductCard`, `ProductViewer` (R3F canvas: GLB load or
    category-matched placeholder, live material overrides, offline env lighting), `MaterialEditor`,
    `RequireSeller` route guard.
  - `pages/` — `HomePage` (hero, featured, categories, features), `CataloguePage` (category chips +
    sort), `ProductDetailPage` (3D/photos tabs, specs, highlights, related), `LoginPage`,
    `RegisterPage` (buyer/seller role picker), `SellerDashboardPage` (own listings CRUD + delete
    confirm), `ProductFormPage` (create/edit: basics, media URLs, specs, highlights, live material
    editor + 3D preview, GLB upload) + 404.
  - Router shell in `App.tsx`, `<BrowserRouter>` + `<AuthProvider>` in `main.tsx`.
  - `vite.config.ts` proxies `/api` and `/models` -> server (falls back to `http://localhost:5582`).
- **Seed data**: 4 Lumière products + demo accounts:
  - Seller: `seller@lumiere.app` / `Seller123!`
  - Buyer: `buyer@lumiere.app` / `Buyer123!`
- **Verified**: `dotnet build` clean; `npm run build` clean (three.js split into a lazy-loaded chunk);
  `npm run lint` clean; live smoke test: list/login/detail/create/delete work, GLB serves as
  `model/gltf-binary`, DB back to 4 products after test cleanup.

## Today's changes (2026-09-06, session 2 — seller studio de-cluttered)

- **Photo ↔ colour index fixed end-to-end**: `ColorVariant.PhotoIndex` on server (model/DTO/seeder +
  migration), form trusts server `photoIndex`, detail page uses it, payload sends it; PUT round-trip
  verified (echo: Onyx=0, Pearl=0, Mist=2 preserved).
- **Stale-closure race fixed**: async `averageColorFromImage` was rewriting variants from a stale
  snapshot, rolling back `photoIndex`. All variant/part edits now merge inside functional
  `setForm(f => …)`.
- **Photos picker**: per-colour clickable thumbnails (`.photo-thumb`, ✕ = none), active ring.
- **GLB part names editable**: `.part-label-input` per part (setMaterialLabel).
- **Two-page studio wizard** (verified via Playwright):
  - Page 1 “Photos & details”: Photos, Details, Specifications, Highlights. No 3D clutter.
  - Page 2 “Colours & 3D”: Colours card + “Paint the parts”, live 3D preview, bg picker
    (white default / mist / dark), ⏸ Pause spin button (persists across bg change).
  - Step pills at top, Continue/Back nav, rail “Publish” button always visible.
  - New product auto-advances to page 2 (`?step=2`) right after creation.
- **Presets removed**: “Save this look” card + savePreset/applyPreset/deletePreset/resetAllMaterials/
  cloneMaterial gone; per-part Reset now resets finish to defaults, keeping the colour.
- **Sliders always editable**: no more “Advanced sliders” toggle; Metal/Rough/Clear always visible;
  Chrome no longer disables metal/clear.
- **3D recolouring made rename-safe**: `applyMaterialPresets` now matches parts to the GLB material
  list (`useGLTF().materials`) by material name then position, instead of a traversal-order guess.
- **Colour-switch no longer wipes your paint**: part colour/label/reset edits are mirrored back into
  the preview-active variant, so switching colours and coming back keeps your edits (verified:
  paint → switch away → back → edits intact; persists on save).

## Known remaining bug (continue tomorrow)

- ~~After renaming a part, changing its colour/sliders does NOT update the 3D preview.~~ **FIXED (2026-09-20)**: every `ModelMaterial` now carries an immutable `glbName` (the material's original name inside the GLB). The 3D preview (`applyMaterialPresets`) matches parts by `glbName` first — never by the user-visible label — so renames can't affect recolouring. Backed by a seeder backfill (`BackfillMaterialNamesAsync`) that patches existing rows (top-level parts + per-variant copies) from the stored `.glb`; upload endpoint and all seeder sites set `glbName`.

## Next up

1. Deploy tasks: swap the dev-only JWT key for a real secret, deploy server (Kestrel + sqlite file)
   with the frontend build, or publish via Aspire containers (`server.PublishWithContainerFiles`).
2. Optional: real checkout/cart, product search, seller analytics; swap Unsplash images for uploaded
   product photos.

## How to run

- AppHost (Aspire): `dotnet run --project AgoraXchangeExperimental.AppHost` (launches server + Vite).
- Server alone: `dotnet run --project AgoraXchangeExperimental.Server` → http://localhost:5582 (`/api/products`).
- Frontend alone: `cd frontend && npm run dev` (proxies `/api` and `/models` to the server).

## Notes

- JWT key is a dev-only key in `appsettings.Development.json` — rotate before any real deployment.
- No Docker needed (SQLite). Migrations in place, so switching to another host DB later is EF-walk-in.
- Placeholder GLBs are simple extruded shapes; drop real `.glb` files into
  `Server/wwwroot/models/{slug}.glb` (or upload via the seller studio) to replace them.
- Plan source of truth: `PLAN.md` in the public `LumireXchangeExperimental` repo.