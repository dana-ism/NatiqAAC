# NatiqAAC Web — Authentication

React + TypeScript + Vite client, created alongside the planned Flutter client in `frontend/`. Implemented scope includes parent registration, login, current identity, protected home, local sign-out and Admin Portal V1 at `/admin`. See [Admin architecture, API and verification](../docs/admin.md). No child profiles, specialist registration, refresh tokens or management modules are implemented.

## Start locally

Use Node 24.15+ (verified on 24.22) and the committed npm lockfile. On Windows use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
cd web
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Set `VITE_API_BASE_URL` in `.env.local` to the public NestJS API URL; restart Vite after changing it. Only HTTP on loopback hosts or HTTPS is accepted. A URL may include an API prefix, but no credentials, query or fragment. Never expose JWT signing keys, PostgreSQL or Redis URLs through `VITE_` variables. Vite embeds public configuration in the browser bundle.

`npm.cmd run dev` serves `http://127.0.0.1:5173`. In **backend/.env** (or its runtime environment), set the following public CORS configuration, then restart NestJS:

```dotenv
WEB_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173
```

The API URL may remain `http://localhost:3000`: CORS must allow the **page origin**, not the API's own URL. `127.0.0.1` and `localhost` are separate origins. Neither `.env.example` file is loaded automatically; preserve existing secrets when adding this one variable to the backend environment. CORS stays disabled when the variable is absent, even if NestJS starts successfully. Restart Vite after changing `web/.env.local` and restart NestJS after changing `backend/.env`.

If a connection error remains, first check `http://localhost:3000/`, then inspect the browser's OPTIONS request: `Access-Control-Allow-Origin` must equal the displayed Vite origin. A running API or an OPTIONS 204 alone does not prove browser access. Do not retry registration blindly after a network error: the server may have processed a request whose response was blocked. HTTP 401/429/503 are shown separately when CORS makes their responses readable. Never diagnose credentials from a fetch/CORS error. The frontend uses no proxy or browser-security workaround. Production hosting must serve `index.html` for `/login`, `/register` and `/home` and use HTTPS. No hosting/deployment is configured here.

## Structure and contracts

- `src/app`: routes and page title/focus updates.
- `src/features/auth`: DTO-shaped requests, response guards, session provider, forms, protected identity page, validation and component/API tests.
- `src/shared`: HTTP error handling, layout, form feedback, SVG decoration and provisional CSS tokens.
- `src/i18n`: typed Arabic/English resources, locale provider, translation hook and shared language switcher.
- `tests`: Playwright browser flows and opt-in isolated real API smoke test.

| Endpoint              | Request                         | Success                                                                       |
| --------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| `POST /auth/register` | `{ fullName, email, password }` | 201: `{ message, user: { id, fullName, email, role, status, createdAt } }`    |
| `POST /auth/login`    | `{ email, password }`           | 200: `{ message, access_token, user: { id, fullName, email, role, status } }` |
| `GET /auth/me`        | Bearer authorization header     | 200: `{ userId, email, role }`                                                |

Name is trimmed; email is trimmed/lowercased. Password is preserved exactly and checked for 8–72 Unicode code points and at most 72 UTF-8 bytes. The browser's lightweight email check is usability validation; backend DTOs remain authoritative. Registration sends no role/status. Safe localized messages cover 400/401/403/409/429/503, unexpected replies, configuration and network failures. Raw server messages are not rendered. Retry information comes only from `Retry-After` (seconds/date) or the account-lock response; no countdown is fabricated. Requests have a 15-second client timeout and do not automatically retry registration or login.

## Session and security decisions

The access token is held in a private provider ref, not in localStorage, sessionStorage, cookies, URLs or logs. Components receive identity and operations, not the token. Every login must pass the real `/auth/me` check before protected identity is shown. Missing session redirects to login. Transient identity-check errors hide protected content and offer explicit retry; 401/403 clear the session. Tab visibility changes reverify identity. Local expiry is scheduled from JWT `exp` and checked again on resume; decoding claims is **not signature verification**. The backend verifies the token and current user status.

A page refresh, closing the tab or opening another tab starts without a session. There is no persistent login or refresh-token flow. Memory-only storage reduces persistence after browser closure but does not make tokens immune to XSS: malicious scripts in the active page can still act as the user. Avoid unsafe HTML and third-party scripts; deployment CSP/security headers remain a separate reviewed concern. Local sign-out drops the active frontend session and does not revoke the JWT on the server. Frontend route guards provide UX only; backend authorization is essential. Persistent sessions require a separate approved backend design.

## Visual foundation and accessibility

The `:root` CSS variables in `src/shared/styles.css` are **provisional, authentication-only tokens**, not official NatiqAAC branding. Primary teal `#176B68`, ink `#21363D`, pale surface `#F7FAF8`, mint `#DDF3EE`, and a decorative warm accent form the theme. Accent colors are not used as low-contrast body text. Arabic uses locally available Tahoma/Segoe UI/Arial: no external font requests or font binaries. SVG artwork is original code decoration, hidden from assistive technology, and illustrates communication without representing working AAC controls.

The document uses `lang=ar dir=rtl` or `lang=en dir=ltr`; layout uses logical spacing and isolated LTR email fields. The original illustration and logo are not mirrored; only directional action arrows change direction. Forms use persistent labels, autocomplete, linked validation messages, focus on the first invalid field, live feedback, keyboard-operated visibility buttons and visible focus. Route changes move focus to content; language changes retain the switcher's focus. Layout covers phone/tablet/desktop, reduced-motion preferences and reflow. Automated axe checks target applicable WCAG AA rules; they do not replace manual screen-reader or full WCAG assessment.

## Arabic and English

Arabic is the default regardless of browser language. A single reusable keyboard-accessible switcher offers `العربية` and `English` on every page, with native-language labels and a pressed state. Switching updates existing content, validation errors, service errors, session notices, document title, description and `html` language/direction without reloading, clearing form fields, or repeating authentication requests.

The small internal implementation uses React context and centralized flat, namespaced keys in `src/i18n/ar.ts` and `en.ts`; no i18n dependency is needed for these two static locales. Arabic defines the typed key set and English must satisfy the same complete schema. Missing/empty entries fall back to Arabic; unknown runtime keys receive a safe generic message, never a raw key. `Retry-After` uses parameter substitution and distinguishes English singular/plural seconds. Validation and session notices retain translation keys rather than frozen display strings. Resource copy is rendered as React text, never HTML.

Only an explicit language selection is saved under `natiqaac.locale` in localStorage. Only `ar` and `en` are accepted; missing/invalid values default to Arabic. Blocked reads/writes are handled without crashing, although persistence then cannot be guaranteed. The choice survives navigation and reload; authentication does not. JWTs, identity and credentials remain out of browser storage. No cross-tab synchronization or browser-language detection is implemented. To add a future locale, add a typed resource and update the locale union, preference validation, switcher, direction mapping and tests together.

## Verification

The authenticated welcome page shows only the email, readable role, and a signed-in status; it does not imply verified email ownership or expose the account UUID. Its primary action scrolls to the honest Coming Soon section and focuses its heading, with immediate scrolling for reduced motion. Sign-out remains local to this browser session. Welcome-specific styling preserves the original illustration and leaves the login/register presentation unchanged. Browser coverage includes keyboard scrolling, illustration separation, long email reflow, and a 200% CSS zoom layout stress check; this does not replace manual browser zoom or screen-reader testing.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run format:check
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
```

Vitest/Testing Library tests use controlled `fetch` responses and no databases. They test field validation, UTF-8 limits, password visibility, loading, accepted DTO fields, success/errors, retry, `/auth/me`, protected routes, expiry, reload/remount and local sign-out. Playwright tests use controlled browser network responses, axe, responsive screenshots and an idle expiry flow. The configured browser uses installed Windows Edge when available; otherwise Playwright Chromium must already be installed. No Playwright MCP connection is assumed. Browser artifacts under `test-results/` are ignored.

The real API test is skipped by default. It requires operator inspection of the dedicated authentication containers, the isolation variables/guards from `../docs/authentication.md`, and a separately started test-only NestJS process at `localhost:3100` with `NODE_ENV=test`, isolated URLs, a synthetic JWT key, and `WEB_CORS_ORIGINS=http://localhost:5173`. It needs the reviewed existing migrations already applied; it never applies migrations. Set `NATIQ_WEB_REAL_API=YES` only after inspection and run `npm.cmd run test:browser -- tests/real.browser.spec.ts`. It creates one random synthetic parent and cleans only that ID/email through Prisma on the validated test database. Never use development or production endpoints. Backend CORS HTTP tests run via `npm.cmd run test:http -- --runInBand` in `backend/`, with no external infrastructure.

While a developer's Vite is already using 5173, set `NATIQ_WEB_TEST_ORIGIN=http://127.0.0.1:5183` for a separate Playwright-owned Vite instance. Add that exact origin only to the isolated backend's CORS environment; this test-only override never changes the developer's `.env.local`. The real test also verifies readable HTTP 401/429, unauthenticated routes and cleanup of only its synthetic account-lock keys. HTTP 503 and transport failure rendering are tested with controlled browser responses/aborts, without interrupting Redis. For explicit pre-fix reproduction only, start the isolated backend without WEB_CORS_ORIGINS and set NATIQ_WEB_EXPECT_CORS_BLOCK=YES; the test asserts the real OPTIONS 404 and the UI connection message. Normal test runs skip this reproduction case.

Known limits: network/CORS errors are indistinguishable to browser fetch and share a connection message. No password recovery or email verification is offered because no such backend endpoints exist. Production readiness, proxy-aware rate limiting, Redis recovery, CI and hosting remain separate reviews. See `../docs/authentication.md` for backend policies.
