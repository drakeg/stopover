# Product vision and sprint plan

**Vision:** Stopover is the easiest way for RVers to save the places they pass and actually go back — and the most direct way for the small businesses along their routes (campgrounds, RV parks, attractions, museums, RV service shops) to reach travelers who are already headed their way.

**Customers:** RVers use Stopover free. Paying customers are **small and medium businesses (SMBs)** that want to be found by RVers planning trips near them.

Each sprint records goal, deliverables, acceptance and outcome. Dates are when the work landed.

## Completed

### Sprint 1 — MVP (Nov 2 2026) ✅
Save places, trip planner with stops along a driving route, Supabase accounts with row-level security, GitHub Pages deploy, Capacitor shells.
**Outcome:** Live at drakeg.github.io/stopover; used by the founder and co-pilot.

### Sprint 2 — Usable on the road (Nov 2) ✅
One-tap Quick add (GPS + sign text), editing/moving pins, pasted coordinates and map links, whole-trip links to Google/Apple Maps.

### Sprint 3 — Accounts (Nov 2) ✅
Forgot/reset password, Account page, preferences, GPX/CSV export, account deletion; searchable/filterable saved-places list with state/city.

### Sprint 4 — Discovery and routing (Nov 2) ✅
Nearby attraction suggestions ranked by direction of travel (OSM Overpass); "Route several" with optimal stop order (OSRM table + exact solver).

### Sprint 5 — Shared lists (Nov 2–3) ✅
Lists with invite links, members, live sync (Supabase Realtime), move places between lists, added-by labels.

### Sprint 6 — History, duplicates, reviews (Nov 5) ✅
Been-there tab, duplicate warning across lists, community star ratings with RV parking/cost/notes.

### Sprint 7 — Meet-ups (Nov 5) ✅
"I'm here"/"I'm going" check-ins with per-check-in visibility, friends (invite links + list mates), in-app messages, block and report.

### Sprint 8 — Trust, safety and operations (Nov 8–19) ✅
Security/dependency PRs reviewed and merged, privacy policy and terms pages, moderation (report reviews, admin screen, suspensions), database keep-alive.

## Current

### Sprint 9 — Engineering standards (Nov 19) 🔄
**Goal:** Adopt Mad Mallard standards so work is reviewable, tested in CI and easy to test locally.
- [x] AGENTS, CONTRIBUTING, SPRINTS, BACKLOG, RELEASES, SECURITY, PR template
- [x] CI on every PR (lint, type-check, tests, build, standards audit, badge check)
- [x] README badges (generated + verified)
- [x] Docker Compose + `npm run dev:lan` for phone testing on the local network
- [ ] First tagged release `v0.9.0` with release notes (after merge)
**Acceptance:** CI green on the PR; audit reports nothing missing; badge check clean; `docker compose up` serves the app on the LAN.

## Planned

### Sprint 10 — Business listings MVP (SMB) — next
**Goal:** The fastest realistic path to a first paying customer: let a campground or attraction **claim its place** and show up for RVers whose trips pass nearby.
- Business claim request (from any place) → admin approves in Moderation
- Business profile: description, RV-specific facts (max length, big-rig parking, hookups, pet policy), website/phone, an offer ("10% off for Stopover travelers")
- Verified-business badge on the place; owner can reply to reviews
- "Featured along your route" in the trip planner for claimed businesses within the detour distance (clearly labelled)
- Simple dashboard: how many travelers saved, planned or checked in at the business
- Payment via a hosted checkout link (no billing code) — **needs the owner's Stripe account**
**Acceptance:** A real business can be claimed, approved, edited and featured end-to-end; travelers can always tell featured results from organic ones; no traveler data beyond counts is exposed to businesses.

### Sprint 11 — Notifications
Email (and web push for installed apps) for new messages, friend plans, review replies, and new reports for admins; per-user notification settings.

### Sprint 12 — Launch readiness
Custom SMTP for auth emails, support email, paid map/geocoding provider behind an Edge Function, app-store builds, landing page aimed at businesses.
