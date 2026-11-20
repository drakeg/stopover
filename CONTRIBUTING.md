# Contributing to Stopover

Contributions — including AI-authored PRs — are welcome. Open an issue describing the change, who it helps, risks and acceptance criteria; it's triaged into the current sprint or the [backlog](BACKLOG.md). Urgent fixes can skip the queue but still get documented.

## Workflow

1. Branch from `main` (`feat/…`, `fix/…`, `docs/…`, `chore/…`).
2. Keep commits small and use Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`, `feat!:` for breaking changes.
3. Add or update tests and docs for behavior changes.
4. Run the checks from `web/`:
   ```bash
   npm ci && npm run lint && npx tsc -b && npm test && npm run build
   ```
   and from the repo root, with the [standards toolkit](https://github.com/drakeg/madmallard-repository-standards) checked out:
   ```bash
   python3 ../madmallard-repository-standards/scripts/audit.py --repo . --check
   python3 ../madmallard-repository-standards/scripts/badges.py --repo . --mode check
   ```
5. Database changes: add a new file in `supabase/migrations/` and describe how you tested the row-level security (see [AGENTS.md](AGENTS.md)).
6. Open a PR using the template. CI (`ci.yml`) must pass; merge after review.

## Testing on your phone

`npm run dev:lan` (or `docker compose up`) serves the app on your local network — open the printed `http://<your-computer-ip>:5173` address on a phone on the same Wi-Fi. Location features need HTTPS on most phones, so test "I'm here"/GPS on the deployed site or the native app.

## Definition of Ready

Clear user/business reason, scope small enough for a sprint, acceptance criteria, known dependencies (database, map services, app-store requirements).

## Definition of Done

Acceptance criteria met; lint, type-check, tests and build pass in CI; RLS tested for DB changes; docs and badges updated; no secrets; release impact noted in [RELEASES.md](RELEASES.md); sprint/backlog updated.

Accessibility: descriptive headings and links, keyboard-usable controls, and never color alone to convey status.
