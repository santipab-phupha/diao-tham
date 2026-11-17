# เดี๋ยวทำ · Diao Tham

Catch a message before you forget it. Diao Tham saves the original, extracts
actionable tasks, and lets you choose when to put them on a calendar.

A Vite + TypeScript web prototype for #BuildHybridAI 2026, using Firebase AI
Logic, Firebase App Check, and optional Google sign-in and Calendar access.
The interface is English; original messages and task titles keep their language.

## Access for judges

[Open the production demo](https://diao-tham.vercel.app) ·
[Public source repository](https://github.com/santipab-phupha/diao-tham)

The website is publicly reachable. Production App Check is registered, and
cloud extraction plus in-app calendar marking were verified on this domain.
Google sign-in's production domain is authorized; hosted Google sign-in and
remote Calendar sync are not yet confirmed. Nano inference remains unverified.

1. Open the demo in a desktop browser. **Continue with Google** uses cloud AI;
   Calendar permission is optional and is not needed to capture a message.
2. Paste a synthetic example such as:
   `Please send the slides tomorrow before noon and call the shop tomorrow at 2 pm.`
3. Choose **Capture & extract**, then review and confirm **Send this text to AI**.
   Successful extraction saves the tasks in **My tasks**.
4. Choose **Add to Calendar**, check the dates and times, and add the selected
   tasks to the calendar inside this app.
5. Google Calendar is a separate, optional step: **Sync with Google Calendar**,
   connect an account, review the listed tasks, then choose **Sync now**.

For a local-only preview, choose **Set up on this device** and **Basic helper
(no AI)**. This route needs no Google account. The basic helper is not an AI
model and does not demonstrate the competition's on-device AI requirement.

If a Google popup does not complete, the following account-free cloud route
was also verified: enter through **Basic helper (no AI)** and capture
`Organize the project files tomorrow at 10 am and archive the screenshots tomorrow at 11 am.`
The basic helper finds no tasks for this wording and preserves the original.
Choose **Review later**, then **Review message** in My tasks, **Try cloud AI**,
and **Send this text to AI**. The hosted cloud model returned two tasks with
the specified times. No Nano download or Google Calendar permission is needed.

No visitor needs the developer's Firebase configuration, API credentials, or
App Check debug token. Use synthetic messages when evaluating this prototype.

## Run locally

Requires Node.js 24 or later and npm.

```sh
git clone https://github.com/santipab-phupha/diao-tham.git
cd diao-tham
npm ci
```

Copy `.env.example` to `.env.local` and configure your Firebase project as
described below, then run:

```sh
npm run dev
```

Open [http://127.0.0.1:5178](http://127.0.0.1:5178). Basic capture remains
available without a configured AI service. Developer commands:

```sh
npm run build   # TypeScript check and Vite production build
npm run preview # Preview dist at http://127.0.0.1:4178
npm test        # Unit tests; does not run a live model
```

See [VERIFICATION.md](VERIFICATION.md) for what has actually been checked.

## What the app does

- Saves the original message in browser storage before extraction starts.
- Saves extracted tasks in **My tasks**, with editable titles, dates, and times.
  Messages without saved tasks remain available in **Saved messages**.
- Supports open, due, undated, and completed task lists, deletion with undo,
  and a JSON backup export.
- Uses Firebase AI Logic runtime calls with structured response validation,
  exact source-evidence checks, and inference-source verification.
- Checks local-model availability for the message's language before using
  **On-device AI**. A readiness check is not proof that inference will work.
- Provides a clearly labelled non-AI basic helper and an explicit cloud option.
  Cloud requests require consent for the current text; other tasks are excluded.
- Displays a monthly calendar for tasks explicitly marked with a separate
  calendar date and optional time.

Local availability checks stop waiting after 8 seconds. AI requests have a
45-second application deadline and **Stop and keep message**. Stopped or
superseded results cannot save tasks. Stopping cannot recall text already sent
to cloud AI. Empty results leave the original available for retry.

Routine capture does not call model-download initialization. On-device AI
requires a model already prepared in compatible Chrome. Chrome manages model
installation and lifetime; this app does not bypass device requirements.

## Firebase developer setup

1. Create or select a Firebase project and register a Web app.
2. Enable the Gemini Developer API provider in Firebase AI Logic.
3. Register the Web app in Firebase App Check and enforce App Check for AI Logic.
   Use a reCAPTCHA Enterprise score-based site key for the hosted website.
4. Configure `.env.local` using `.env.example`. Restart Vite after changes.
5. For localhost development only, register an App Check debug token in Firebase
   and keep it in the ignored `.env.local`. Never publish or deploy that token.

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Public Firebase Web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Authentication domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_APP_ID` | Registered Firebase Web app ID |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Public Firebase Web configuration, when present |
| `VITE_FIREBASE_STORAGE_BUCKET` | Public Firebase Web configuration, when present |
| `VITE_APPCHECK_SITE_KEY` | Public reCAPTCHA Enterprise site key registered in App Check |
| `VITE_FIREBASE_CLOUD_MODEL` | Supported cloud model; default `gemini-3.5-flash-lite` |
| `VITE_GOOGLE_SIGN_IN_ENABLED` | Set `true` after configuring Google sign-in |
| `VITE_GOOGLE_CLIENT_ID` | Optional legacy Calendar OAuth route when Firebase sign-in is disabled |
| `VITE_APPCHECK_DEBUG_TOKEN` | Local development only; omit from Vercel |

Variables beginning with `VITE_` are compiled into browser assets. Firebase Web
configuration and OAuth client IDs are public identifiers; storing them as env
variables does not make them secret. Do not add service-account keys, OAuth
client secrets, private API credentials, or real messages to this repository or
to browser-exposed variables. The localhost debug token is excluded from
production builds and data exports.

Cloud AI was previously verified with synthetic Thai and English messages.
The configured model must be available in your Firebase project. On-device
Gemini Nano 4 inference has **not been verified**. The current local-to-cloud
fallback is an explicit user choice, with per-message consent; it is not an
automatic routing claim. The basic helper cannot substitute for the required
on-device AI implementation. A compatible-device run remains necessary before
claiming the competition's Web requirement is demonstrated.

Language declarations follow the source message. An English interface does not
make Thai input supported by an English-only local model. Ambiguous dates and
unspecified times remain for review instead of becoming invented appointments.

Firebase references:

- [Hybrid inference on the Web](https://firebase.google.com/docs/ai-logic/hybrid/web/get-started)
- [Hybrid configuration](https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options)
- [Structured output](https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output)

## Deploy on Vercel

Import this repository as a Vite project. The build command is `npm run build`
and the output directory is `dist`. Set the public Firebase configuration,
`VITE_APPCHECK_SITE_KEY`, cloud model, and Google sign-in flag in the Vercel
project's environment variables. **Do not copy `VITE_APPCHECK_DEBUG_TOKEN`.**
These Vite values are read at build time; redeploy after changing them.

For the final production hostname:

1. Allow the hostname on the reCAPTCHA Enterprise website key and register that
   key for the Firebase Web app in App Check.
2. Add the hostname to Firebase Authentication's **Authorized domains**.
3. Confirm the Google OAuth configuration permits the intended app domains and
   Firebase auth handler. Enable Google Calendar API for optional Calendar sync.
4. Confirm the production URL is accessible without Vercel team login so judges
   can open it. Verify hosted sign-in and App Check on that exact hostname.

Configure Preview separately if needed. A production domain configuration does
not automatically authorize every generated preview hostname. Keep developer
tokens out of previews as well as production.

## Google sign-in and Calendar

Enable Google's sign-in provider in Firebase Authentication before setting
`VITE_GOOGLE_SIGN_IN_ENABLED=true`. The welcome screen offers sign-in with or
without Calendar access. Calendar access can also be connected later. Enable
Google Calendar API in the corresponding Google Cloud project. Its OAuth
consent configuration may require test users or verification for Calendar
permissions. Do not ask judges to bypass an OAuth warning.

**Add to Calendar** or **Mark in Calendar** saves only to this app's calendar.
**Sync with Google Calendar** previews the marked tasks and identifies the
connected account before **Sync now** sends anything. Timed marks become
30-minute events; dates without a time become all-day events. Sync uses stable
event IDs, can update events previously created by this sync, reports per-task
failures, and does not delete remote events or pull Google events into the app.
Edits and completion do not sync automatically. Calendar tokens remain in memory;
reconnect after a reload or token expiry. Local tasks stay saved if permission is
denied or an API call fails.

References: [Firebase Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
and [Calendar authorization](https://developers.google.com/workspace/calendar/api/auth).

## Storage, privacy, and limits

Tasks, originals, and drafts live in this browser origin's `localStorage`, not
Firestore. Google sign-in does not sync or isolate task data by account. Anyone
using the same browser profile and origin can see the same tasks. Storage is not
encrypted; use care on shared computers. No clipboard is read automatically.

Localhost, `127.0.0.1`, and the deployed website have separate storage. Existing
local tasks do not appear automatically on the deployed website. Clearing site
data removes the saved items, so export a JSON backup first. Backup import,
cross-device sync, two-way Calendar sync, and full offline/PWA installation are
not implemented.

Both AI and basic extraction need human review. Structural validation and exact
source evidence cannot guarantee that a suggested action or date is correct.
Displayed extraction time is the actual request duration, not a guaranteed
performance target.

## Submission status

Remaining work includes a verified Gemini Nano 4 run through Firebase AI Logic
on compatible hardware, hosted Firebase/App Check and sign-in checks, a real
Google Calendar sync check with an authorized test account, and a public YouTube
demo of at most 3 minutes in English or with English subtitles. No hackathon
submission has been made by this app.

[Competition rules](https://firebasehybridaihackathon.devpost.com/rules).
Original brand and image assets, provenance, and third-party notices are in
`public/brand`, `public/images`, and `public/fonts-license.txt`.

## License

[Apache License 2.0](LICENSE).
