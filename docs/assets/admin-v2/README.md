# Admin V2 screenshot evidence

56 actual browser captures. All account/application data shown is **synthetic**,
provided by isolated intercepted APIs. These are actual React screenshots, not
image-generated mockups or evidence of live Supabase records/decisions.

- `before-*`: 14 baseline captures from `ac54af8` before implementation.
- `after-*`: 34 final captures after V2, Settings, future module foundations and
  the real-data-shaped specialist preview were implemented.
- `zoom-*`: 8 viewport captures at native browser zoom200%, isolated Edge profiles,
  DPR2, CSS zoom1 and visualViewport.scale1; captured directly through CDP.

Normal captures cover Arabic and English at375px and1440px. The automated browser
suite separately checks320/375/768/1024/1440/1920 and all five future routes at200%.
Native zoom captures are viewports; scrollable content remains available below.

| Page | Arabic desktop | Arabic mobile | English desktop | English mobile |
| --- | --- | --- | --- | --- |
| Overview | [AR](after-ar-1440-overview.png) | [AR](after-ar-375-overview.png) | [EN](after-en-1440-overview.png) | [EN](after-en-375-overview.png) |
| Specialist requests | [AR](after-ar-1440-applications.png) | [AR](after-ar-375-applications.png) | [EN](after-en-1440-applications.png) | [EN](after-en-375-applications.png) |
| Review details | [AR](after-ar-1440-details.png) | [AR](after-ar-375-details.png) | [EN](after-en-1440-details.png) | [EN](after-en-375-details.png) |
| User management | [AR](after-ar-1440-coming-soon.png) | [AR](after-ar-375-coming-soon.png) | [EN](after-en-1440-coming-soon.png) | [EN](after-en-375-coming-soon.png) |
| Content studio | [AR](after-ar-1440-content.png) | [AR](after-ar-375-content.png) | [EN](after-en-1440-content.png) | [EN](after-en-375-content.png) |
| Admin management | [AR](after-ar-1440-admins.png) | [AR](after-ar-375-admins.png) | [EN](after-en-1440-admins.png) | [EN](after-en-375-admins.png) |
| Settings | [AR](after-ar-1440-settings.png) | [AR](after-ar-375-settings.png) | [EN](after-en-1440-settings.png) | [EN](after-en-375-settings.png) |
| Audit logs | [AR](after-ar-1440-audit-logs.png) | [AR](after-ar-375-audit-logs.png) | [EN](after-en-1440-audit-logs.png) | [EN](after-en-375-audit-logs.png) |

[Arabic mobile navigation](after-ar-375-navigation.png),
[English mobile navigation](after-en-375-navigation.png),
[baseline Arabic overview](before-ar-1440-overview.png),
[native200% Arabic](zoom-ar-overview.png),
[native200% English](zoom-en-overview.png).

See the [Arabic delivery report](../../admin-experience-v2-delivery.ar.md) for
test results, missing live checks and the feature-by-feature readiness table.
