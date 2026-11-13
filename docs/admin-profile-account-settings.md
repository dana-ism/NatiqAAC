# Admin profile and personal account settings

Implementation branch: `feature/admin-profile-account-settings`, based on
`b49be9963c761aabef688424c6d26ef831bfdc18` (`feature/google-auth-flow-finalization`,
PR #11). This is a dependent change; the existing PR chain remains unmerged.
No separate PRD was found. The owner's attached Admin Profile request defines
the scope. `docs/architecture.md` retains its filename and approved architecture.
The two mentioned reference screenshots were not attached to the request file;
the implementation uses the existing Admin visual system and gallery.

## Implemented without a schema change

The header uses the saved `User.fullName` fetched from the new own-account API,
not the name in a login response, email, token or local storage. Missing/blank or
email-shaped names use a localized neutral account label. The header shows the
name and a branded circular initials/default avatar. Email and role appear only
inside the account menu, profile or settings. There is no uploaded-photo control
or fake browser-only photo persistence in this stage.

The account menu opens on click or arrow keys, supports arrow/Home/End navigation,
closes on Escape/outside pointer/Tab/navigation, and restores trigger focus on
Escape. Links open Profile, personal Settings, Security and Language sections.
Log Out calls the existing local sign-out; JWTs remain memory-only. Language uses
the existing bilingual context and browser preference. Personal account settings
are distinct from future platform Settings and Admin management.

`/admin/profile` provides persisted display-name editing, validation, Save/Cancel,
duplicate submission prevention, errors and confirmed-save feedback. A successful
response updates the shared layout context, so header/menu/profile agree. Saves
use the returned `updatedAt` version. A stale edit returns 409 and requires reload;
the UI retains the unsaved draft until Cancel/reload. A monotonically advanced
write timestamp prevents same-millisecond lost updates.

`/admin/account-settings` shows actual role/status/creation/verification information,
browser language preference, local-password presence and connected provider enums.
Email and password changing remain honestly unavailable. Secure provider linking
opens the already implemented `/account/connections` flow; provider status is read
from `AuthIdentity`, not inferred from email. No password, hash or provider subject
is exposed. Linking does not grant roles and retains existing recent-authentication
and transaction requirements.

## Additive backend contracts

`AdminProfileController` uses the existing `JwtAuthGuard`, `RolesGuard` and ADMIN
metadata, plus Redis-backed throttling. Current database account status/role are
rechecked; the initiator is always derived from `request.user.userId`.

| Endpoint                   | Contract                                                                      |
| -------------------------- | ----------------------------------------------------------------------------- |
| GET `/admin/profile`       | Own profile projection; 30/min, `Cache-Control: no-store`                     |
| POST `/admin/profile/name` | `{fullName, expectedUpdatedAt}`; 10/min, 200 saved profile, 409 stale version |

Projection: `fullName`, `email`, `role: ADMIN`, `status: ACTIVE`, ISO `createdAt` and
`updatedAt`, actual `emailVerified`, `passwordEnabled`, and `connectedProviders`
containing only GOOGLE/FACEBOOK. The internal hash is selected only to compute
the boolean; it is never returned. There is no ID, object key, provider subject,
session token or child information in this response.

Name is trimmed, 1–100 characters, and rejects control/bidi override characters.
The version must be a canonical UTC ISO timestamp. DTO whitelisting rejects role,
status, email, password, owner ID and avatar-key injection. The update predicate
includes authenticated ID, ACTIVE, ADMIN and the expected version. Other Admins
cannot be selected through the endpoint. Existing `/admin/overview`, `/auth/me`,
authentication, specialist eligibility/review and document contracts are unchanged.
`AdminModule` imports the existing Prisma module rather than duplicating storage
or authentication providers.

## Required owner decision: persistent photos

**Not implemented or applied yet.** The request explicitly says:

> Request owner approval before changing database schema or storage security policy.

The pending, minimal proposal is:

1. Prisma Migrate adds nullable `User.avatarKey` mapped to `avatar_key`; existing rows
   remain null, with no backfill or changes to account lifecycle. Reuse `updatedAt`
   for concurrent name/avatar mutations. Apply/test on isolated PostgreSQL first.
2. A dedicated private Supabase bucket `admin-profile-avatars`, separate from
   Specialist qualifications. No public URLs or direct browser access policies;
   the backend retrieves the current Admin's stored key after authorization.
3. Add `sharp` for bounded JPEG/PNG/WebP decoding, metadata removal, resize and WebP
   re-encoding. Limit input to 2 MiB, bound decoded dimensions/pixels, reject SVG,
   malformed and unsupported/animated input. Extension or MIME alone is insufficient.
4. Generate immutable owner-prefixed UUID keys. On a failed DB compare-and-set,
   clean up the newly uploaded object. After replacement/removal commits, delete
   only the previous own-avatar object. Never delete Specialist files. A process
   crash or Storage outage can require explicit orphan reconciliation; do not
   claim cross-service atomicity or silently swallow cleanup failures.
5. Authenticated retrieval returns only sanitized image bytes with private/no-store
   caching. Owner IDs/keys/Storage credentials never enter public responses. Object
   URLs are revoked on replacement/unmount. Optional photos never gate sign-in.

This does not authorize applying a migration or provisioning a live/development
bucket automatically. Those operational steps remain separate owner setup. The
migration must precede deployment of code/Prisma Client that selects the new
column. Application rollback can retain the additive column and private objects;
dropping columns or deleting stored data would require explicit authorization.
Until approval, no schema, migration, dependency, bucket or Storage policy changes
are made. The owner's request (Phase 5) and
[repository approval rules](../AGENTS.md) govern this checkpoint.

Security design references: [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/),
[Sharp output/metadata handling](https://sharp.pixelplumbing.com/api-output/),
[Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

## Local runtime condition

The existing API process at port 3000 still returns 404 for `/admin/profile`;
the web development server serves this branch. An automatic approval review
rejected the attempted local API restart with only “blocked by policy”. No process
was stopped and no alternative stop/restart was attempted. The owner must restart
the existing development backend using the reviewed current build before trying
the new Admin pages on that environment. No migration is needed for this stage.
An unauthenticated request to the new profile route should then return 401 rather
than 404. This operational limitation does not turn isolated test results into a
claim about successful testing on the owner's live account.

See the [Arabic progress/delivery report](admin-profile-account-settings-delivery.ar.md)
and [synthetic browser gallery](assets/admin-profile/README.md). Real private image
Storage integration has not been tested, and no actual user images are test fixtures.
