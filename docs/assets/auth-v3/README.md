# صور المصادقة وتهيئة الحساب V3

جميع الصور من المتصفح المحلي ببيانات اصطناعية وواجهات API محاكاة؛ لا تثبت تشغيل
المزوّدين أو وصول البريد الحقيقي. لا رموز جلسات أو بيانات أطفال أو PDF حقيقي.
تشغّل `web/tests/auth-v3.browser.spec.ts` الحالات الأساسية وaxe و200% native zoom،
ويضيف `account.browser.spec.ts` نجاح التسجيل والتأكيد، و
`auth-v3-cross-device.browser.spec.ts` التأكيد من سياق متصفح مستقل.

العروض المختبرة: 320 و375 و768 و1024 و1440. الصور المحفوظة عند375 و1440 بالعربية
والإنجليزية؛ صور المزوّد والتأكيد من جهاز آخر عند375. تخفي الصور أثر تركيز رابط
التخطي الذي قد يتركه axe؛ يبقى الرابط نفسه متاحًا بلوحة المفاتيح.

| الحالة                              | العربية                                     | English                                      |
| ----------------------------------- | ------------------------------------------- | -------------------------------------------- |
| تسجيل الدخول، هاتف                  | [صورة](ar-375-login.png)                    | [Image](en-375-login.png)                    |
| اختيار الدور                        | [صورة](ar-375-roles.png)                    | [Image](en-375-roles.png)                    |
| ولي الأمر، هاتف                     | [صورة](ar-375-parent.png)                   | [Image](en-375-parent.png)                   |
| ولي الأمر،1440                      | [صورة](ar-1440-parent.png)                  | [Image](en-1440-parent.png)                  |
| الأخصائي: بيانات الحساب             | [صورة](ar-375-specialist-identity.png)      | [Image](en-375-specialist-identity.png)      |
| عدم تطابق كلمة المرور               | [صورة](ar-375-mismatch.png)                 | [Image](en-375-mismatch.png)                 |
| الأخصائي: البيانات المهنية وPDF     | [صورة](ar-375-specialist-professional.png)  | [Image](en-375-specialist-professional.png)  |
| البيانات المهنية،1440               | [صورة](ar-1440-specialist-professional.png) | [Image](en-1440-specialist-professional.png) |
| هوية Google دون حقول بريد/كلمة مرور | [صورة](ar-375-google-profile.png)           | [Image](en-375-google-profile.png)           |
| Facebook دون بريد من المزوّد        | [صورة](ar-375-facebook-profile.png)         | [Image](en-375-facebook-profile.png)         |
| تعارض Google                        | [صورة](ar-375-google-conflict.png)          | [Image](en-375-google-conflict.png)          |
| تعارض Facebook                      | [صورة](ar-375-facebook-conflict.png)        | [Image](en-375-facebook-conflict.png)        |
| انتظار التأكيد بعد التسجيل والتهدئة | [صورة](ar-375-registration-pending.png)     | [Image](en-375-registration-pending.png)     |
| انتظار التأكيد دون جلسة             | [صورة](ar-375-verification-pending.png)     | [Image](en-375-verification-pending.png)     |
| الفعل الصريح لاستهلاك الرابط        | [صورة](ar-375-verification-action.png)      | [Image](en-375-verification-action.png)      |
| رابط غير صالح/منتهٍ                 | [صورة](ar-375-verification-invalid.png)     | [Image](en-375-verification-invalid.png)     |
| تأكيد ناجح                          | [صورة](ar-375-verified.png)                 | [Image](en-375-verified.png)                 |
| التأكيد على الجهاز الآخر            | [صورة](ar-375-cross-device-confirmed.png)   | [Image](en-375-cross-device-confirmed.png)   |
| فحص الحالة على الجهاز الأصلي        | [صورة](ar-375-cross-device-original.png)    | [Image](en-375-cross-device-original.png)    |

تظل حالات الإدارة المصورة سابقًا في [Admin V2](../admin-v2/README.md) كما هي؛
أعيد اختبار وظائف الإدارة وأهليتها دون استبدال تلك الصور التاريخية.

حالات الأخصائي التالية إسقاطات اصطناعية لجلسة تهيئة محفوظة في الذاكرة بعد تغيّر
حالة قاعدة البيانات، مع axe. تسجيل دخول جديد بعد الموافقة يعطي الوصول العادي
في الخادم الحقيقي؛ تثبته اختبارات PostgreSQL، ولا تدّعي الصور خلاف ذلك.

| الحالة                             | العربية                                      | English                                       |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------- |
| طلب محفوظ بانتظار تأكيد البريد     | [صورة](ar-375-specialist-draft.png)          | [Image](en-375-specialist-draft.png)          |
| بانتظار مراجعة الإدارة             | [صورة](ar-375-specialist-pending-review.png) | [Image](en-375-specialist-pending-review.png) |
| موافقة مع دعوة لإعادة تسجيل الدخول | [صورة](ar-375-specialist-approved.png)       | [Image](en-375-specialist-approved.png)       |
| رفض مع السبب                       | [صورة](ar-375-specialist-rejected.png)       | [Image](en-375-specialist-rejected.png)       |
