# Admin experience V2

V3 eligibility update: all application reads, counts, details and PDFs now require
actual verified owner email. Legacy access exemptions are preserved for login,
not treated as mailbox evidence for review. See [V3](auth-onboarding-v3.md).

Based on `feature/admin-signature-experience` at `ac54af8`. The owner's V2 request
explicitly replaces hidden future navigation with clickable sections. The latest
request adds Settings and visual foundations for all five future modules. It
does not authorize future CRUD. React still calls the NestJS modular monolith;
there is no dependency, schema, migration, authentication or session-policy change.

## Navigation and responsibilities

| Route | Behavior |
| --- | --- |
| `/admin` | Greeting, global metrics, important alerts, newest submitted requests |
| `/admin/specialist-applications` | Existing bounded list, filters, details and decisions |
| `/admin/users` | User management Coming Soon |
| `/admin/content` | Content studio Coming Soon |
| `/admin/admins` | Admin management Coming Soon |
| `/admin/settings` | Working local language setting; other settings Coming Soon |
| `/admin/audit-logs` | Audit logs Coming Soon |

`admin-sections.ts` supplies routes, sidebar, breadcrumb and future copy.
`ComingSoonPage` renders a distinct title/description and a real Back to overview
link. `FutureModuleFoundation` supplies coherent, localized planned-capability
cards for each module, without fake records, metrics, searches or successful
mutations. Settings reuses the actual local LanguageSwitcher and explicitly marks
that control Available now; platform settings remain unavailable. It has no fake APIs or CRUD. Link names include their visible Coming soon
badges. Existing drawer focus wrap, Escape, outside click and resize handling stay.

`App` applies the existing session/role boundary to all seven routes. `AdminLayout`
still validates `/admin/overview` before displaying protected content. Role/email
moved to the header to preserve account context without disrupting the requested
overview order. No verification badge is inferred. Direct navigation in a logged-in
tab works. Refresh/new tabs lose the memory-only session; existing login lands an
Admin on Overview. AuthPage and persistent-session behavior are untouched.

`AdminPage` fetches one snapshot. `AdminOverviewSections` presents statistics,
alerts, a specialist verification preview and recent rows. The preview selects a
pending record among the actual newest five, or the newest record, and opens the
existing detail workflow. It never infers document availability or duplicates
approval/rejection. `admin.api.ts` validates nonnegative safe counts, coherent
totals and a bounded descending submitted list. Errors are unavailable states with
explicit retry, never zeros or fake empty data.

## Additive read-only API

`GET /admin/specialist-applications/dashboard` uses the existing controller's
JwtAuthGuard, RolesGuard, ADMIN metadata and throttling. Its literal route precedes
`:id`. Response: `{pendingCount, approvedCount, rejectedCount, totalCount,
recentApplications: ApplicationSummary[]}`. No old response changes.

One Prisma RepeatableRead transaction contains reads only:

1. Group applications with verified owner email by persisted status and count each group. Pending,
   approved and rejected metrics use those exact states. Total sums all groups,
   including DRAFT, explicitly explained in the UI. These are application counts,
   not counts of active or eligible specialists.
2. Select at most five verified-owner non-DRAFT applications with non-null submittedAt, ordered
   by submittedAt DESC then id DESC for stable ties. Return only the same safe
   applicant/professional projection already available in the old Admin list.

`/summary` remains pendingCount only. The old list still orders oldest first and
caps at 100; its search/filters remain local. Neither can supply four full-dataset
metrics and genuine recency, which justified this small explicitly allowed API.
Ship new frontend/backend together; an older API produces an honest error state.

Important Alerts has one condition: successful data with pendingCount > 0. Its
action opens the existing pending filter. Zero displays no review alerts. Loading
and failure are distinct. No storage/mail/security incidents are invented. The
backend still rechecks eligibility at decision time; pending is not an access grant.

## Review and document safety

Recent links use `?application=<id>` to load the existing authorized detail even
outside the old 100-row list. Replaced reads are aborted; an older read cannot
release a newer read's lock. Route reads never replace a decision/download in
flight. Back/success remove the query and restore row/heading focus. Failed links
offer detail retry. No automatic mutation or decision retry is added.

Existing approval/rejection endpoints, reason constraints, confirmations,
duplicate lock, conflicts, audits and eligibility rules stay. PDFs still use the
authorized attachment endpoint and revoked blob URLs. No public Storage URLs,
browser service-role keys, inline preview claims or retention changes. Dashboard
responses omit document keys/hashes, passwords, tokens and provider/mail secrets.

## Visual system

Admin-scoped tokens: dark teal `#194B49`, interactive `#176C69`, hover `#125653`,
clay `#B76E50`, accessible clay ink `#8A4C35`, clay surface `#F8EEE8`, background
`#F7F8F6`, white, ink `#203638`, muted `#526568`, soft teal `#E8F2EF`, border
`#DFE7E3`. Clay is a limited pending accent; cards are neutral. Existing semantic
approved/rejected badges stay. No purple, gradients, child imagery or remote fonts.

`AacCards` is original decorative SVG with sun/heart/speech cards, hidden from
assistive technology, not fake AAC controls. `admin-experience-v2.css` adds the
new composition; shared Admin CSS still supports review. Auth styles are unchanged.
Typed AR/EN dictionaries stay authoritative. `admin-format.ts` explicitly uses
Latin digits across Admin counts/dates/results/reason lengths, while date wording
remains ar-PS/en-GB. Body labels are at least 14px and hints 12px. Metrics reflow
to two columns; tables become readable mobile cards; content width stays bounded.

## Verification and Windows preview

See [the Arabic report](admin-experience-v2-delivery.ar.md) for actual checks,
failures, contrast, screenshot provenance and limitations. Screenshots intercept
synthetic APIs; separate PostgreSQL/Redis tests verify queries on inspected isolated
containers. Never use Supabase, real users or personal PDFs as test fixtures.

The separate [OAuth investigation](oauth-service-unavailable-investigation.ar.md)
records six real start requests, sanitized configuration presence and read-only
Redis/migration checks. Missing provider settings cause the current local503;
no OAuth/authentication code or private environment file was changed.

With privately prepared backend configuration, use separate PowerShell terminals.
Do not duplicate an already running preview. No migration is needed:

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-v2\backend
npm.cmd ci
npx.cmd prisma generate
$env:PORT = '3001'
$env:WEB_CORS_ORIGINS = 'http://127.0.0.1:5190'
$env:PUBLIC_WEB_ORIGIN = 'http://127.0.0.1:5190'
$env:MAIL_ENABLED = 'false'
npm.cmd run start:dev
```

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-v2\web
npm.cmd ci
$env:VITE_API_BASE_URL = 'http://localhost:3001'
npm.cmd run dev -- --port 5190
```

Open `http://127.0.0.1:5190/login`. No environment file is committed/copied. The
task preview reads private configuration in memory and disables mail only in its
process environment. Workstation-only ignored junctions reused installed lockfile
packages; `npm.cmd ci` is the portable setup, with no new package.

Web: `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`,
`npm.cmd run format:check`, `npm.cmd run build`. For Playwright set
`$env:NATIQ_WEB_TEST_ORIGIN = 'http://127.0.0.1:5187'`, then
`npm.cmd run test:browser`. Native 200% zoom uses isolated profiles and CDP
screenshots, not user settings or CSS/pinch zoom. Backend isolation guards and
commands remain documented in authentication.md.
