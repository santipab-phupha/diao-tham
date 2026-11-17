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
- No unit-test suite, live Nano inference, or model download was initiated for
  these latest changes, at the project owner's request. A hosted cloud smoke
  check was completed during deployment, as recorded below.
- Build and TypeScript checks do not verify the revised runtime flow.

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
- Hosted Google sign-in and remote Calendar sync. The Google account chooser
  stalled during browser automation and was closed; no successful hosted
  sign-in is asserted. Account-free access and cloud processing were verified.
- Actual mobile Safari behavior, cross-device sync, backup import, or a complete
  offline/PWA installation. The latter three are not implemented features.
- Hackathon submission and public demo-video completion.

## Publication evidence

- Public source: [santipab-phupha/diao-tham](https://github.com/santipab-phupha/diao-tham).
- Production demo: [diao-tham.vercel.app](https://diao-tham.vercel.app).
- Initial published and deployed commit: `3ad9611`.
- Vercel reported the initial production deployment **READY**. An anonymous HTTP
  request to the production URL returned **200** without Vercel team login.
- `npm run build` passed during release preparation. Public Firebase environment
  variables were configured for Vercel Production and Preview; the local App
  Check debug token was not deployed.
- reCAPTCHA Enterprise API was enabled without enabling billing or upgrading
  Firebase's Spark plan. A production score-based key with domain verification
  restricted to `diao-tham.vercel.app` was created and registered for Diao Tham
  Web; Firebase showed **Registered**. The production domain was also added
  to Firebase Authentication's authorized domains.
- The deployment rebuilt with all nine public configuration variables and Node
  24. Its public JavaScript bundle contained the expected Firebase and App Check
  settings and did not contain the local App Check debug token.
- Production cloud extraction through Firebase AI Logic was verified using a
  synthetic project-files/screenshots message after explicit in-app consent.
  It saved two tasks, due 19 November 2026 at 10:00 and 11:00 in Asia/Bangkok.
  The first request, including App Check initialization, took about 11.3 seconds.
- Empty basic-helper results preserved the original and allowed reopening it
  for cloud processing. **Add to Calendar** marked both tasks in the hosted
  in-app calendar. No real Google Calendar events were created.
- Nano inference and remote Google Calendar writes were not tested.

Do not include App Check debug tokens, OAuth tokens, private credentials, or real
user messages in this record.
