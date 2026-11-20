## Context
Who this helps and why; sprint / backlog item.

## Changes
What changed (app, database migration, docs).

## Validation
- [ ] `npm run lint`, `npx tsc -b`, `npm test`, `npm run build` (CI)
- [ ] Database: RLS tested on a rolled-back transaction (if a migration is included)
- [ ] Tried in the browser / on a phone
- [ ] Docs, SPRINTS/BACKLOG and badges updated; no secrets

## Risk and rollback
What could break and how to revert (code revert; for migrations, the down-steps).
