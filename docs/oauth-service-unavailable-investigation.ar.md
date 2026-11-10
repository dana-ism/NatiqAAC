# تشخيص تعذّر Google وFacebook

التاريخ: 2026-11-10. تحقيق للقراءة فقط؛ لم يُعدّل كود المصادقة أو ملف البيئة، ولم يُستخدم حساب حقيقي لإتمام تفويض خارجي.

## النتيجة المؤكدة

المزودان يفشلان **محليًا عند بدء العملية**، قبل فتح صفحة تفويض Google أو Facebook. الأزرار ليست روابط شكلية: ترسل `POST http://localhost:3000/auth/oauth/start` من التطبيق الفعلي `http://127.0.0.1:5173`، فيرد NestJS بـ503:

```json
{"message":"Identity provider unavailable","error":"Service Unavailable","statusCode":503}
```

النص المعروض فعليًا: «الخدمة غير متاحة مؤقتًا. يرجى المحاولة لاحقًا.» وهو النص العام لترجمة HTTP 503، لا رسالة قادمة من Google أو Meta.

فحص `backend/.env` الخاص في الشجرة الأصلية وجد المتغيرات أدناه **غير موجودة**، لا مجرد قيم خاطئة. استُخدم ConfigService وOAuthProviderService المترجمان مع الإعدادات نفسها؛ أعاد `isConfigured` القيمة false لكليهما. لم تُطبع قيم أسرار أو credentials.

## Google: السبب والمسار

مفقود: `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` و`GOOGLE_REDIRECT_URI`. الدالة `OAuthProviderService.settings('GOOGLE')` ترفض نقص أي منها بـServiceUnavailableException. يصل إليها التنفيذ عبر:

1. [SocialButtons.start](../web/src/features/account/SocialButtons.tsx): popup فارغة، verifier/challenge في الذاكرة، ثم طلب start. لا feature flag يمنع الطلب.
2. [request / errorMessage](../web/src/shared/api.ts): fetch فعلي، ثم ApiError(503)، وترجمة `error.unavailable` عبر ErrorAlert.
3. [OAuthController.start](../backend/src/auth/oauth.controller.ts): يتحقق من PUBLIC_WEB_ORIGIN ثم يستدعي flow.start.
4. [OAuthFlowService.startTransaction](../backend/src/auth/oauth-flow.service.ts): createAuthorization أولًا، ثم حفظ state في Redis.
5. [OAuthProviderService.settings/createAuthorization](../backend/src/auth/oauth-provider.service.ts): الاستثناء هنا قبل إنشاء URL وقبل كتابة state.

لذلك لا code exchange ولا ID-token validation ولا قراءة AuthIdentity أو ربط حساب أو إرسال بريد في الحالات الست. لا دليل على خلل في الحسابات أو callback أو audience أو consent screen؛ لم يصل التنفيذ إليها. مفتاح Gmail لإرسال البريد لا يعوّض OAuth client secret.

## Facebook: السبب والمسار

مفقود: `FACEBOOK_APP_ID` و`FACEBOOK_APP_SECRET` و`FACEBOOK_REDIRECT_URI` و`FACEBOOK_GRAPH_VERSION`. يتطلب `settings('FACEBOOK')` أيضًا نسخة بشكل `v<digits>.<digits>`. يفشل نفس المسار محليًا قبل بناء `facebook.com/<version>/dialog/oauth`؛ لا طلب Graph أو debug_token أو profile ولا تفويض خارجي.

ليس مثبتًا أن Meta أوقفت التطبيق أو أن وضع Live/Development أو email permission خاطئ. تلك إعدادات خارجية لا يمكن الحكم عليها دون لوحة التطبيق، ولم أطلب بيانات دخولها أو أغيّرها.

## أدلة المتصفح الفعلي

استُخدم Edge/Playwright مع API المحلي الحقيقي، دون mock لطلبات البدء. رُوعيت مهلة 5 طلبات/دقيقة. مُنع أي طلب HTTPS خارجي احترازيًا؛ لم ينتج أصلًا URL تفويض من الخادم. لا تسجيل لـchallenge أو verifier أو state أو code أو token، ولا traces أو screenshots حساسة.

| الصفحة | المزود | intent / role | HTTP | موضع الفشل | وصل للمزود |
| --- | --- | --- | --- | --- | --- |
| `/login` | Google | login | 503 | إعداد المزود قبل Redis | لا |
| `/login` | Facebook | login | 503 | إعداد المزود قبل Redis | لا |
| `/register/parent` | Google | register / PARENT | 503 | إعداد المزود قبل Redis | لا |
| `/register/parent` | Facebook | register / PARENT | 503 | إعداد المزود قبل Redis | لا |
| `/register/specialist` | Google | register / SPECIALIST | 503 | إعداد المزود قبل Redis | لا |
| `/register/specialist` | Facebook | register / SPECIALIST | 503 | إعداد المزود قبل Redis | لا |

الرد JSON والنص العربي أعلاه ظهرا في كل حالة. سجل المتصفح: resource HTTP 503 فقط، بلا pageerror. CORS سمح بالأصل في الحالات الست. فحص OPTIONS أعاد204 مع الأصل الصحيح على الباك3000، ومع أصل المعاينة5190 على الباك3001. الجذر أعاد200 على كليهما، والمسار الإداري الجديد رفض anonymous بـ401.

## استبعاد أسباب أخرى ضمن حدود الدليل

| العامل | ما تحقق | الاستنتاج |
| --- | --- | --- |
| route مسجل | POST start أعاد503 JSON من الخدمة | ليس404/مسارًا مفقودًا |
| اتصال الباك وCORS | الطلب والرد والنص العربي وصلوا، OPTIONS204 | ليس سبب الفشل الحالي |
| PUBLIC_WEB_ORIGIN | موجود وصالح ويطابق5173 في الإعداد الأصلي | لم يفشل فحص الأصل؛ المعاينة تضبط5190 داخل process فقط |
| Redis | PING → PONG، قراءة فقط | متاح وقت الفحص، والفشل يسبقه أصلًا |
| PostgreSQL | اتصال وSELECT metadata فقط | متاح؛ لا كتابة على بيانات المستخدمين |
| الترحيلات | init_users وauth_account_v2 مكتملتان، غير rolled back | لا ترحيل ناقص ظاهر يفسر start503 |
| جداول V2 | auth_identities/email_verifications/specialist_applications موجودة | لا غياب لهذه الجداول؛ لم تُفحص كل بياناتها |
| الفرع | كود Auth قائم في القاعدة المتوافقة، لا تعديل عليه بهذه المهمة | لا دليل على كسر OAuth من تصميم الإدارة |
| Cloud/Meta console | غير متاحة، لا تفويض خارجي | إعدادات consent/app mode/domains/permissions غير مفحوصة |

الدليل المنقح القابل للمراجعة في [oauth-diagnosis.json](evidence/admin-v2/oauth-diagnosis.json). لا يثبت PING أو metadata نجاح OAuth كاملًا؛ يثبتان فقط حالة البنية عند الفحص.

## إجراءات المالك اللازمة

1. اختر زوج تشغيل متناسقًا. التطبيق الأصلي: web5173/API3000؛ معاينة التصميم: web5190/API3001. لا تخلط عنوان API أو callback أو أصل popup بينهما.
2. في Google Cloud، افتح Google Auth Platform لمشروعك، وأكمل Branding/Audience، ثم أنشئ أو استخدم Client من نوع **Web application**. أضف Authorized redirect URI مطابقًا تمامًا: `http://localhost:3000/auth/oauth/google/callback` للأصل، أو `http://localhost:3001/auth/oauth/google/callback` للمعاينة. إذا أردت الزوجين فأضف كليهما لنفس العميل واضبط backend المستخدم على المقابل. هذه callback خادم وليست صفحة React. تفاصيل إنشاء العميل والمطابقة في [وثيقة Google الرسمية](https://developers.google.com/identity/protocols/oauth2/web-server).
3. خزّن القيم الثلاث المطلوبة في ملف البيئة الخاص بالباك فقط. لا تضع client secret في VITE أو Git. راجع Audience وقيود المؤسسة/الاختبار حسب مشروعك. الكود يطلب `openid email profile` فقط؛ [وثيقة حالات Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview) تذكر استثناء النطاقات الأساسية من شرط قائمة test users، لذلك لا نجزم أن غياب test user سبب مشكلة هنا.
4. في Meta Developers، استخدم تطبيق Facebook Login للويب الخاص بك، واضبط Facebook Login/use case وValid OAuth Redirect URIs على callback المطابقة: `http://localhost:3000/auth/oauth/facebook/callback` أو3001 حسب الباك. خذ App ID وApp Secret، ونسخة Graph مدعومة ظاهرة في إعدادات تطبيقك؛ لا تختَر نسخة عشوائية لمجرد اجتياز regex. خزّن المتغيرات الأربعة الخاصة في backend فقط. راجع قيود app roles/mode وpublic_profile,email في حساب Meta قبل التجربة. لم نتحقق من لوحة Meta أو حاجتها إلى review؛ [الدليل الرسمي للتدفق](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) و[أوضاع التطبيق](https://developers.facebook.com/docs/development/build-and-test/app-modes/) أعادا429 لأداة التصفح، لذا تُراجع أسماء الخيارات والنسخة المدعومة من لوحة المالك.
5. طابق `PUBLIC_WEB_ORIGIN` مع أصل React الفعلي، و`WEB_CORS_ORIGINS` معه، و`VITE_API_BASE_URL` مع الباك المختار، ثم أعد تشغيل الباك والويب. ConfigModule يقرأ البيئة عند بدء process؛ لا يكفي حفظ الملف مع process قديم. لا تغيّر state/PKCE/nonce أو postMessage origin لتجاوز خطأ إعداد.
6. افحص أولًا أن start يعيد200 وauthorizationUrl للمضيف الرسمي، دون نسخ URL بكامل query إلى logs. بعدها فقط، بتفويض المالك وحساب اختبار، أكمل Google وFacebook في login وتسجيل Parent وSpecialist، واختبر callback/finish/الجلسة والتحقق/أهلية المختص. تفعيل الإعداد وحده لا يثبت اكتمال التدفق.

لم أعدل ملف البيئة أو أفعّل مزودًا بهذه المهمة التشخيصية. إعداد Client/App يتطلب حساب مالك Google Cloud/Meta. لا ترسل الأسرار في المحادثة.

## التشغيل والفحص اليدوي في Windows

المعاينة تعمل حاليًا على `http://127.0.0.1:5190/login` مع API3001. أوامر البناء وتشغيل checkout جديد في [دليل الإدارة](admin-experience-v2.md#verification-and-windows-preview). جهّز الإعداد الخاص محليًا قبل التشغيل؛ لا تنسخ ملف env إلى Git.

Redis الحالي أعادPONG؛ لا داعي لإنشاء خادم بديل أو تغيير REDIS_URL. لفحص الحاوية القائمة دون كشف URL أو password:

```powershell
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
# الحاوية القائمة التي فُحصت في هذه البيئة:
docker exec natiqaac-redis redis-cli PING
# إذا كانت هذه الحاوية الموجودة متوقفة لاحقًا فقط:
docker start natiqaac-redis
```

إذا كانت Redis خارج Docker، استخدم وسيلة تشغيلها المعتمدة وconfig الخاص الموجود؛ لم يُثبت التحقيق حاجة إلى تغيير البنية. فحوص E2E تستعمل الحاويات المعزولة فقط، ولا تستعمل قاعدة Supabase كfixture.

في Chrome/Edge افتح DevTools → Network، ثم إحدى الصفحات الثلاث واضغط مزودًا واحدًا. سجّل status وmessage العامين فقط. انتظر مهلة الحماية إن ظهر429. بعد إعداد المزود، لا تصدّر HAR أو URLs تحتوي state/code/token. افتح Console لفحص CORS، ثم أكمل التفويض بحساب اختبار مصرح به فقط.

| متطلب التحقيق | الحالة |
| --- | --- |
| إعادة إنتاج ست حالات على التطبيق الحقيقي | PASS |
| تحديد مسار frontend/backend وسبب503 | PASS |
| فحص إعدادات دون كشف أسرار | PASS |
| فحص Redis والترحيلات للقراءة فقط | PASS |
| الحفاظ على كود المصادقة والجلسات | PASS |
| إعدادات لوحة Google/Meta | NOT TESTED |
| نجاح OAuth بعد التفعيل | BLOCKED — إعداد Client/App مفقود |
| تعديل OAuth أو account linking أو المخطط | NOT IMPLEMENTED — خارج النطاق المصرح |
