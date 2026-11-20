# Prioritized backlog

Priorities: **P0** blocks the next paying customer or a safe launch · **P1** high customer value · **P2** nice to have. Reprioritize through reviewed PRs/issues. An item listed here is not done until SPRINTS.md says so.

| Priority | Item | Why | Target | Status |
| --- | --- | --- | --- | --- |
| P0 | CI on PRs, standards docs, badges, Docker/LAN testing | Reviewable, tested changes | Sprint 9 | In PR |
| P0 | Business claim + approval flow | First thing a paying SMB needs | Sprint 10 | Done (#27) |
| P0 | Business profile with RV facts + offer; verified badge | Core value for campgrounds/attractions | Sprint 10 | Done (#27) |
| P0 | "Featured along your route" (labelled) in trip planner | What businesses pay for: travelers headed their way | Sprint 10 | Done (#27) |
| P0 | Payment via hosted checkout link | Get paid without building billing | Sprint 10 | **Blocked: needs Stripe account + price decision** |
| P1 | Business dashboard (saves, plans, check-ins counts) | Shows ROI → renewals | Sprint 10 | Done (#27) |
| P2 | Admin UI to hide an owner reply (RPC `admin_set_reply_hidden` exists) + report-a-reply | Moderation completeness | Sprint 11 | Planned |
| P1 | Owner replies to reviews | Businesses expect it | Sprint 10 | Done (#28) |
| P1 | Email/web-push notifications (messages, plans, reports, replies) | Messages and reports go unseen today | Sprint 11 | Planned |
| P1 | Custom SMTP + support email address | Supabase built-in email is rate-limited; legal pages need contact | Sprint 12 | Blocked: needs email provider/address |
| P1 | Paid geocoding/places provider via Edge Function | Free OSM services aren't for public apps | Sprint 12 | Planned |
| P1 | Business-facing landing page + outreach via the founder's RV YouTube channel | Distribution to both sides | Sprint 12 | Planned |
| P1 | Choose a license (proprietary vs open source) | Repo is public with no license | — | **Decision needed** |
| P2 | Report button on check-in notes | Completes moderation coverage | — | Backlog |
| P2 | RV-aware routing (height/weight/propane) | Big differentiator, needs paid routing data | — | Backlog |
| P2 | Photos on places and reviews | Richer listings | — | Backlog |
| P2 | Import Google Maps saved lists | Faster onboarding | — | Backlog |
| P2 | App-store releases (iOS/Android) | Discoverability, push notifications | Sprint 12 | Backlog |
| P2 | Leaked-password protection (Supabase paid plan) | Advisor warning | — | Backlog |

## Commercial notes

- **Who pays:** campgrounds/RV parks, roadside attractions and small museums, RV service/repair shops near highways. They already pay for directory listings and ads; Stopover's edge is reaching RVers *whose saved routes pass within their detour range*.
- **Fastest path:** founder-led sales — 5–10 businesses on routes the founder travels and features on the channel; hand-approve claims; hosted checkout link; monthly plan.
- **Pricing hypothesis (to validate):** free claimed profile; paid "Featured" plan at roughly $19–49/month per location. Test with the first 5 businesses before building tiers.
- **Guardrails:** featured results are always labelled; businesses only see aggregate counts, never traveler identities or locations.
