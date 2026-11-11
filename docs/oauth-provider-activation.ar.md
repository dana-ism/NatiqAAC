# تفعيل Google وFacebook — سجل التحقق

2026-11-10. **التفعيل الخارجي غير مكتمل؛ ينتظر إعدادات المالك.** لا تعتبر اختبارات المزود البديل تسجيل دخول حقيقيًا عبر Google أو Meta.

## 1. النتيجة الحالية

أُعيد تشغيل الباك بعد تعطل اتصال حماية Redis القديم، وعاد الطلب إلى الوصول إلى طبقة إعداد المزود. المتغيرات السبعة الخاصة بالمزودين ما زالت غائبة في آخر فحص. أضيفت تغطية HTTP فعلية على PostgreSQL/Redis معزولين لدورة OAuth والحسابات. لم يُعدّل كود المصادقة أو الجلسات أو ملف البيئة، ولم يُنشأ حساب أو يُعتمد أخصائي على Supabase.

## 2. Git والبيئة

الفرع `feature/oauth-provider-activation` مبني على `feature/admin-experience-v2` عند `3f2a73ef5c92ace5b37c878cd64cd707908fc337`. سلسلة PRs المفحوصة: #4 → #5 → #6 → #7 → #8، وكلها غير مدمجة عند الفحص. الشجرة الأصلية على Auth عند `1feb064` وملف `opencode.json` غير متتبع محفوظ. العمل الجديد في worktree مستقل `C:\Users\user\Desktop\NatiqAAC-oauth`.

بيئة التفعيل المختارة هي التطبيق الأصلي `http://127.0.0.1:5173` مع `http://localhost:3000`. معاينة الإدارة5190/3001 محفوظة، ولم نخلط callback أو أصل popup بين البيئتين. مصدر OAuth وSocialButtons والجلسة في الشجرة الأصلية والقاعدة الأحدث متطابق بعد توحيد line endings.

## 3. Google: الفشل والسبب

قبل إعادة تشغيل الباك، عاد503 برسالة `Authentication protection is temporarily unavailable` من اتصال Redis القديم. اتصال مستقل بـRedis أعادPONG، لكن سياسة الخادم الحالية توقف client بعد انقطاع/مهلة ولا تعيد الاتصال تلقائيًا. بعد إعادة التشغيل، أصبح رد start503 هو `Identity provider unavailable`.

Google يفتقد `GOOGLE_CLIENT_ID` و`GOOGLE_CLIENT_SECRET` و`GOOGLE_REDIRECT_URI`. يفشل `OAuthProviderService.settings` قبل إنشاء عنوان التفويض أو تخزين state. ليس لدينا دليل على مشكلة consent screen أو redirect mismatch من Google؛ لم يصل الطلب للمزود.

## 4. Facebook: الفشل والسبب

نفس عائق Redis الأول، ثم نقص `FACEBOOK_APP_ID` و`FACEBOOK_APP_SECRET` و`FACEBOOK_REDIRECT_URI` و`FACEBOOK_GRAPH_VERSION`. بعد استعادة اتصال الخادم أعاد start503 من فحص إعداد المزود. لم يُطلب Facebook consent أو Graph exchange أو debug_token الحقيقي. لا استنتاج عن App Review أو mode أو permissions دون لوحة التطبيق.

## 5. إعداد Google Cloud

**BLOCKED بإعداد المالك.** لم تُنشأ أو تُعدّل OAuth clients في Google Cloud. اختار المالك تجهيز القيم في `C:\Users\user\Desktop\NatiqAAC\backend\.env` محليًا. أُرسلت له تعليمات فتح [Clients](https://console.cloud.google.com/auth/clients)، واختيار مشروع التطوير، وإكمال Branding/Audience، واستخدام عميل **Web application** موجود أو إنشائه إن لزم، وإضافة callback أدناه. لا طلب لكلمة مرور أو سر عبر المحادثة.

رُوجع [الدليل الرسمي لتطبيقات الخادم](https://developers.google.com/identity/protocols/oauth2/web-server): عميل ويب مع secret في الخادم، ومطابقة redirect URI، وسماح التطوير على localhost. الكود يطلب `openid email profile` فقط؛ لا صلاحيات Gmail من المستخدمين. راجع أيضًا [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect) للتحقق من الهوية.

## 6. إعداد Meta

**BLOCKED بإعداد المالك.** لا جلسة متصلة بـMeta Developers ولا App ID/Secret محليان. أُرسلت تعليمات اختيار تطبيق NatiqAAC وFacebook Login وإعداد callback وصلاحيات `public_profile,email` ومستخدمي الاختبار وفق لوحة التطبيق. لم تُغيّر أوضاع النشر أو الصلاحيات.

[تدفق Meta الرسمي](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/) و[سجل نسخ Graph](https://developers.facebook.com/docs/graph-api/changelog/) أعادا429 لأداة التصفح. لم نختر نسخة تخمينية، ولم نؤكد قبول HTTP localhost في تطبيق المالك. النسخة المدعومة وقبول callback يجب أن يؤكدهما dashboard. إذا تطلبت Meta HTTPS، تتوقف هذه الخطوة حتى اختيار عنوان تطوير آمن متوافق؛ لا تعطيل لـTLS أو نشر نفق خارجي تلقائي.

## 7. بيئة الباك

لم يُعدّل `.env`، ولم توضع بيانات بديلة. المتغيرات الحالية لـPUBLIC_WEB_ORIGIN وCORS متسقة مع5173، وVITE_API_BASE_URL يشير إلى3000. أعيد تشغيل process الباك فقط على3000 لاستعادة عميل Redis، دون تغيير سياسة إعادة الاتصال أو المنفذ. سجل التشغيل يستبعد stdout/stderr الخام والأسرار.

مفتاح Gmail App Password الخاص بإرسال البريد مستقل عن Google OAuth Client Secret وعن Meta App Secret. لا استبدال لإعداد البريد أو Storage أثناء تفعيل تسجيل الدخول.

## 8. ربط الفرونت

SocialButtons القائم يفتح popup من نقرة المستخدم، ويولد verifier في الذاكرة، ويرسل challenge وprovider وintent وrole العام المسموح. يبقى الربط حقيقيًا مع backend. لا JWT أو provider tokens في localStorage، ولا secret في VITE. لا تعديل لـReact أو i18n أو التنقل بهذه المهمة.

## 9. callbacks والأصول

| الإعداد | بيئة التطوير المختارة |
| --- | --- |
| React | `http://127.0.0.1:5173` |
| API | `http://localhost:3000` |
| PUBLIC_WEB_ORIGIN | `http://127.0.0.1:5173` |
| Google callback المطلوب تسجيله | `http://localhost:3000/auth/oauth/google/callback` |
| Facebook callback المرشح، رهين قبول Meta | `http://localhost:3000/auth/oauth/facebook/callback` |

كل من `localhost` و`127.0.0.1` أصل مختلف. يجب أن تطابق قيمة redirect المسجلة قيمة الخادم حرفيًا. صفحة React/login ليست callback. CORS وpostMessage لا يُوسّعان إلى wildcard لإصلاح خطأ إعداد.

## 10. نتائج Google

أعيد إنتاج login وتسجيل Parent وتسجيل Specialist في متصفح Edge فعلي على5173/3000. قبل إعادة التشغيل:503 حماية Redis في الحالات الثلاث؛ بعده:503 إعداد المزود. لا تفويض خارجي أو callback Google حقيقي أو تحقق ID token حي. **Google الفعلي BLOCKED.**

## 11. نتائج Facebook

أعيد إنتاج الحالات الثلاث نفسها فعليًا، بنفس انتقال سبب503. لم يصل أي طلب إلى Facebook. نسخة Graph وإعداد التطبيق والأذونات غير متحقق منها في لوحة المالك. **Facebook الفعلي BLOCKED.**

## 12. تسجيل أولياء الأمور

الاختبار المعزول يمر عبر DTO/start/Redis/callback/finish/Prisma، ويثبت إنشاء Parent بهوية provider/subject وكلمة مرور null وlegacy exemption=false. Google البديل يعطي assertion موثوقًا اصطناعيًا، وFacebook البديل لا يعطي بريدًا؛ يقدّم الاختبار بريدًا اصطناعيًا ثم يستهلك رابط التحقق من mail adapter المحلي. لا إرسال بريد فعلي. هذا تحقق من lifecycle وليس إثباتًا للمزود الخارجي.

## 13. تسجيل الأخصائيين

نفس transport الحقيقي محليًا مع معلومات مهنية مطلوبة. يبقى الطلب DRAFT بلا مستند أو submittedAt، والجلسة onboarding حتى بعد التحقق من البريد. يرفض `/auth/me` وAdmin token المختص غير المعتمد. لا مستندات حقيقية ولا تجاوز لمراجعة المسؤول.

## 14. الدخول والحساب الموجود

لكل من المزودين والدورين يبدأ الاختبار دورة login جديدة، ويثبت رجوع نفس user ID والدور وعدم زيادة حسابات البريد إلى أكثر من واحد. unknown subject مع login يرجع409 ولا ينشئ حسابًا. matching email وحده لا يربط identity، ولا تُغيّر هوية حساب موجود لتجاوز التصادم.

## 15. الأدوار والحالات

ADMIN في public registration أو intent=link عام مرفوضان400. حقن role/status/linkUserId في finish يُرفض قبل استهلاك proof؛ الطلب الصحيح اللاحق ينشئ Parent فقط. Parent لا يدخلAdmin، والمختص غير المعتمد لا يحصل على access_token. لا دور جديد أو تغيير لسياسة الإعفاء القديمة.

## 16. الأمان

اختبار التكامل الجديد يثبت S256 بين verifier/challenge المخزنين فعليًا، وTTL محدودًا للحالة، ورفض callback لمزود خاطئ مع حفظ الحالة الصحيحة، ورفض browser proof خاطئ دون استهلاك الصحيح، ونجاح واحد فقط للـcallback/finish المتزامنين وإعادة الاستخدام، وحد5 طلبات start بالدقيقة على Redis المعزول.

كود التشغيل القائم يفوض توقيع Google إلى google-auth-library ويضيف فحوص issuer/audience/expiry/nonce/subject. Facebook يفحص app ID والهوية والصلاحية عبر debug_token ويربط profile بالsubject ويستخدم appsecret_proof. اختبارات transport الخارجي هنا بديلة، واختبارات الوحدات تفحص الاستدعاءات والرفض؛ لا ادعاء بتحقق توقيع/توكن حي دون تفويض مزود فعلي. callback يعيد completion فقط إلى الأصل الثابت معCSP/no-store/no-referrer، وReact يقيد origin ومصدر popup. لا تغيير لهذه الحمايات.

## 17. قاعدة البيانات والعزل

استُخدم SELECT metadata فقط على قاعدة التطوير: ترحيلا init_users وauth_account_v2 مكتملان، وجداول identities/verification/applications موجودة. Redis التطوير أعادPONG. لا تعديل schema أو migration أو حساب تطوير.

حاويتا الاختبار كانتا متوقفتين؛ فُحص الاسم والملصق ومنافذ loopback55432/56379 وtmpfs وعدم وجود bind/volume مشترك، ثم شُغلتا وطُبقت الترحيلات القائمة على PostgreSQL المعزول فقط. لا reset/drop/FLUSH. الاختبار يزيل عناوين بريد مفردة مولدة بـrun UUID ومفاتيح Redis التي يملكها هذا التشغيل فقط.

## 18. الفحوص الفعلية

| الفحص | النتيجة |
| --- | --- |
| Backend unit | PASS:385،23 suites |
| HTTP الحالي | PASS:49،2 suites |
| E2E بعد إضافة OAuth | PASS:27،5 suites؛ المزود الخارجي/DNS/mail بدائل اختبار |
| Redis | PASS:21 |
| React | PASS:112،6 ملفات |
| Playwright شامل | PASS:66 و2 skipped opt-in؛ ليس OAuth حيًا |
| TypeScript/lint/build | PASS للباك والويب؛ وفُحص ملف الاختبار الجديد أيضًا |
| Prettier للويب والاختبار الجديد | PASS |
| Prettier العام للباك | FAIL قديم في5 ملفات غير معدلة |
| Google/Meta حقيقيان | BLOCKED:الإعدادات وجلسات الاختبار المصرح بها غير متاحة |

أول تشغيل في worktree الجديد فشل في4 حالات لأن عنوان fixture تجاوز حد local-part للبريد، وفي اختبار bootstrap قائم لغياب build في الشجرة الجديدة. قُصّر جزء العنوان الاصطناعي وبُني الباك؛ لم يُضعف DTO. الجولة التالية نجحت27/27. تحذير sort في الاختبار صُحح بمقارن عددي. فشل البداية العام لاختبارات العزل كان رفضًا صحيحًا للحاويات المتوقفة؛ شُغلت بعد تحقق الملكية والعزل.

ملفات التنسيق القديمة: auth/account-access.guard.ts، auth/auth.controller.spec.ts، auth/guards/jwt-auth.guard.ts، prisma/prisma.module.ts، prisma/prisma.service.ts. لم تُعدّل لإخفاء فشل غير متعلق بالمهمة.

## 19. الملفات

- `backend/test/oauth.e2e-spec.ts`:11 اختبارات جديدة، تشمل8 تدفقات تسجيل/دخول عبر HTTP الحقيقي، ببديل واضح للمزود.
- `docs/oauth-provider-activation.ar.md`:حالة التفعيل والأدلة والقيود.
- `docs/auth-account-v2-providers.md`:رابط التغطية الجديدة.

رُوجعت AGENTS/README/المعمارية وAuth V2 وPrisma والكود والاختبارات. لا PRD مستقل متاح؛ اتُّبع نطاق المرفق والقرارات القائمة. لم يُغيّر اسم architecture.md. مهارة [إدارة الإضافات](C:/Users/user/.codex/plugins/cache/openai-curated-remote/plugin-management/0.1.0/skills/plugin-management/SKILL.md) استُخدمت لاكتشاف وسيلة وصول للوحة؛ اقترحت TinyFish غير المتصل، واختار المالك تهيئة الملف محليًا. لا استخدام لوسيط خارجي أو تثبيت dependency.

## 20. إجراء المالك المطلوب

احفظ الإعدادات الحقيقية في `C:\Users\user\Desktop\NatiqAAC\backend\.env` فقط. Google يحتاج Client ID/Client Secret/Redirect URI، وMeta يحتاج App ID/App Secret/Redirect URI/Graph version مدعومة في التطبيق. لا ترسل القيم في chat أو تضعها في VITE أوGit. أكد الحفظ واسم مشروع Cloud وتطبيق Meta أو العائق العام فقط. بعد ذلك يُعاد فحص الشكل والأصول، ثم يُعاد تشغيل الباك لقراءة القيم.

يلزم لاحقًا تحديد حسابات اختبار مصرح بها للتسجيل والدخول للدورين. إعادة استخدام نفس provider subject لاختبار دور مختلف لا يبدّل الدور القائم؛ لا نحذف حسابًا أو نغيّر اعتماده للوصول إلى نتيجة مرغوبة. التسجيل على قاعدة التطوير يغيّر بيانات ويستدعي بريدًا وفق السياسة القائمة، لذا تُحدد حسابات الاختبار قبل الفعل الخارجي.

## 21. تسليم Git

هذا تغيير اختبارات وتوثيق فقط؛ لا يدّعي تفعيلًا خارجيًا أو إصلاحًا لكود تشغيل سليم. commit الاختبارات: `6f23dee1e9bfd86bf913fbe5db9b8602f2e13f08`. دُفع الفرع طبيعيًا وفُتحت [Draft PR #9](https://github.com/dana-ism/NatiqAAC/pull/9) إلى `feature/admin-experience-v2`، تابعة لـ#8. بقيت Draft لأن التفعيل الخارجي غير مكتمل. روجعت الملفات الثلاثة وstaging، وفُحص310 ملفات دون تطابق مع الأسرار المحلية المعروفة، ونجح diff check ومحاكاة الدمج مع القاعدة. لا merge أوforce-push أو تعديلmain؛ القيم المحلية خارج Git. تحديث التقرير لتسجيل PR يأتي في commit توثيق لاحق.

## 22. حدود النتيجة

نجاح config parser أو start200 لاحقًا لا يكفي. يلزم تفويض Google/Meta حقيقي وcallback/exchange/finish وهوية/دور/تحقق/جلسة/تنقل صحيحة. current Graph version وقبول localhost وconsent/app modes غير مثبتة. لا قارئ شاشة يدوي أو متصفحات أخرى إضافية بهذه المهمة. لا تغيير لكود المصادقة من أجل جعل الأزرار تبدو فعالة.

## 23. التحقق اليدوي والمتابعة

التطبيقان5173 و3000 يعملان بالفعل. لا تبدأ نسخة ثانية على المنفذ نفسه. بعد حفظ القيم سيُعاد تشغيل عملية الباك المعنية. لتشغيل يدوي من terminalين بعد إيقاف النسخة السابقة بشكل منسق:

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC\backend
npm.cmd run build
npm.cmd run start:prod
```

```powershell
Set-Location C:\Users\user\Desktop\NatiqAAC\web
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

فحص Redis القائم: `docker exec natiqaac-redis redis-cli PING`. لا داعي لقاعدة أو Redis بديلين للتطبيق. اختبارات E2E تتطلب حاويات العزل والتحقق من ملكيتها وفق [authentication.md](authentication.md#safe-test-infrastructure)، وبناء backend قبل E2E لأن اختبار bootstrap يشغل الملف المترجم. أوامر الويب والباك في README الحالية.

افتح `/login` و`/register/parent` و`/register/specialist` على5173. افحص Network لطلب start ثم انتقال popup إلى المضيف الرسمي، وأكمل بحساب اختبار مصرح به. لا تسجل URLs ذات state/code/token أو تصدّرHAR حساسًا. عند اكتمال callback افحص جلسة الحساب ودوره وحالته؛ المختص يبقى onboarding دون document/review. حدّث الصفحة للتحقق من سياسة الجلسة المؤقتة القائمة، ثم سجّل الخروج.

| شرط القبول | الحالة الحالية |
| --- | --- |
| Google Parent registration | BLOCKED — إعداد المزود واختبار خارجي مصرح |
| Google Parent login | BLOCKED — نفس السبب |
| Google Specialist registration | BLOCKED — نفس السبب |
| Google Specialist login | BLOCKED — نفس السبب |
| Facebook Parent registration | BLOCKED — إعداد المزود واختبار خارجي مصرح |
| Facebook Parent login | BLOCKED — نفس السبب |
| Facebook Specialist registration | BLOCKED — نفس السبب |
| Facebook Specialist login | BLOCKED — نفس السبب |
| redirects الصحيحة | PARTIAL — المحلي متسق؛ التسجيل لدى المزود غير مثبت |
| callbacks آمنة | PARTIAL — مراجعة وunit وRedis/HTTP معزول؛ لا مزود حي |
| منع تصعيد الصلاحيات | PASS ضمن HTTP/Prisma/Redis المعزول والوحدات |
| حفظ وظائف Admin | PASS للفحوص القائمة؛ كود التشغيل دون تعديل |
| حفظ المصادقة القائمة | PASS للتغطية القائمة؛ OAuth الحي ما زالBLOCKED |
| عدم كشف الأسرار | PASS في الفحص المحدد؛ لا قيم أو tokens حقيقية في الأدلة |
