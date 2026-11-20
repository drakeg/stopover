# Releases and versioning

Stopover uses [Semantic Versioning](https://semver.org/). Until `v1.0.0` (public launch with paying customers and app-store builds) versions are `v0.x.y`: **minor** for new features, **patch** for fixes. Every merge to `main` deploys to GitHub Pages; a **release** is a tagged, documented checkpoint — not every merge.

**Release checklist:** CI green on `main`; database migrations applied and RLS-tested; deployed site checked; README badges verified; SPRINTS/BACKLOG updated; notes below written; then push tag `vX.Y.Z` **or** run Actions → Release with the version — the workflow publishes the GitHub release with these notes. Security fixes may get an expedited patch release.

Use Conventional Commit prefixes as hints, but decide the version by actual user-visible impact.

## Unreleased

- **Business listings:** owners claim a place, Stopover verifies it, and verified businesses show a ✓ badge, RV facts (rig length, big-rig parking, hookups, pets), an offer and contact details. Owners get a counts-only dashboard and can publicly reply to reviews of their place. Featured businesses appear, labelled Sponsored, along travelers' planned routes.

**Migrations:** `20261120150000_businesses.sql` (applied to production Nov 20 2026; RLS tests in `supabase/tests/businesses_rls.sql`), `20261120180000_review_replies.sql` (applied Nov 20 2026; tests in `supabase/tests/review_replies_rls.sql`).

## v0.9.0 — Beta (Nov 20 2026)

First tagged release, covering Sprints 1–9.

- **Places:** quick add from the road, nearby suggestions ahead of you, duplicate warnings, editing and exact pins, been-there history, GPX/CSV export.
- **Trips:** stops along a route within your detour distance, best-order multi-stop routing, open in Google or Apple Maps.
- **Sharing:** shared lists with invite links and live sync; friends; meet-up check-ins with visibility controls; in-app messages with block and report.
- **Reviews:** star ratings with RV parking, cost and notes, shared across travelers.
- **Accounts and trust:** password reset, profile and privacy settings, account deletion, privacy policy and terms, moderation (reports, hidden reviews, suspensions).
- **Engineering:** CI on every PR, standards docs, badges, Docker Compose / LAN testing, database keep-alive.

**Migrations:** all files in `supabase/migrations/` up to `20261114060000_moderation.sql` are applied to production.
