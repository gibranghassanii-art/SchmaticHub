# SchematicHub

A static website for browsing, previewing (real 3D, in the browser) and downloading Minecraft **`.litematic`** schematics. No build step, no backend, no npm.

## Run locally
```
python3 tools/make_demo.py      # optional: regenerates the demo schematics + data/schematics.json
python3 -m http.server 8000     # then open http://localhost:8000
```
Opening `index.html` by double-click will not work (ES modules, Web Workers and `fetch` need http).

## Deploy to GitHub Pages
1. Create a repo and push **everything in this folder to the repo root** (keep `.nojekyll`).
2. Repo → Settings → Pages → *Deploy from a branch* → `main` / `/ (root)`.
3. Edit `SITE.repo` in `js/app.js` to `your-user/your-repo` (used by the "Submit on GitHub" button).
4. Your site appears at `https://your-user.github.io/your-repo/`. URLs use hash routing (`#/schematic/medieval-castle`) because Pages has no server-side rewrites.

## Layout (adapted: no framework, so no `src/` or `public/`)
```
index.html            shell + import map (Three.js from jsDelivr CDN)
css/style.css         theme
js/app.js             router, pages, cards, filters, upload flow, SITE settings + LOGO
js/viewer.js          Three.js viewer + card thumbnails
js/litematic.js       Web Worker: gzip + NBT parser, bit-unpacking, face-culled mesher
data/schematics.json  all schematic metadata
schematics/           the .litematic files (and images/ for optional screenshots)
tools/make_demo.py    generates the DEMO builds
```

## What a pure GitHub Pages site can and cannot do
**Can:** serve static files; parse and render `.litematic` entirely client-side; keep per-browser likes, view/download counts and comments in `localStorage`.

**Cannot:** accept file uploads, store anything shared between visitors, run a database, count real downloads/likes, or log users in. Pages is read-only hosting.

**So this version does the closest honest thing:**
- *Upload page*: validates the extension, gzip header and NBT structure, previews the real build, shows dimensions/block count, creates a listing page **for your current session only**, and produces the metadata JSON plus a pre-filled GitHub issue (attach the file zipped; GitHub rejects raw `.litematic`).
- *Publishing*: a maintainer copies the file to `schematics/` and adds the JSON entry to `data/schematics.json`. Optionally add a GitHub Action that turns issues into pull requests.
- *Likes, comments, counts*: stored in your own browser only. Numbers from the JSON are static.

**To make it fully community-powered** you need one external service (all have free tiers):
| Feature | Option |
|---|---|
| Uploads + file storage | Supabase Storage, Firebase Storage, or Cloudflare R2 behind a Worker |
| Metadata database | Supabase (Postgres) or Firebase; replace the `fetch('data/schematics.json')` line at the bottom of `js/app.js` with an API call |
| Accounts | Supabase/Firebase Auth (GitHub or Discord login) |
| Comments | [giscus](https://giscus.app) (GitHub Discussions), a drop-in script |
| Likes / downloads counters | a table plus an RPC/edge function, rate-limited |
Server-side you must re-validate every upload (extension, size, gzip/NBT check) — client checks are only for UX.

## Viewer notes
- Parsing + meshing run in a Web Worker; the result is one hidden-face-culled `BufferGeometry` with baked per-face shading, rendered on demand (only when the camera moves).
- Schematics up to ~64 million cells of bounding box are previewed; beyond that you get a clear error and can still download.
- Blocks are coloured cubes (no Mojang textures). Stairs, slabs, panes, plants etc. are drawn as full cubes, and glass is opaque. Greedy meshing and per-block-state models are not implemented.
- Card previews are real renders of the schematic, created lazily one at a time and cached for the session.

## Security
Uploaded files are only read as data (never executed). All text from JSON, forms and comments is HTML-escaped before display; only `.litematic` is accepted as the schematic type; file size is capped (`SITE.maxMB`). `javascript:` URLs are never built from user input.

## Customising
Rename the site and swap the logo via `SITE.name` and `LOGO` at the top of `js/app.js` (and `<title>` in `index.html`). Categories and versions: `CATEGORIES`, `VERSIONS`. Colours: CSS variables at the top of `css/style.css`. Block colours: `PAL` in `js/litematic.js`.

Demo entries are flagged `"demo": true`; delete them from `data/schematics.json` (and `schematics/`) when you add real ones.
