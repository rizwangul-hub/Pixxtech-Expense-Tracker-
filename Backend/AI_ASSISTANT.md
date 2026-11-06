# Pixx AI Finance Assistant — implementation and review

Reviewed and improved the existing `/api/ai/chat` implementation. The separate `/api/ai/finance-assistant` implementation was removed at the user's request. The Pakistan application, existing authentication, database, deployment configuration, and narration enhancement remain in use. The UK project was not edited.

## Architecture and implementation plan

The backend is Express 5 with Mongoose, mounted by `server.js` and exported through `api/index.js` for Vercel. Authentication uses `middleware/auth.js` (`protect`), JWT verification, active/deleted user checks and token versions. Role permissions are defined in that same module. All five existing roles currently have `VIEW_FINANCIALS`, including `DATA_ENTRY`, and the report routes grant organization-wide read access. The assistant preserves that policy; it does not infer privileges from people's names or accept a frontend role/user ID.

The frontend is React 19/Vite with Tailwind and Lucide icons. `App.jsx` switches sections using the browser path; `MainLayout.jsx` defines sidebar entries. `services/api.js` attaches the existing JWT and handles logout. Chat state is held in the authenticated app session, bounded to 40 displayed messages and six prior user questions. It is cleared when identity changes and is not persisted in browser storage. The previous shared session-storage key is removed.

Relevant records are Transaction, Account, Category, Property, RentalAgreement, RentReceived, RentDue and Payroll. Existing financial logic lives in `ledgerService.js`, `accountBalance.js`, `rentalCarryForwardService.js` and `salaryReportingService.js`. PendingEntry, Voucher and other staff records retain their existing workflows; the assistant does not mutate them. The existing rent-due synchronizer writes data, so it is deliberately not used by assistant tools.

The implementation plan was to preserve the existing UI and endpoint, enforce the existing financial permission, validate a fixed tool catalog, reuse report calculations, isolate conversation state, add backend-only provider configuration and distributed limits, then test and document the feature. API responses retain `{ success, message, ... }` conventions.

## Files

Feature files introduced by the combined implementation:

- `controllers/aiAssistantController.js`
- `middleware/aiRateLimit.js`
- `models/AssistantRateLimit.js`
- `services/ai/assistantSecurity.js`
- `services/ai/aiProvider.js`
- `services/ai/financialTools.js`
- `test/aiAssistant.test.js`
- `../Frontend/src/pages/AiFinanceAssistantPage.jsx`
- This document.

Existing files integrated or modified:

- `routes/aiRoutes.js`: authenticated chat and status endpoints with financial permission checks.
- `services/ledgerService.js`: optional bounded expense-date filters; existing callers retain monthly defaults.
- `services/rentalCarryForwardService.js`: optional `rentOnly` scope; existing callers retain their behavior.
- `package.json`: assistant tests included in `npm test`.
- `.env.example`: blank credentials and assistant configuration, disabled by default.
- `../Frontend/src/App.jsx`: permission-gated section and login-scoped conversation state.
- `../Frontend/src/layouts/MainLayout.jsx`: AI Finance Assistant navigation.
- `../Frontend/src/services/api.js`: chat/status requests, cancellation and request timeout.

No additional provider SDK or frontend dependency was added.

## Endpoints and security

- `POST /api/ai/chat`: `{ "message": "Total expenses this month", "history": [] }`. History may contain up to six `{ "role": "user", "content": "..." }` items. Questions and each history item are limited to 1,500 characters. Identity and arbitrary extra request fields are rejected.
- `GET /api/ai/status`: reports enablement/provider/model/configuration status without keys.
- Existing `POST /api/ai/enhance-narration` is preserved.

Both new endpoints require the existing JWT and `VIEW_FINANCIALS` permission. Chat is limited to 10 requests per authenticated user per fixed minute using atomic counters and a TTL index in the existing MongoDB database. Rate-limit storage failure returns 503; excess requests return 429. The financial tools are strictly read-only; only operational rate counters and existing authentication activity tracking are written.

Nine predefined tools cover expense, income, rent collection, outstanding rent, accounts, recent transactions, property summary, month comparison and salary summary. Tool names, argument keys, types, dates, identifiers, enums and limits are validated. Property name searches escape regular-expression metacharacters. No generated query, JavaScript, shell, filesystem operation or arbitrary URL is executed.

The provider selects tools only. Financial results are calculated and formatted by the backend; results are never sent back to the provider. Direct model text containing unsupported or invented figures is discarded. Tool calls are capped at four per question. Both provider adapters have a 20-second request timeout, header-based keys and sanitized errors. A failed/disabled provider does not silently return a different report through a keyword fallback. User questions themselves can contain sensitive information, so users should avoid including secrets in questions.

## Accuracy corrections made during review

- Expenses reuse the production classification and exclusion rules, including internal transfers, owner personal entries, reversals and voids.
- Salary payments use the existing Salary expense classification. Payroll commitment uses the actual `payrollMonth` and `netPayable` fields, rather than nonexistent fields. Payment-date spending and payroll-month commitment are labelled separately.
- Monthly date bounds use the application's Pakistan business calendar.
- Rent queries use an opt-in rent-income scope, preventing property expenses being counted as rent. Filtered property totals are calculated from the filtered properties.
- Income combines allocated rent with posted Other Income, following monthly reporting conventions. Property-linked other income is not automatically classified as rent.
- Live account balances reuse opening balance and debit/credit movement logic. Liquidity excludes suspense; `totalAllAccounts` includes it. Internal transfers cancel across the total. Account numbers are omitted.
- Monthly net surplus/deficit and comparison variances are computed on the backend.

## Local configuration

1. Open the existing `Backend/.env`; preserve its MongoDB, JWT and other settings. If it does not exist, copy `.env.example` to `.env` and configure the application's existing database and authentication settings first. Never overwrite an existing `.env` with the example.
2. Add these backend-only values:

   ```dotenv
   AI_ENABLED=true
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your-private-key
   AI_MODEL=your-enabled-function-calling-model-id
   ```

   For OpenAI set `AI_PROVIDER=openai`, `OPENAI_API_KEY=your-private-key` and an `AI_MODEL` available to your account that supports Chat Completions function calling. No model is hardcoded. Do not put any AI key in a `VITE_` variable.
3. From `Backend`, run `npm ci` if dependencies are missing, then `npm run dev`.
4. From `Frontend`, run `npm ci` if dependencies are missing, then `npm run dev`. Leave `VITE_API_URL` blank locally to use the existing Vite `/api` proxy.
5. Log in using an existing account, open **AI Finance Assistant**, and ask a suggested question. Verify the displayed period and compare a result against the corresponding existing report.

The example file contained a credential-like value before this work. It has been replaced with a blank placeholder. If that value was an active credential, rotate it through the provider console.

## Deployment steps

1. Review and commit the combined changes in the Pakistan repository through the normal project workflow.
2. In the existing backend Vercel project, keep Root Directory `Backend` and the existing `vercel.json`. Set `AI_PROVIDER`, `AI_MODEL`, `AI_ENABLED` and the selected provider key in **Settings → Environment Variables** for each intended environment. Preserve `MONGO_URI`, `JWT_SECRET`, CORS and other application settings.
3. Ensure the existing MongoDB application's user can create the AssistantRateLimit unique key and TTL indexes. If automatic index creation is disabled in production, use the deployment's normal index migration workflow to create `{ key: 1 }` unique and `{ resetAt: 1 }` with `expireAfterSeconds: 0` on the collection named by the `AssistantRateLimit` model. Do not create another database.
4. Deploy the backend through its existing Vercel Git deployment workflow. There is no financial-record migration.
5. Deploy the existing frontend project with Root Directory `Frontend`, build command `npm run build`, output `dist`, and its existing backend `VITE_API_URL`. No frontend AI credentials are needed. Preserve its existing SPA rewrite.
6. Log in, check `/api/ai/status` through the authenticated frontend, then verify one expense, rent, account and salary question against existing reports. Check an unauthorized/expired session is rejected. Set `AI_ENABLED=false` and redeploy/restart the backend to disable the assistant if necessary.

This session did not publish or deploy the application.

## Validation performed on 6 November 2026

- `Backend`: `node --test test/aiAssistant.test.js` passed 16 tests before the final monthly-net regression was added.
- `Backend`: final `npm test` passed **67/67**, including **17 assistant tests**. The suite includes the existing PDF export test. An earlier sandbox run failed to launch Chromium; the full suite passed outside the restricted sandbox. Localhost HTTP auth tests also require loopback access.
- `Frontend`: final `npm run build` passed. Vite reports the existing large bundle warning (about 1.69 MB uncompressed main JavaScript).
- `Frontend`: Vite SSR + React `renderToStaticMarkup` smoke check passed for the assistant page.
- Tests use mocked financial/model records and provider responses, plus a real localhost Express/JWT flow. No live provider request or production database reconciliation was performed. Legacy integration scripts requiring a live database were not run.
- No interactive mobile/browser visual QA was performed.

## Remaining limits

- The provider key and model require local/deployment configuration and a live smoke test. Supported model access is account-specific.
- Rent reporting inherits the existing active-agreement/carry-forward rules and historical exceptions. Rental reports are restricted to September 2026 onward; these are not immutable historical snapshots. Allocated rent differs from cash collected by receipt date. Existing report callers retain their previous broad rent-query behavior, so old report discrepancies should be investigated separately.
- Custom expense/salary date ranges must stay within one calendar month. Cross-month weekly ranges and unsupported filters return a limitation rather than silently dropping the filter. The provider may still misinterpret a natural-language question; report parameters are visible for review.
- English, Urdu and Hinglish questions depend on model understanding. Backend report labels and explanations are currently English.
- This application currently grants every defined role financial-view access. No new person-specific or record ownership policy was invented. Any tighter access policy needs a separate change to the existing authorization model.
- Some existing shared readers load many records and rental carry-forward iterates from September 2026. Large datasets may require future query/index optimization. Read-only tool projections and result row limits reduce unnecessary disclosure, but this is not a full performance redesign.
- Prompt injection cannot grant new capabilities: the model has only validated read tools, never financial writes or arbitrary execution. Intent interpretation is still model-dependent.

Provider references checked: [Gemini function calling](https://ai.google.dev/gemini-api/docs/function-calling) and [OpenAI Chat Completions](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create).
