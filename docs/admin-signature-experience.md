# Signature Admin experience

The subsequent [Admin experience V2](admin-experience-v2.md) adds the owner's newly
approved future-section navigation and a read-only dashboard snapshot. This guide
describes the earlier two-section baseline; its security boundaries are preserved.

This presentation and interaction update depends on the existing Admin frontend
branch at `5169bc8`. It does not introduce a backend endpoint, package, schema,
migration, provider, or persistent session mechanism. The original implementation
and its trust boundaries remain documented in [the Admin guide](admin-frontend-experience.md).

## Design and component responsibilities

The overview gives the pending queue the largest surface, with a smaller account
panel and a three-step review guide. Warm neutral surfaces, the existing primary
teal, a restrained mint priority area and original speech geometry distinguish the
workspace. The SVG is decorative and never encodes a count, status or notification.
It is code-native, hidden from assistive technology, and reused in list empty states.
No raster generation or external font requests are needed. Arabic uses the existing
locally available Segoe UI/Tahoma family, larger labels and comfortable line height.

Admin tokens remain scoped to `.admin-shell`; shared authentication screens retain
their existing tokens. Supporting text uses a darker scoped muted token after axe
identified insufficient contrast on the mint background during development.
The existing icon family and established brand mark remain intact.

`AdminLayout` owns the common shell and account projection. `AdminPage` retains
the real pending-summary loading/error/retry states. `AdminApplicationsPage` owns
list, selected detail, filter, authenticated operations and the synchronous mutation
lock. `AdminApplicationDetails` is a presentation component: professional profile,
private document and review decision are distinct areas; the decision panel stays
nearby on larger screens and follows the document on small screens. It receives
callbacks, never JWTs. Success feedback is translated at render time so switching
language after a decision updates it immediately.

Search/status controls sit together. The result counter reports the filtered
length and loaded length only, explicitly alongside the existing 100-record cap.
Typing and filtering do not send requests. The global pending count still comes
from the protected summary endpoint; failures never become zero. A pending-only
filter remains selected after a decision, so a decided application disappears
from that view. Focus then falls back to the list heading. Clearing the filter
reveals the refreshed status.

The document panel shows PDF type, whether an attachment exists, and a private
download action. Original filename and byte size are unavailable in the existing
API and are not fabricated. Access still goes through SessionProvider to the
authorized NestJS attachment endpoint. Blob URLs are short-lived and revoked.
There is no inline PDF preview, public Storage link or client Storage credential.
409 decision conflicts offer detail refresh and display only the actual returned
history; there is no optimistic approval or invented audit entry.

## Mobile navigation and accessibility

At 900px and below, a compact brand bar opens a native modal `dialog`. This
replaces the previous inline navigation disclosure. The dialog makes the rest of
the page inert, supplies a backdrop, initially focuses Close and explicitly wraps
Tab/Shift+Tab between its controls. Escape, Close, outside click and route selection
close it and return focus to its trigger. Switching to desktop closes the dialog;
the desktop sidebar becomes available. The document stops scrolling behind an
open drawer. Both RTL and LTR use logical positioning; the brand motif is not mirrored.

The visible navigation has exactly one active destination, with text weight,
contrasting surface, indicator and `aria-current`. State labels include text in
addition to color. Existing skip links, landmarks, semantic table headers, decision
confirmations, rejection validation and reduced-motion preferences remain.

JWTs remain exclusively in the existing in-memory provider. Reload and new tabs
require authentication; login/session notices supply that context. No technical
session warning is reintroduced in the Admin footer. Persistent sessions would
need a separate reviewed architecture decision and are not implemented here.

## Evidence and local operation

See the [Arabic delivery report](admin-signature-delivery.ar.md) for actual tests,
failures, screenshot provenance, limitations and the requirement checklist.
Screenshots use synthetic intercepted API responses, not live account records.
The UI itself always calls the existing authenticated APIs outside tests.

Windows setup follows the component READMEs and existing lockfiles. Example for
an already privately configured backend (this feature needs no migration):

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-signature\backend
npm.cmd ci
npx.cmd prisma generate
$env:PORT = '3001'
$env:WEB_CORS_ORIGINS = 'http://127.0.0.1:5190'
npm.cmd run start:dev
```

In a second PowerShell terminal:

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-signature\web
npm.cmd ci
$env:VITE_API_BASE_URL = 'http://localhost:3001'
npm.cmd run dev -- --port 5190
```

Open `http://127.0.0.1:5190/login`. Do not start a duplicate process if the preview
is already running. The task preview reuses the existing backend on 3001 with mail
disabled in its process environment only. Private `.env` files are not copied into
the branch and must be prepared privately for a fresh checkout. No demo credentials
are committed. Never make real account decisions to test the interface.

From `web/` run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`,
`npm.cmd run format:check`, and `npm.cmd run build`. For browser tests set
`$env:NATIQ_WEB_TEST_ORIGIN = 'http://127.0.0.1:5187'` and run
`npm.cmd run test:browser`. PostgreSQL/Redis tests require the inspected isolated
containers and the guards described in authentication.md; no migration/reset is
part of these UI tests. The development workstation reused installed dependencies
through ignored local directory junctions; those junctions are not Git artifacts
and are not necessary for normal installation.
