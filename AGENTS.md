# Agent operating instructions — Stopover

Follows [Mad Mallard repository standards](https://github.com/drakeg/madmallard-repository-standards); the project-specific rules below take precedence.

## Before editing

Read README, SPRINTS, BACKLOG, CONTRIBUTING, RELEASES, SECURITY and `.github/workflows/` first. Associate work with the current sprint or a backlog item; urgent break/fix may go first and be documented afterwards.

## Stack and layout

- `web/` — React 19 + TypeScript + Vite single-page app; Leaflet maps; Capacitor for iOS/Android shells. Deployed to GitHub Pages (`deploy.yml`).
- `supabase/migrations/` — Postgres schema, row-level security (RLS) and RPC functions. Hosted Supabase project `bjjfgdxwqzthdjeebbyf` (us-east-1).
- Free map services (OpenStreetMap Nominatim/Photon/Overpass, OSRM) are called from the browser — see README "Map services".

## Commands (run from `web/`)

```bash
npm ci            # install
npm run lint      # oxlint
npx tsc -b        # type-check
npm test          # vitest unit tests
npm run build     # production build → web/dist
npm run dev:lan   # dev server reachable from phones on the same Wi-Fi
docker compose up # same, in a container (from repo root)
```

## Rules

1. **Branches and PRs.** Work on a feature branch and open a reviewable PR; describe change, tests, risk and rollback. Renovate PRs: run install/test/build/audit, then merge if green.
2. **Database changes** are new files in `supabase/migrations/` (timestamped). Every table gets RLS; others' data is exposed only through `security definer` functions that check `auth.uid()` and return minimal fields. Before merging a migration, test the policies against the live project inside a transaction that is **rolled back**, impersonating users with `set local role authenticated` + `request.jwt.claims`.
3. **Privacy.** Never expose emails, last names or live locations to other users. Check-ins attach to places, not GPS tracks. Reviews/check-ins from approximate (road) pins stay private.
4. **Secrets.** The Supabase *publishable* key is public by design. Never commit service-role keys, tokens or `.env.local`.
5. **Badges** live between `<!-- madmallard-badges:start/end -->` under the README H1. Regenerate with the standards toolkit (`scripts/badges.py --mode write`, then `--mode check`); add project-specific badges only outside that block, and only for things verified in this repo.
6. **Git identity** for agent commits: `Claude <noreply@anthropic.com>` (unverified-commit check).
7. **Docs.** Update README / SPRINTS / BACKLOG / RELEASES in the same PR as the behavior change.
8. **Free tier.** Supabase free projects pause after ~7 days idle; `keepalive.yml` prevents it. If the app can't sign in, check the project status first.
