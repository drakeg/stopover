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

`web/dist` is a static site. Netlify, Vercel, Cloudflare Pages or GitHub Pages all work (build command `npm run build`, base directory `web`, publish `dist`).

After it's live, in the Supabase dashboard → **Authentication → URL Configuration**, set **Site URL** to the live address so sign-up confirmation emails link back to it.

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
| Driving routes | OSRM public demo server | Free, best-effort, no uptime guarantee |

All three live in `web/src/lib/geo.ts` and `MapView.tsx`. Before opening the app to the public, move to a provider with an API key (Mapbox, MapTiler, Stadia Maps, OpenRouteService), ideally called through a Supabase Edge Function so the key isn't in the app.

## Ideas for later

- RV-aware routing (height/weight/propane restrictions)
- Photos on places
- Import from Google Maps saved lists
- Filter stops by type; reorder and export a trip as a multi-stop route
- Share a list with travel companions
