# Backend

## Communications (Ably)

The communications API is mounted at `/api/communications`; every route requires the existing JWT `protect` middleware. Browser origins are allowlisted (credentialed CORS never uses `*`): the production frontend (`https://pixxtech-expense-tracker.vercel.app`), the active preview (`https://pixxtech-expense-tracker-fz2h.vercel.app`), and any exact origins in comma-separated `CORS_ORIGIN`. Configure `CORS_ORIGIN` in Vercel if deployments use other frontend origins. Disallowed origins receive no CORS permission; preflight requests are handled before database connection middleware.

Access is deliberately restricted to exactly two existing active users:

- `COMMUNICATION_ADMIN_EMAIL` must resolve to one `ADMIN` user (Khurshid Anwar).
- `COMMUNICATION_DATA_ENTRY_EMAIL` must resolve to one `DATA_ENTRY` user (Sarfraz).

Emails are trimmed and compared case-insensitively. Missing, duplicate, inactive, or incorrectly-role-mapped accounts disable the feature with a configuration error. There is no role-wide fallback. Configure `JWT_SECRET`, both email variables, `ABLY_API_KEY`, MongoDB, and Cloudinary credentials in the Vercel project's **Settings → Environment Variables** for each deployed environment. Authentication fails closed if `JWT_SECRET` is missing; there is no built-in fallback secret. Never put real credentials in `.env.example`, source control, frontend build variables, or client requests. The Ably secret is only used server-side to issue channel-scoped subscribe-and-presence token requests and publish events.

MongoDB stores conversation messages, authenticated Cloudinary attachment metadata, call history, and fixed-window rate-limit counters. Ensure the MongoDB account can create indexes; unique indexes provide sender/client-message idempotency and prevent overlapping calls. Messages are persisted before their Ably event is published. If publishing fails after persistence, the API returns a retryable error; retrying the same message `clientMessageId` reuses the stored record.

Images (JPEG/PNG/WEBP/GIF, maximum 10 MB) and audio (MP3/M4A/AAC/WAV/OGG/WEBM, maximum 20 MB) are uploaded to Cloudinary as authenticated assets. API responses do not include Cloudinary public IDs or permanent public URLs. The attachment URL endpoint returns a short-lived signed private-download URL after participant authorization. Vercel's request body-size limits may be lower than these application-level upload limits; confirm limits for the selected Vercel runtime/plan before relying on the largest uploads.

Optional TURN settings: configure all of `TURN_URLS` (comma-separated `turn:`/`turns:` URLs or a JSON string array), `TURN_USERNAME`, and `TURN_CREDENTIAL`. The temporary ICE configuration is returned only to the two authorized participants. If none are configured, bootstrap supplies a public STUN-only fallback; this does not relay media and calls may fail on restrictive NATs/firewalls. Set up a production TURN provider for reliable connectivity.

Vercel deployment: set the Vercel project Root Directory to `Backend`, with `Backend/vercel.json` and `Backend/package.json` as the deployment configuration and dependency manifest. The Backend lockfile includes `ably`, which is statically imported by the deployed API function and must be installed from this root. Configure all production credentials in Vercel Environment Variables; never commit `.env` or real credential values. The preview frontend origin above is allowed by the backend CORS policy.

Vercel serverless functions use a read-only deployment filesystem. Backup ZIPs are written under the function's temporary directory, which is ephemeral and may not be available to another invocation. Configure durable object storage before relying on backup history or download links across function restarts.

Focused tests: run `npm test` from the `Backend` directory. They use no live MongoDB, Cloudinary, or Ably credentials.
