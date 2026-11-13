# Google authentication and signup finalization

This approved follow-up extends authentication/onboarding V3, based on commit
`7230eaafaa9e2132efc788afb03fb42b79bd0a8f` and open PR #10. The new branch targets
`feature/auth-onboarding-ux-v3`, preserving its existing PR dependency chain.
No standalone PRD was found; the owner's finalization request and explicit
limited-contract approval define this scope. `docs/architecture.md` keeps its
existing filename and the approved architecture.

## Confirmed local failure

At the audit, the running development API returned **404** and
`Cannot POST /auth/oauth/context` for `POST /auth/oauth/context` with `{}`.
The same server returned DTO validation **400** on `/auth/oauth/finish`.
The checked-out V3 client already called the context endpoint, and checked-out
backend source already implemented it. Thus the running API was behind the
client. Shared HTTP handling displayed the generic Arabic request error, while
SocialButtons showed a linking hint for every failure. A context 404 occurs
before any account conflict check; it does not establish an existing email.

The known local Node API listener was fingerprinted and restarted using the
current backend build, preserving the owner's environment configuration.
The context endpoint now returns expected **400 validation** for `{}`; CORS
allows the canonical web origin. `http://127.0.0.1:5173/login` returns **200**.
This fixes the reproduced local mismatch. No historical OAuth attempt, live
provider identity or owner account row was inspected, so this is not a claim
about an uncorrelated historical signup failure.

## Approved contract and transitions

`POST /auth/oauth/finish` accepts optional `registrationRole: PARENT | SPECIALIST`.
It is valid only for an unlinked **Google** identity whose validated server-side
transaction began with **login**. Old clients omit it and retain their behavior.
Register transactions keep their start-bound role. Link transactions and Facebook
Login cannot use it. ADMIN and other values are rejected. A linked identity with
an injected selection is rejected without changing the account or issuing a
session; a fresh linked login without selection retains the stored role/status.

Role selection travels alongside the same completion identifier and browser
verifier. The existing Redis proof is consumed atomically before account work.
Context inspection neither consumes it nor extends its 120-second server TTL;
the browser cancels after 110 seconds. No new unsigned role state, token, cookie
or persistent browser storage is introduced. Wrong verifier, expired proof and
replay cannot create an account. Nested Prisma account/identity creation and
existing unique constraints prevent partial or duplicate registrations.

| Entry and validated identity                       | Result                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Login or Signup, linked identity                   | Direct login using existing role/status                                         |
| Parent Signup, new Google identity with name/email | Finish immediately; no completion form                                          |
| Login, new Google identity                         | Choose Parent/Specialist using the same short-lived transaction                 |
| New Parent with missing identity fields            | Ask only for missing name/email                                                 |
| New Specialist                                     | Display supplied identity, collect professional details and required PDF        |
| Existing email with unlinked identity              | 409 classified conflict; explicit existing-account sign-in and link             |
| Explicit link                                      | Fresh provider proof bound to authenticated initiating account; no role changes |

Google supplies no local password. Trusted Gmail or verified Workspace authority
skips local mailbox confirmation as before. Other mailboxes remain subject to
local verification; Google claiming `email_verified` alone does not change this
policy. Backend signature, issuer, audience, expiry, subject and nonce checks,
PKCE, state binding and provider transport protections are unchanged.

Specialists receive restricted onboarding sessions. A new application starts
as DRAFT. The client uploads the required PDF through the existing private
document endpoint and explicitly submits; only the existing server workflow can
move it to PENDING_REVIEW. Upload/submission failure sends the user to application
status for recovery. No Specialist becomes approved through Google; professional
information, accepted document, verification where required and Admin approval
remain enforced by the backend.

## Errors and account connections

Existing HTTP statuses/messages are preserved, with additive machine codes:
`OAUTH_EMAIL_CONFLICT`, `OAUTH_IDENTITY_CONFLICT`,
`OAUTH_PROVIDER_ALREADY_LINKED`, `OAUTH_REGISTRATION_REQUIRED` and
`OAUTH_TRANSACTION_INVALID`. The shared client parses a bounded code but never
displays raw backend/provider messages or identifiers.

Only a classified email conflict offers “Sign in to connect your account”. It
clears the unfinished flow and signs out locally before fresh existing-account
authentication. The sole allowlisted return destination is `/account/connections`.
The user then explicitly starts a new authenticated provider-link transaction;
matching email is never sufficient to link. The initiating account, not provider
email or a body user ID, owns the link. Existing fresh-session, suspension and
identity-uniqueness protections remain unchanged.

Context 404, expiry, identity conflict, rate limiting and transport errors have
appropriate messages without false email-conflict hints. Success confirmation
appears after successful finish and session adoption. The connections route stays
mounted during session revalidation; Login completion stays mounted through a
Specialist upload/submission. Starting another flow clears stale errors/success,
cancel/unmount removes listeners and timers, and consumed proofs require restart.

## Compatibility and operations

No schema, migration, backfill, dependency, provider configuration or session TTL
change. Read-only database metadata confirmed `users.password_hash` is nullable;
no owner user records were used as fixtures. No environment file, credential,
private storage setting, historical Admin screenshot or `opencode.json` is part
of this change. Flutter and FastAPI contracts are unaffected; existing finish
callers remain compatible. Deploy matching client/backend revisions together.
Rolling back this branch restores V3 without data conversion or deletion.

See the [Arabic delivery report](google-auth-flow-finalization-delivery.ar.md)
for exact verification results and [synthetic browser gallery](assets/google-auth-finalization/README.md).

Provider behavior was checked against
[Google backend identity/mailbox authority](https://developers.google.com/identity/sign-in/web/backend-auth),
[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect)
and [OWASP Authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
Automated provider substitutes do not prove live Google consent, provider console
settings, live inbox delivery or production private storage. Those need the owner's
authorized end-to-end release smoke test.
