# Authentication V2: providers, mail and account linking

## Implementation and external status

The NestJS modular monolith owns authentication, user records, provider identities,
verification and JWT issuance. React never receives Google/Facebook access or
refresh tokens. The existing application JWT remains in React memory.

Google, Facebook, transaction transport, account completion and callback handlers
have automated tests with mocked providers/Redis. These tests do not prove that a
real provider app is configured or that real login works. No real provider login,
sender authorization or real message delivery was performed during this work.
Local environment files are private and excluded from Git. Their presence does
not establish configured sender/provider credentials; real smoke tests remain required.
Keep production release blocked until the applicable owner configuration and
authorized controlled smoke tests below succeed.

The requested sender is `ydada1710@gmail.com`. This request is not proof of
ownership authorization or an existing working sender configuration. Mail remains
disabled unless `MAIL_ENABLED` is exactly `true` and the required credentials exist.

## Browser and provider security flow

1. React opens a popup from the user's click. It creates a random completion
   verifier and keeps it only in memory. It sends the SHA-256 base64url challenge
   to `POST /auth/oauth/start` with provider, login/registration intent and, for
   registration, PARENT or SPECIALIST.
2. The backend generates state, nonce and a Google S256 PKCE verifier. Redis holds
   the transaction for 600 seconds under a hashed state key. The callback URL is
   fixed backend configuration. Public input cannot assign ADMIN, application
   approval, email verification, an existing account ID or a linking intent.
3. `GET /auth/oauth/google/callback` or `/facebook/callback` consumes state
   atomically only when its stored provider matches. Google exchanges the code
   with its PKCE verifier and verifies the ID token using `google-auth-library`.
   Explicit checks require the expected nonce, audience, issuer, subject and
   unexpired expiration. Facebook exchanges the code server-side, inspects its
   token's app ID, subject and expiration, and binds the fetched profile ID to the
   inspected subject. Its profile request includes app-secret proof.
4. Redis stores the verified identity and original browser challenge for 120
   seconds. Callback HTML posts only a completion identifier to the exact
   `PUBLIC_WEB_ORIGIN`, with a nonce CSP, no-store and no-referrer headers. It never
   posts an application JWT or provider token. React checks both the backend origin
   and the exact popup window source.
5. `POST /auth/oauth/finish` submits the completion identifier and in-memory
   verifier. Redis compares its hash before atomic single-use consumption. Only
   then does account completion run and return a JSON session response. Pending
   verification/specialist approval receives an onboarding token, not ordinary
   platform access. Normal JWT authorization rechecks current database state.

Provider authorization codes necessarily arrive at backend callback URLs. Reverse
proxy/application access logging must redact callback query strings. Meta's
server-to-server token inspection requires `input_token` in its query; the
implementation never sends this URL to the browser or logs provider exceptions.
Provider HTTP redirects are rejected and requests have bounded timeouts.

Google identity uses provider plus `sub`, never email as an identity key. A trusted
Google email shortcut applies only to the same mailbox selected for the local
account: verified Gmail or verified hosted Workspace claims. A different supplied
mailbox, a third-party Google mailbox without hosted authority, and all Facebook
mailboxes require local email verification. Facebook email can be absent. The
browser registration completion screen can collect it; no fake address is created.
All registration providers collect missing name/email before consuming completion
proof, including Google accounts whose profile omits either field.
Specialists still require professional fields, a private document and Admin review.

The standard Facebook web adapter does not claim OIDC nonce or PKCE enforcement.
Its defenses are confidential code exchange, bound state, token inspection and
browser completion proof. Do not conflate it with iOS Limited Login.

## Account collisions and explicit linking

An existing provider/subject signs into its existing user without changing role.
An unknown subject using login must select registration. Matching email alone
never attaches a provider identity: a collision returns 409.

Authenticated clients can initiate explicit linking using
`POST /auth/oauth/link/start` with `{ provider, challenge }` and a valid application
or onboarding Bearer token. `AccountAccessGuard` derives the account ID from the
verified current account. The server stores that ID; it is never accepted in the
public DTO. Callback and finish use the same popup transport. Completion locks the
current ACTIVE account row while checking/creating its provider identity, so
suspension/deletion and linking serialize. Another user's identity or an already
connected different subject for the same provider returns 409. Linking does not
change password, role, verification or professional approval.

An already authenticated Admin may explicitly link an identity to their existing
account; this does not create an Admin or grant the role. Public registration
always permits only PARENT/SPECIALIST. The authenticated
`/account/connections` page exposes explicit linking through the same provider
popup with a protected start request and is linked from Home. The browser never
submits an account ID.
No unlinking or password-recovery workflow is implemented by these endpoints.

## Configuration names

Set runtime secrets through local ignored environment files or deployment secret
storage. Example files are documentation, not evidence that values were loaded.
Never put secrets in `VITE_*` variables, Git, PRs, issues or chat.

| Backend setting                            | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `PUBLIC_WEB_ORIGIN`                        | One exact trusted frontend origin for completion and verification links       |
| `WEB_CORS_ORIGINS`                         | Exact allowed browser origins, following existing CORS configuration          |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Web application credentials                                            |
| `GOOGLE_REDIRECT_URI`                      | Exact backend Google callback URI                                             |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`   | Meta app credentials                                                          |
| `FACEBOOK_REDIRECT_URI`                    | Exact backend Facebook callback URI                                           |
| `FACEBOOK_GRAPH_VERSION`                   | Explicit supported version such as `v<major>.<minor>`; no default             |
| `MAIL_ENABLED`                             | Keep `false` until sender configuration and controlled testing are authorized |
| `MAIL_FROM`                                | Authorized sending mailbox; requested mailbox noted above                     |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`   | Separate sender OAuth client credentials                                      |
| `GMAIL_REFRESH_TOKEN`                      | Offline sender authorization credential, backend only                         |

React uses `VITE_API_BASE_URL` for the backend origin. Deployed origins/callbacks
must use HTTPS. Backend validation permits HTTP only on explicit loopback hosts.
Provider acceptance of a development callback must also be checked independently.

## Owner checklist: Google Login

1. Choose a Google Cloud project and create an OAuth **Web application** client.
   Configure branding, audience, authorized domains and applicable test users.
2. Request only `openid email profile` for user login. Do not request Gmail access
   from Parents or Specialists to implement sign-in.
3. Register the exact backend callback, including scheme, host, port and path:
   `<backend-origin>/auth/oauth/google/callback`. For local Google testing, a
   registered `http://localhost:3000/auth/oauth/google/callback` is an example;
   use the actual configured backend port/origin rather than copying blindly.
4. Set the three Google settings locally, then set matching web origin, API base
   and CORS settings. Restart the processes that read these settings.
5. Perform authorized login/registration smoke tests with controlled accounts:
   cancellation, wrong callback configuration, Parent, Specialist and existing
   email collision. Confirm no ordinary access before required verification or
   specialist approval. Do not mark real Google Login PASS from mocked tests.

## Owner checklist: Facebook Login

1. In the actual Meta developer dashboard, select an eligible Facebook consumer
   Login use case. Verify current app availability, app requirements and intended
   audience for this project.
2. Configure site/app domains, exact web callback
   `<backend-origin>/auth/oauth/facebook/callback`, applicable privacy policy and
   data-deletion information, and permitted development/test accounts.
3. Verify `public_profile` and `email` access, development/live limitations, and any
   review/business verification requirements shown for that app. Email permission
   does not make returned email a trustworthy verified-mailbox assertion.
4. Select a currently supported Graph version in the dashboard and set
   `FACEBOOK_GRAPH_VERSION` explicitly. Set app ID/secret/callback securely.
5. Verify confidential code exchange and token inspection against that version.
   Smoke-test cancellation, omitted email, local verification, collisions,
   Parent/Specialist registration and token-subject binding with controlled users.
   Confirm eligibility for public users before switching live.

The official Meta documentation endpoints returned HTTP 429/inaccessible responses
during research. Current dashboard permissions, review requirements, API version
and real behavior were therefore not independently verified. These remain owner
release gates, not claims established by the implementation.

## Owner checklist: Gmail delivery

The owner requested the simpler Gmail App Password method. Select
`MAIL_TRANSPORT=gmail-smtp`, set `MAIL_FROM` to the sender's Gmail account and
store its 16-character App Password in `GMAIL_APP_PASSWORD` in `backend/.env`.
Keep `MAIL_ENABLED=false` until an authentication check and authorized controlled
delivery test. App Passwords require Google 2-Step Verification; the ordinary
account password is not accepted as configuration. Display grouping spaces in an
App Password are removed. Do not send the credential in chat, Git or logs.

Nodemailer implements SMTP to the fixed `smtp.gmail.com:465` endpoint using TLS
with certificate verification, bounded connection/socket timeouts and disabled
debug logging. Plain-text and HTML templates are reused; external-file/URL loading
is disabled. `GmailMailerService.verifyConnection()` authenticates without sending
a message or enabling the dispatcher. SMTP errors are sanitized and not blindly
retried; acceptance by Gmail still does not guarantee inbox delivery.

The existing OAuth Gmail API transport remains available as
`MAIL_TRANSPORT=gmail-api` (also the backward-compatible default when unset).
The following OAuth setup is optional when using an App Password. API `gmail.send`
is narrower than SMTP OAuth's full `mail.google.com` scope.

1. Confirm the owner authorizes sending from the requested mailbox. Enable Gmail
   API in the sender project and configure a sender OAuth client/consent setup.
2. Obtain owner consent for `https://www.googleapis.com/auth/gmail.send` with
   offline access using a controlled local authorization process and registered
   redirect. Keep its refresh token only in secure backend configuration.
3. Set `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` and the
   authorized `MAIL_FROM`. Do not use the owner's normal Gmail password or assume
   personal Gmail supports Workspace domain-wide delegation.
4. Keep `MAIL_ENABLED=false` while tests use mocks. After explicit authorization
   for a controlled inbox test, enable it and verify From identity, Arabic/English
   HTML/text, verification expiry, spam placement and resend behavior.
5. Plan sender reauthorization. Refresh tokens can expire/revoke; external Google
   apps in Testing generally receive seven-day refresh tokens for Gmail scopes.
   Production publishing/verification requirements depend on actual consent and
   scope configuration. Do not promise indefinite delivery.
6. Treat Gmail success as API acceptance, not guaranteed inbox delivery. Delivery
   records use ACCEPTED/FAILED/UNKNOWN; a timeout is not blindly retried because
   acceptance may already have occurred. Verification resend rotates its challenge;
   raw verification links cannot be recovered from database hashes. A bounded
   dispatcher retries at most 20 eligible PENDING/FAILED non-verification
   notifications every 30 seconds when sending is enabled, with no overlapping
   dispatch in the same process. UNKNOWN needs manual reconciliation and is not
   blindly resent. New social-account welcome/verification delivery intents are
   stored atomically with the user; only their event keys, never raw tokens, are
   retained.

No real third-party verification/welcome messages may be sent during testing
without configured sender authorization and explicit controlled-delivery approval.

## Primary references

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
- [Google backend identity and mailbox authority](https://developers.google.com/identity/sign-in/web/backend-auth)
- [Google OAuth2Client source and exact options](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts)
- [Google web-server authorization setup](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Gmail send API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send)
- [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Google App Password requirements](https://support.google.com/accounts/answer/185833)
- [Nodemailer SMTP transport](https://nodemailer.com/smtp)
- [Gmail SMTP OAuth scope requirements](https://developers.google.com/workspace/gmail/imap/xoauth2-protocol)
- [Google refresh-token lifetime and revocation](https://developers.google.com/identity/protocols/oauth2)
- [Meta manual Login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/)
- [Meta token debugging](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/debugging-and-error-handling/)
- [Meta email permission](https://developers.facebook.com/docs/permissions/reference/email/)

Meta links identify the official references for owner verification; their contents
were unavailable during this audit. Provider dashboard setup and real smoke tests
remain necessary even when code checks and mocks pass.
