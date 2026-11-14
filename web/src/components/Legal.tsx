/**
 * Privacy policy and terms of use, reachable without signing in at
 *   …/stopover/#/privacy  and  …/stopover/#/terms
 * (Google sign-in and the app stores ask for public links to both.)
 *
 * Plain-language drafts — have them reviewed before a public launch.
 */

export const LEGAL_UPDATED = 'November 14, 2026'
// TODO: replace with a dedicated support email address before launch
export const CONTACT_URL = 'https://github.com/drakeg/stopover/issues'

export type LegalPage = 'privacy' | 'terms'

export const legalPageFromHash = (hash = window.location.hash): LegalPage | null =>
  hash === '#/privacy' ? 'privacy' : hash === '#/terms' ? 'terms' : null

export const legalHref = (p: LegalPage) => `${window.location.pathname}#/${p}`

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <p className={`legal-links muted small ${className}`}>
      <a href={legalHref('privacy')}>Privacy</a> · <a href={legalHref('terms')}>Terms</a>
    </p>
  )
}

export function Legal({ page, onBack }: { page: LegalPage; onBack: () => void }) {
  return (
    <main className="legal">
      <button className="btn link" onClick={onBack}>‹ Back to Stopover</button>
      <article className="card">
        {page === 'privacy' ? <Privacy /> : <Terms />}
        <p className="muted small">Last updated {LEGAL_UPDATED}. Questions? <a href={CONTACT_URL} target="_blank" rel="noreferrer">Contact us</a>.</p>
      </article>
    </main>
  )
}

function Privacy() {
  return (
    <>
      <h1>Privacy policy</h1>
      <p>Stopover helps you save places you pass on the road and find them again on future trips. This page explains what we
        collect, why, who can see it, and how to delete it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> email address, password (stored only as a secure hash by our database provider), and
          the name you choose to show.</li>
        <li><strong>Places you save:</strong> name, location, notes, type, whether and when you visited, and the lists they’re on.</li>
        <li><strong>Optional profile details:</strong> your rig type, usual detour distance and preferred maps app.</li>
        <li><strong>Things you choose to share:</strong> reviews (stars, parking, cost, notes), “I’m here” and “I’m going”
          check-ins, messages to other travelers, and reports you file.</li>
        <li><strong>Your location — only when you ask:</strong> when you tap “Add a place”, “Use my location” or “I’m here”, the app
          reads your device’s location once. Stopover does not track your location in the background.</li>
      </ul>

      <h2>Who can see what</h2>
      <ul>
        <li><strong>Your places and trips</strong> are private to you and anyone you invite to a shared list.</li>
        <li><strong>Reviews</strong> are visible to all Stopover users, shown with your first name only. Reviews of places whose pin
          was saved from the road stay private until the pin is moved to the place itself.</li>
        <li><strong>Check-ins</strong> are visible to the people you choose for each one: no one, your friends, or everyone. Others
          see your first name, rig, the place, when, and any note — never your live location, last name or email.</li>
        <li><strong>Messages</strong> are visible only to you and the person you’re talking with (and to our moderators if one of you
          reports the conversation).</li>
        <li><strong>Moderators</strong> can see reported content and the email address of the person reported, to handle abuse.</li>
      </ul>

      <h2>Services we use</h2>
      <p>To make the app work, some information is sent to these providers:</p>
      <ul>
        <li><strong>Supabase</strong> stores your account and data (servers in the United States).</li>
        <li><strong>OpenStreetMap services</strong> (Nominatim, Photon, Overpass, map tiles) and the <strong>OSRM</strong> routing
          service receive the searches you type and the coordinates needed to look up places, nearby attractions and driving
          routes. They don’t receive your name or email.</li>
        <li><strong>Google Maps or Apple Maps</strong> receive the route or place when you choose to open one there.</li>
        <li><strong>GitHub Pages</strong> hosts the website and may log basic visit information such as IP address.</li>
      </ul>
      <p>We don’t sell your information, show ads, or use advertising trackers.</p>

      <h2>Keeping and deleting your data</h2>
      <p>Your data is kept while you have an account. You can export your places (GPX or CSV) and delete your account at any
        time from Account. Deleting your account removes your profile, your lists (unless shared with others), your reviews,
        check-ins, messages and reports. On shared lists, places you added stay for the other members without your name; if you
        owned a shared list, it passes to another member.</p>

      <h2>Children</h2>
      <p>Stopover isn’t meant for children under 13, and we don’t knowingly collect their information.</p>

      <h2>Changes</h2>
      <p>If this policy changes, we’ll update the date below and, for important changes, let you know in the app.</p>
    </>
  )
}

function Terms() {
  return (
    <>
      <h1>Terms of use</h1>
      <p>By using Stopover you agree to these terms. If you don’t agree, please don’t use the app.</p>

      <h2>Your account</h2>
      <p>Keep your password safe and give accurate information. You’re responsible for what happens under your account. You must
        be at least 13 years old.</p>

      <h2>Your content</h2>
      <p>You own the places, reviews, notes and messages you add. By sharing a review or check-in, you let Stopover show it to the
        people you chose, as described in the <a href={legalHref('privacy')}>privacy policy</a>.</p>

      <h2>Be a good neighbor</h2>
      <p>Don’t use Stopover to harass, threaten or spam anyone; post false, hateful, sexual or illegal content; impersonate
        someone; share other people’s private information; or try to break or overload the service. We may hide content and
        suspend or close accounts that break these rules.</p>

      <h2>Meeting other travelers</h2>
      <p>Meet-ups are between you and the people you meet. Stopover doesn’t check who users are. Meet in public places, trust your
        instincts, and use Block and Report if something feels wrong.</p>

      <h2>Maps and routes are a guide only</h2>
      <p>Place locations, nearby suggestions, drive times and routes come from community and third-party map data and may be wrong
        or out of date. <strong>Routes don’t account for RV height, weight, length or propane restrictions.</strong> Always check
        road signs, your RV’s limits and official sources, and follow traffic laws. Never use the app in a way that distracts
        the driver.</p>

      <h2>No warranty</h2>
      <p>Stopover is provided “as is”, without warranties of any kind. To the extent the law allows, we aren’t liable for indirect
        or consequential losses, or for anything that happens at places you visit or meet-ups you arrange.</p>

      <h2>Changes and ending</h2>
      <p>We may change the app or these terms. If the terms change in an important way, we’ll let you know in the app; continuing
        to use Stopover means you accept the new terms. You can stop using Stopover and delete your account at any time.</p>
    </>
  )
}
