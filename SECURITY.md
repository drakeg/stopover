# Security policy

Please **don't** post vulnerabilities, credentials or other people's data in public issues. Report privately through GitHub: **Security → Report a vulnerability** on this repository. Include impact, affected area and safe reproduction steps.

## How Stopover protects data

- Every database table uses Postgres row-level security; other users' data is only reachable through functions that check who is asking and return minimal fields (first name, rig, place, time — never email, last name or live location).
- Users can block, report, export their data and delete their account; admins can hide reviews and suspend accounts.
- The Supabase publishable key in the app is public by design. Service-role keys and tokens are never committed or used in CI.
- CI and deploy workflows run with least-privilege `permissions`; dependencies are kept current by Renovate and reviewed before merging.

## Supported versions

Until v1.0.0, only the current `main` branch (the deployed site) is supported.
