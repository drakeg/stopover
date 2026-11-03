# Stopover

Save the places you drive past. Find them again when you're headed that way.

- **Save a place** three ways: where you are right now (GPS), by search, or by tapping the map. Add a type and notes ("check RV parking").
- **Your list** syncs across phone and computer through your account. Mark places as *Been* when you visit.
- **Plan a trip**: pick a start (or use your location) and a destination, choose how far off the route you're willing to go (5–100 mi), and get your saved places in the order you'll reach them, with the mile marker and distance off route. *Go* hands off to Apple Maps or Google Maps.
- **Save trips** to pull up again later.

One codebase runs as a website, installs to a phone home screen, and builds into native iPhone and Android apps with Capacitor.

## Layout

```
web/                 React + TypeScript app (Vite)
  src/lib/geo.ts       geocoding, routing, and the stops-along-route math
  src/lib/geo.test.ts  tests for the route math
  src/components/      screens
  capacitor.config.ts  native app config
supabase/migrations/ database schema and row-level security
```

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in web/dist
```

The Supabase URL and publishable key are built in (they're meant to be public; row-level security keeps each account's data private). Override with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `web/.env.local`.

## Hosting the website

**GitHub Pages (set up):** every push to `main` runs the tests, builds, and publishes to **https://drakeg.github.io/stopover/** via `.github/workflows/deploy.yml`. One-time: repo **Settings → Pages → Source: GitHub Actions**.

`web/dist` is a plain static site, so Netlify, Vercel or Cloudflare Pages also work (base directory `web`, build `npm run build`, publish `dist`).

After it's live, in the Supabase dashboard → **Authentication → URL Configuration**, set **Site URL** to `https://drakeg.github.io/stopover/` so sign-up confirmation emails link back to it.

## Phone apps (Mac)

Needs Xcode (iPhone) and/or Android Studio.

```bash
cd web
npx cap add ios        # once
npx cap add android    # once
npm run ios            # build, sync, open in Xcode
npm run android        # build, sync, open in Android Studio
```

Location permission text — add once after `cap add`:

- **iOS** `ios/App/App/Info.plist`: `NSLocationWhenInUseUsageDescription` → "Stopover uses your location to save the place you're at and to start trips from where you are."
- **Android** `android/app/src/main/AndroidManifest.xml`: `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` permissions.

Until then, the website can be installed on a phone from Safari/Chrome → *Add to Home Screen*.

## Map services

| Job | Service now | Notes |
|---|---|---|
| Map tiles | OpenStreetMap | Free; fine for personal use |
| Search / address lookup | OSM Nominatim | Free, ~1 request/sec, so search runs on button press |
| Driving routes and drive-time matrix | OSRM public demo server | Free, best-effort, no uptime guarantee |
| "What's nearby" suggestions | OSM Overpass API (overpass-api.de, kumi.systems fallback) | Free; ~10,000 requests/day guidance; not meant as a public app's backend |

All three live in `web/src/lib/geo.ts` and `MapView.tsx`. Before opening the app to the public, move to a provider with an API key (Mapbox, MapTiler, Stadia Maps, OpenRouteService), ideally called through a Supabase Edge Function so the key isn't in the app.

## Adding places on the road

Quick add grabs GPS the moment it opens and saves right there. In the background it looks up attractions,
historic sites, parks, viewpoints, waterfalls, caves and campgrounds within 25 miles, ranked closest first,
Wikipedia-notable places higher, and **ahead of you** above behind (using the phone's direction of travel when moving).
Typing the sign narrows the list; if nothing nearby matches, it searches any named place within 50 miles.
Tapping a suggestion saves its exact spot and type instead of the road.

## Routing several places

In My places, **Route several…** → tick places → choose a start (defaults to current location) and an ending
(last stop, back to start, or somewhere else). The best order comes from real drive times (OSRM table), solved
exactly for up to 12 stops and by nearest-neighbour + 2-opt above that; it falls back to straight-line distance if
the drive-time server is down. Opens in Google or Apple Maps, split into parts if the trip has more stops than one link holds.

## Shared lists

Places belong to a **list**. Everyone starts with "My places"; you can make more (Account → Lists).
- **Share:** Account → Lists → *Create invite link* → send it. Links work once and expire after 7 days.
  The person signs in (or signs up) from the link and sees who invited them before joining; they can bring
  their own saved places along.
- **Sync:** everyone on a list can add, edit, mark visited and remove places. Changes appear live
  (Supabase Realtime) and again whenever the app comes back to the foreground.
- **Owner** can rename the list, remove people and delete the list; others can leave. If the owner deletes
  their account, a shared list passes to the longest-standing member and keeps its places.
- The switcher at the top of My places changes lists; Edit place can move a place to another list.
  Trip planning uses the list that's open. Saved trips are still personal.

Database: `lists`, `list_members`, `list_invites` (row-level security via helpers in a non-exposed `private`
schema); invites go through `invite_info()` / `accept_invite()`; `places.list_id` replaces per-user ownership
(`places.user_id` now means "added by").

## Accounts

- Sign up (optional name), sign in, **forgot password** → email link → choose a new password
- **Account page** (gear button, top right): name, change email (confirmed by email), change password,
  usual detour distance and preferred maps app, sign out,
  and **delete account** (removes places, trips and profile; required for App Store / Play Store listing)

- **Saved places list** on the Account page: search (names, notes, towns, exits), filter by state, type and
  visited/to-visit, "approximate pins only", sort by newest/oldest/name/state; download the current results as
  **GPX** (Garmin and other GPS apps) or **CSV**. City/state are filled in automatically from each pin.

## Before opening it to the public

1. **Email sending.** Supabase's built-in email is for testing and only sends a handful of emails per hour.
   Set up custom SMTP (Resend, Postmark, Amazon SES…) under **Authentication → Emails → SMTP Settings**,
   and brand the templates (confirm signup, reset password, change email) on the same page.
2. **Redirect URLs.** **Authentication → URL Configuration**: Site URL `https://drakeg.github.io/stopover/`
   and Redirect URL `https://drakeg.github.io/stopover/**` (needed for confirm, reset and email-change links).
3. **Leaked-password protection.** **Authentication → Sign In / Providers → Email** (may require a paid plan).
4. **Privacy policy and terms.** Needed for the app stores and good practice; the app stores locations people save.
5. **Map services.** Move off the free OpenStreetMap search/routing/Overpass servers (see Map services above).
   Overpass asks that public apps run their own instance or use a paid places API (Google Places Nearby, Mapbox, Foursquare).

## Ideas for later

- RV-aware routing (height/weight/propane restrictions)
- Photos on places
- Import from Google Maps saved lists
- Filter stops by type; reorder and export a trip as a multi-stop route
- Share a list with travel companions
