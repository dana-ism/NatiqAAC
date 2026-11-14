# Admin profile and personal account settings

Implementation branch: `feature/admin-profile-account-settings`, based on
`b49be9963c761aabef688424c6d26ef831bfdc18` (`feature/google-auth-flow-finalization`,
PR #11). This is a dependent change; the existing PR chain remains unmerged.
No separate PRD was found. The owner's attached Admin Profile request defines
the scope. `docs/architecture.md` retains its filename and approved architecture.
The two mentioned reference screenshots were not attached to the request file;
the implementation uses the existing Admin visual system and gallery.

## Implemented profile and account experience

The header uses the saved `User.fullName` fetched from the new own-account API,
not the name in a login response, email, token or local storage. Missing/blank or
email-shaped names use a localized neutral account label. The header shows the
name and the saved private photo, or branded initials/default avatar. Email and
role appear only inside the account menu, profile or settings. Personal photos
are optional and never gate authentication or other account functionality.

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

| Avatar endpoint                     | Contract                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------- |
| POST `/admin/profile/avatar`        | Multipart `avatar` + `expectedUpdatedAt`; one file, one field, 2 MiB; 5/min |
| GET `/admin/profile/avatar`         | Own canonical WebP; `private, no-store`, `nosniff`; 404 without a photo     |
| POST `/admin/profile/avatar/remove` | JSON `{expectedUpdatedAt}`; 5/min; returns saved profile                    |

Projection: `fullName`, `email`, `role: ADMIN`, `status: ACTIVE`, ISO `createdAt` and
`updatedAt`, `hasAvatar`, actual `emailVerified`, `passwordEnabled`, and `connectedProviders`
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

## Approved persistent-photo implementation

The owner approved the limited field/bucket/Sharp proposal on 2026-11-14 and
explicitly excluded applying it to actual Supabase or provisioning live buckets.
`User.avatarKey` maps to nullable `avatar_key`. The additive migration has no
backfill/default or account lifecycle changes. Prisma Client was regenerated with
the repository command; tracked generated files were not manually edited.

`sharp` 0.35.5 (Apache-2.0; Node >=20.9, compatible with the current Node 24 stack)
checks actual JPEG/PNG/WebP input, declared MIME agreement, decoded dimensions
<=4096 per side and <=16,777,216 pixels. SVG, unsupported/corrupt/animated images
are rejected. Pixels are decoded, oriented, resized to at most 512 per side and
encoded as static WebP with a processing timeout. EXIF/XMP/ICC are removed; original
files are not stored. Retrieval also validates bounded canonical WebP before
returning bytes. The frontend checks size/type/signature before a revocable local
preview; backend validation is authoritative.

`PrivateBucketStorage` extracts the existing private Supabase transport, with
HTTPS/origin validation, bounded responses, 10-second deadlines, redirect refusal
and exact private bucket metadata checks. Specialist PDF/gzip behavior, limits,
authorization and retention remain unchanged. Avatar storage requires the exact
separate `admin-profile-avatars` bucket and refuses a configuration shared with
the Specialist document bucket. No direct browser Storage access is used.

Keys are generated as `<own-user-uuid>/<random-v4-uuid>.webp`; filenames, submitted
IDs and arbitrary paths cannot select objects. Every mutation uses the existing
ACTIVE ADMIN guard and an atomic `updatedAt` compare-and-set. The old image stays
referenced until the new reference commits. Losing/failed writes clean their new
object; committed replacement/removal cleans only the previous own-avatar object.
A definite upload collision never deletes an existing object. Cleanup outages
produce a sanitized operator warning, never keys, credentials or provider errors.
There is no distributed transaction: a process crash or Storage outage can leave
an orphan requiring separately reviewed reconciliation. No broad purge is added.

The shared profile context downloads one authenticated Blob per saved version and
supplies it to the header, menu and profile. Object URLs are revoked on replacement
and unmount. Confirmed upload/removal updates the shared persisted projection;
failed or stale writes do not show false success. Retrieval failures show the
default avatar and a retry action. Name/photo edits share the version, so one
cannot silently overwrite a concurrent edit in another section or tab.

## Owner setup requiring separate approval

None of these steps were executed against the owner's actual Supabase:

1. Inspect the intended target and its migration history without printing secrets.
   Confirm existing migrations match the reviewed repository and only
   `20261114000100_admin_avatar` is pending. Preserve the existing verified TLS and
   private configuration workflow described in the [V2 migration guide](auth-account-v2-supabase-migration.md).
2. After explicit owner authorization, from `backend/` with the intended private
   `DIRECT_URL`/`DATABASE_URL` selected, run:

   ```powershell
   npm.cmd exec -- prisma migrate status
   npm.cmd exec -- prisma migrate deploy
   npm.cmd exec -- prisma migrate status
   npm.cmd exec -- prisma generate
   ```

   Pending status can exit 1 before deploy. Stop if any other pending/drift issue
   is found. The exact approved SQL is:

   ```sql
   ALTER TABLE "users" ADD COLUMN "avatar_key" TEXT;
   ```

   No backfill or user-row rewrite is required. Do not reset or resolve migration
   history to bypass discrepancies. Only the attested isolated test database on
   loopback port 55432 received this migration during development.

3. After separate bucket authorization, create `admin-profile-avatars` in the
   intended Supabase project: **Private**, file-size limit **2097152 bytes**, allowed
   MIME **image/webp**. Review Storage RLS so anon/client-authenticated roles receive
   no direct avatar access; do not add a public read policy. Do not alter the
   Specialist bucket. The application uses the existing backend-only service role.
4. Configure backend `ADMIN_AVATAR_BUCKET=admin-profile-avatars`, reusing the existing
   private `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Never expose these secrets
   through VITE variables. Only `.env.example` was updated, not the owner's `.env`.
5. Build and deploy/restart matching backend/frontend revisions **after migration**.
   Test with a separately authorized controlled account: upload, fresh login,
   replace, remove, failed/stale saves and unauthorized image requests. No real
   users/photos were automated test fixtures; no live Storage success is claimed.

Application rollback can retain the additive column and private objects; removing
the column or stored data needs separate authorization. A backup/forward-recovery
plan should accompany the owner's live deployment. See [AGENTS.md](../AGENTS.md).

Security design references: [OWASP file uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html),
[Sharp input limits](https://sharp.pixelplumbing.com/api-constructor/),
[Sharp output/metadata handling](https://sharp.pixelplumbing.com/api-output/),
[Supabase bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets).

## Local runtime condition

The existing API process at port 3000 still returns 404 for `/admin/profile`;
the web development server serves this branch. An automatic approval review
rejected the attempted local API restart with only “blocked by policy”. No process
was stopped and no alternative stop/restart was attempted. Do not restart/deploy
this build against the unmigrated owner database: Prisma Client now knows the new
column. After the separately approved migration/setup, an unauthenticated request
to the profile route should return 401 rather than 404. The existing local API was
not stopped or replaced during the isolated-avatar work. Isolated results do not
establish live-owner-account success.

See the [Arabic progress/delivery report](admin-profile-account-settings-delivery.ar.md)
and [synthetic browser gallery](assets/admin-profile/README.md). Real private image
Storage integration has not been tested, and no actual user images are test fixtures.
