# Admin frontend experience

The subsequent [Signature experience](admin-signature-experience.md) refines this
implementation. Its mobile modal drawer replaces the inline disclosure described
below; API contracts and authentication boundaries are preserved.

This feature builds on Authentication V2 at `1feb064`, not on an assumption that
the dependent Admin/Auth pull requests are already merged. The dedicated branch
is `feature/admin-frontend-experience`, based on `feature/auth-account-management-v2`.
No database schema, authentication mechanism, dependency or deployment is changed.

## Structure and trust boundaries

`features/admin/AdminLayout.tsx` owns the common sidebar, header, main landmark
and footer for both `/admin` and `/admin/specialist-applications`. The existing
App route/session checks remain in front of this layout. The layout validates
`GET /admin/overview` before rendering protected page content. Its safe account
projection passes through React Router's outlet context to the overview; no
second session provider or token store is introduced.

`AdminPage` owns the overview and pending-summary loading/error/retry state.
`AdminApplicationsPage` owns displayed-list search/status filters, application
details, private download and confirmation flows. The old account-feature export
is retained for compatibility; the implementation now lives in the Admin feature.
`AdminIcons` provides one small SVG stroke family. `admin.css` extends existing
brand tokens with scoped Admin surfaces, borders, spacing and semantic statuses.
Other authentication pages keep their existing styling.

Frontend route checks are usability controls. The NestJS JWT strategy continues
to validate signature/expiry and fetch the current database role, status and
admission state. Existing controller-level Admin guards protect every Admin API.
Browser components receive operations, not JWTs or Storage credentials.

## APIs and accurate counts

| Endpoint                                          | Purpose                     | Authorization / response                                                       |
| ------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------ |
| `GET /admin/overview`                             | Current account             | Existing ACTIVE ADMIN; `{account:{email,role:'ADMIN'}}`                        |
| `GET /admin/specialist-applications/summary`      | Full pending count          | Same existing Admin controller guards; `{pendingCount:number}`                 |
| `GET /admin/specialist-applications`              | Existing list               | Existing contract, at most 100 records                                         |
| `GET /admin/specialist-applications/:id`          | Existing application detail | Existing Admin contract                                                        |
| `GET /admin/specialist-applications/:id/document` | PDF attachment              | Existing private, backend-authorized download                                  |
| `POST .../:id/approve` / `.../:id/reject`         | Existing review decision    | Existing business rules; rejection requires a trimmed 10–1000-character reason |

The new summary is a single Prisma `count({where:{status:'PENDING_REVIEW'}})`
inside SpecialistService. A list capped at 100 cannot establish a global count,
which justifies this small additive endpoint. It returns no applicants or child
information, changes no existing response shape and requires no migration.
The summary literal route is registered before the existing UUID detail route.

Only PENDING_REVIEW counts as pending. Loading uses a neutral skeleton; an error
never becomes zero. Zero has a distinct empty message, and the review action
remains usable when the count is unavailable. A retry requests the count again.

The list contract remains capped at 100; the UI explicitly says that its search
and status filters cover displayed records only. It does not claim global search,
pagination, total users or platform analytics. The overview CTA selects pending
status through a public, non-sensitive query parameter. Successful review fetches
the actual list again; returning to the overview fetches the current summary.

## Interaction and data accuracy

Only Overview and Specialist Applications are active destinations. NavLink gives
one `aria-current="page"`, bold weight, a logical-side indicator and contrast.
The sidebar's icons and logout icon share the same SVG treatment. The account
card displays the real ADMIN role and projected email once, without a fabricated
email-verification or account-status badge: overview does not expose these fields.

The application table becomes a readable list of rows on narrow screens while
retaining header/caption semantics. Details show the real applicant, email,
specialization, qualification, optional summary, submission date, status,
document availability and review history. Raw enum names and internal identifiers
are not presented as user-facing data.

Document requests continue through SessionProvider's authenticated backend method.
The browser never constructs public Storage URLs; downloaded blobs receive a PDF
filename and object URLs are revoked. Missing documents and service failures are
explicit. Approval and rejection use in-page confirmation with applicant identity,
focus movement and a cancel action. A ref lock prevents duplicate mutation calls;
controls disable during pending work. Errors allow refreshing the selected detail,
including after a concurrent review. Aborted/unmounted detail loads do not update
the visible application. No approval, rejection or retention rule changes.

## Sessions, localization and accessibility

JWTs remain in memory only. There is no refresh endpoint or refresh-token cookie,
localStorage/sessionStorage token, CORS/CSRF change or server logout added here.
Refresh starts without a session by design, as the existing login guidance explains.
The repeated technical warning has been removed from the Admin overview. Session
expiry and identity revalidation continue through the original SessionProvider.
Persistent login would need a separately approved backend/session design.

Arabic/English use the existing typed dictionaries and locale persistence key.
The Admin language switcher uses scoped styling with one compact surface;
its button/keyboard semantics are unchanged. Logical CSS handles RTL/LTR for
navigation, borders, spacing and directional arrows. Email remains readable LTR.
Dates and the pending count use Intl formatting. No remote fonts/images are added.

At 900px and below, navigation is an inline disclosure, not an overlay or modal:
it pushes content without obscuring it and does not need a focus trap. It has
an expanded state, control relationship, Escape-to-close and return focus.
Details/decision headings receive focus; returning from a detail restores focus
to its list action where present. The shared skip link points to one main landmark.
Admin styles include select/textarea focus indicators, 44px action targets and
reduced-motion support. Status text accompanies color. No screen-reader or WCAG
certification is claimed from axe alone.

## Verification and evidence

See [Arabic delivery report](admin-frontend-delivery.ar.md) for actual counts,
before/after evidence, limits and the acceptance checklist. Screenshots use
intercepted synthetic API responses; displayed numbers are test fixtures, not
claimed live platform statistics. PostgreSQL integration separately proves that
the pending summary counts beyond the capped list and excludes other states.

Run the existing scripts from each component: web `test`, `typecheck`, `lint`,
`format:check`, `test:browser`, `build`; backend `test`, `test:http`, typecheck,
`lint`, `build`. Isolated `test:e2e` and `test:redis` require the inspected existing
test containers and explicit environment guards described in authentication.md.
Never point these fixtures at Supabase or run migrations/resets to test this UI.

The dedicated browser tests cover both locales at 320/375/768/1024/1440/1920,
full axe scans, navigation/Escape, search and filters, details, rejection reason,
single decision submission, storage of locale only and horizontal reflow.
Existing account/browser suites cover approval, downloads, logout and expiry.
Browser chrome zoom and manual screen readers remain distinct from CSS-zoom or
reflow simulations; report the actual verification method explicitly.

## Local Windows walkthrough

Use the new worktree; keep the original checkout and its untracked files intact.
Node and dependencies follow the existing package-lock files. Keep runtime secrets
in the ignored backend environment or process environment, never VITE_ variables.
Prepare backend `.env` privately from the team's existing reviewed configuration
if this is a fresh checkout. This feature needs no migration.

Backend terminal:

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-experience\backend
npm.cmd ci
npx.cmd prisma generate
$env:PORT = '3001'
$env:WEB_CORS_ORIGINS = 'http://127.0.0.1:5190'
npm.cmd run start:dev
```

Frontend terminal:

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC-admin-experience\web
npm.cmd ci
$env:VITE_API_BASE_URL = 'http://localhost:3001'
npm.cmd run dev -- --port 5190
```

Open `http://127.0.0.1:5190/login`, sign in using an existing authorized Admin,
check the overview count and review link, navigate to the list, use search and
status filters, and read an application. Do not make consequential decisions on
real accounts as a test. Exercise approval/rejection using isolated fixtures.
Switch languages, use Tab/Enter/Escape, resize and check browser zoom at 200%.
Logout and reload should require login again. There are no demo passwords or
production fixtures in source. Provider OAuth setup remains a separate Auth V2
dependency; this frontend work does not configure Google/Facebook applications.
