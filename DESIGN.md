# เดี๋ยวทำ · Diao Tham design

## Product

Capture a thought before it disappears. Review suggested actions, then choose
when to do them. A deadline and a work period are separate fields.

The main page preserves an overview: one capture card, due/open counts, a monthly
calendar, pending originals, and task filters. Successful extraction saves tasks
to My tasks immediately. Users can review details later or explicitly add tasks
to the in-app calendar. Google Calendar sync is a separate, confirmed action.
An entry chooser offers Google sign-in or local setup; task editing and connection
details open on demand rather than replacing the overview with a wizard.

## Speed

- Write the original locally before invoking any extraction service.
- Capture storage should respond in under 200 ms on the target machine.
- Aim for 2–3 seconds for short-message AI extraction when the model is ready.
  This is an unverified target, not a performance claim.
- Measure actual capture and extraction durations; do not present basic-helper
  timings as model latency.
- Initial model download, first request and warm requests must be evaluated
  separately. Rules-based timings never count as AI timings.
- Calendar login/network requests cannot block local task persistence.

## Visual direction

White surfaces with Google-inspired color accents, image-led overview, short English UI copy, readable Noto Sans Thai,
consistent spacing, one primary action in each view, 44px primary touch targets.
Details are disclosed on demand. Mobile retains overview cards and regular
scrolling, safe areas, focus indicators and reduced-motion support.
The interface is English-only. Captured messages, task titles and evidence
retain their original language, including Thai.

The hero uses larger display typography, a blue-to-green second line and a hand-drawn
underline accent. A brief staggered entrance runs only on first mount, not
when task filters or capture actions redraw the overview. Reduced-motion users
see the static title. No additional fonts or animation libraries are loaded.

The Diao Tham identity uses an original connected D monogram with a transparent
counter. Its blue-dominant gradient adds red, yellow and green around the curve.
The palette is `#4285f4`, `#ea4335`, `#fbbc05`, `#34a853`; smaller functional
text/buttons use darker blue and green for readability. Color is concentrated
in the mark, hero underline and selected accents, with white cards and a quiet
background. Source assets, favicon and horizontal wordmark live in `public/brand`.

## Data and trust

- Capture stores source text, original message date, time zone and status.
- Extracted actions are saved immediately as editable suggestions. Users should
  review titles, dates, and times before acting or syncing to Google Calendar.
- Preserve exact source evidence. Mark ambiguous dates instead of guessing.
- Device mode never falls back silently to cloud. Cloud needs per-text consent.
- Local readiness checks have an 8-second deadline; AI requests have a 45-second
  deadline and a Stop action. Routine capture uses an already-ready local model
  instead of calling model-download initialization. Nano remains unverified.
- Basic rules are a clearly labelled non-AI convenience, not the competition AI.
- Task data is local to this browser origin. No automatic chat/clipboard access.
- Calendar writes send only title and chosen work times, with stable IDs.

## Technical choices

Vite + TypeScript, Firebase Web SDK (AI Logic, App Check, and Authentication),
localStorage for the small local dataset, and Google Calendar API for optional
user-authorized writes. The app is a static Vite build suitable for Vercel;
public Firebase settings are build-time environment variables. Hosted App Check
and Google sign-in need the deployment hostname configured. No database server
or mandatory sign-in is needed for the local capture route.

## Out of scope for this build

Automatic LINE/Gmail ingestion, recurring tasks, teams, two-way Calendar sync,
cross-device sync, automated availability-based scheduling and PWA installation.
