# Verification status — 18 November 2026

This record distinguishes earlier observations from checks of the latest
resilience changes. It is not a claim that every flow works on every device.

## Latest revision

- `npx tsc --noEmit` passed after the AI timeout, cancellation, readiness, and
  native response-schema changes.
- `npm run build` passed while preparing the public repository and Vercel deployment.
- The latest changes were inspected for saving originals before extraction,
  rejecting stale results, explicit cloud consent, and recovery from empty
  extraction results.
- No unit-test suite, live Nano inference, model download, or live cloud request
  was run for these latest changes, at the project owner's request.
- A previous build or test result does not verify this revised runtime flow.

The latest code adds an 8-second readiness deadline, a 45-second AI request
deadline, a Stop action, cancellation of superseded operations, and guarded
modal/auth updates. These are implementation safeguards; their TypeScript check
does not establish that the native browser model runs successfully.

## Previously observed

The following were observed before the latest resilience changes:

- Cloud AI through Firebase AI Logic extracted tasks from synthetic Thai and
  English messages. Those observations do not prove current on-device behavior.
- Basic extraction, local persistence, task editing and completion, saved
  messages, and selected-task review were exercised with synthetic example text.
- Google sign-in without Calendar permission successfully entered the app.
- In-app calendar marking and saved-message deletion/undo were inspected with
  synthetic data in a separate local origin.
- Earlier automated tests exercised validation, persistence, calendar date
  handling, extraction state, and mocked Google Calendar requests. They were not
  rerun after the latest changes; no current passing-test count is asserted here.

Basic-helper timings of around 1–2 ms are rule-processing measurements, not AI
latency. All verification examples used synthetic messages rather than personal
chat history.

## Still unverified

- A successful Gemini Nano 4 inference through Firebase AI Logic on compatible
  hardware, including supported input languages and cold/warm behavior.
- Runtime timeout, Stop, retry, and cancellation behavior after the latest
  resilience edits.
- Real Google Calendar event creation/update and partial-failure handling. Unit
  mocks do not establish that live OAuth scopes or Calendar writes succeed.
- Hosted production App Check, Google sign-in, and judge access on the final
  deployment hostname. Localhost configuration does not establish these.
- Actual mobile Safari behavior, cross-device sync, backup import, or a complete
  offline/PWA installation. The latter three are not implemented features.
- Hackathon submission and public demo-video completion.

## Release evidence to add after publishing

Record the public source URL, production demo URL, deployed commit, successful
build result, final hostname authorization, and observed hosted checks. Do not
include App Check debug tokens, OAuth tokens, private credentials, or real user
messages in this record.
