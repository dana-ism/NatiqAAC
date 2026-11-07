# Authentication verification — 2026-11-07

Local branch: `feature/web-auth`, based on merged authentication at `ba6fdbc4e1eb218edef7b2e838a44c749c0088ea`. No commit, push or PR was created for this feature.

| Check                                      | Actual result                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Frontend TypeScript                        | PASS                                                                                                                     |
| Frontend ESLint                            | PASS, no warnings                                                                                                        |
| Frontend Prettier                          | PASS                                                                                                                     |
| Vitest                                     | PASS: 26 tests, comprising 22 form/session tests and 4 validation/API tests; controlled fetch responses                  |
| Production build                           | PASS                                                                                                                     |
| Playwright with controlled responses       | PASS: 4 tests; registration/login/current identity/sign-out at 375, 768 and 1440 pixels, plus short-lived session expiry |
| Axe checks                                 | PASS: no violations of the selected WCAG A/AA rules on login, registration and authenticated home at all three widths    |
| Real browser-to-backend smoke              | PASS: 1 opt-in Playwright test, with no mocked API responses                                                             |
| Backend HTTP tests                         | PASS: 32 tests (24 existing authentication cases and 8 CORS configuration cases); no external dependencies               |
| Backend TypeScript / lint / build          | PASS                                                                                                                     |
| Formatting of changed backend TS/test/docs | PASS                                                                                                                     |
| Tracked diff whitespace check              | PASS; existing LF-to-CRLF advisory only                                                                                  |

These results were collected in separate runs. During implementation, TypeScript issues, one lint warning, a test detecting unnecessary navigation after a rejected identity check, and transient formatting failures were corrected before the final passing checks. There is no unresolved failing check.

The real smoke used a temporary NestJS instance listening only at `127.0.0.1:3100`, with a synthetic JWT key, test-only environment URLs and the explicitly approved CORS configuration. Existing dedicated test containers were re-inspected for ownership labels, localhost bindings, isolated network and tmpfs storage, and passed readiness checks. The existing test migration was confirmed present; no migrations were applied. The browser created one random synthetic parent, logged in, retrieved `/auth/me`, verified that reload requires reauthentication, logged in again and signed out locally. Cleanup removed only that synthetic ID/email. Final checks found zero users in the test database and zero Redis test keys. The temporary backend and Playwright-owned frontend servers were stopped. Docker services were not stopped or changed; the development Redis container retained its original stopped state.

Screenshots are local ignored artifacts under `test-results/`, not source files. Playwright used the installed Windows Edge browser, without a Playwright MCP connection or browser download. No Safari, Firefox, manual screen-reader or exhaustive WCAG audit was run. English translation, persistent sessions, production hosting/security headers and production data integration were not implemented or verified. Passing checks do not establish production readiness.

## Local connection failure investigation — 2026-11-07

Confirmed the developer's Vite page origin was `http://127.0.0.1:5173` and its served API configuration was `http://localhost:3000`. The backend root responded 200 and development Redis answered PONG, but `WEB_CORS_ORIGINS` was absent from `backend/.env`. Live OPTIONS `/auth/login` returned 404 with no allow-origin/headers for either local web origin. A real Edge browser GET `/auth/me` with a synthetic invalid Bearer token failed with a CORS console diagnostic and `TypeError: Failed to fetch`, rather than exposing the HTTP 401. This probe did not use a personal account or write development data.

Added only the public `WEB_CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173` entry to the ignored local backend environment, preserving its previous bytes and secrets. Updated the example and instructions. Backend secure defaults, frontend error handling, token storage and authentication logic are unchanged. Existing backend processes must be restarted to reload the environment; source examples alone do not configure a running process.

Independent reproduction used the existing inspected isolated PostgreSQL/Redis services and a temporary loopback-only backend on 3100. With CORS unset, a Playwright test reproduced the actual UI connection error and observed OPTIONS 404. With explicit origins configured, preflights for both `127.0.0.1:5173` and `localhost:5173` returned 204 with matching allow-origin, Authorization/Content-Type, exposed Retry-After and no credential allowance; an unapproved origin received no allow-origin. Real browser flows ran on a separate `127.0.0.1:5183` Vite instance with its own explicitly allowed test origin, preserving the developer's existing server on 5173.

Latest debugging checks (separate runs):

- PASS: frontend 26 component/API tests; TypeScript, ESLint, Prettier and production build.
- PASS: backend 63 unit tests and 33 HTTP tests (including both local origins and missing-CORS preflight regression); TypeScript, lint, changed-file formatting and build.
- PASS: 8 controlled-response/abort browser tests covering responsive/accessibility flows, idle expiry and separate 401/429/503/network messages.
- PASS: 1 explicitly enabled pre-fix browser reproduction; the post-fix real flow is intentionally skipped in this mode.
- PASS: 1 post-fix real browser flow covering synthetic registration, readable incorrect-password 401, successful login and `/auth/me`, memory-only reload, local sign-out, unauthenticated route/endpoint, and actual account-lock 429. The pre-fix reproduction is intentionally skipped in this mode.

Only the synthetic test account and its identity-owned lock keys were deleted through validated test-only connections. Final isolated checks found zero users and zero Redis keys. No migrations or Docker lifecycle operations were run. HTTP 503 rendering used controlled responses and existing backend HTTP tests, not a deliberate outage of real Redis. Temporary test servers were stopped; the user's development services were left running. Local port 3000 initially still served the original process after the first reported restart, so live development confirmation was kept separate from the passing isolated flow.
