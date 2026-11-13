import { useI18n } from "../../i18n/context";

export const accountEn = {
  "account.googleEmailConflict":
    "An account already uses this email. Sign in using its existing method, then explicitly connect Google or Facebook from Account connections.",
  "account.signInToLink": "Sign in to connect your account",
  "account.identityConflict":
    "An account or provider identity is already registered or connected. Start a fresh sign-in attempt; no duplicate account was created.",
  "account.providerAlreadyLinked":
    "Your account already has a different identity connected with this provider. No connection was changed.",
  "account.registrationRequired":
    "Choose an account type to create your account with this provider.",
  "account.transactionExpired":
    "This sign-in attempt expired or is no longer valid. Start again to continue securely.",
  "account.signInUnavailable":
    "The sign-in service is temporarily unavailable. Refresh the page and try again later.",
  "account.providerVerified": "Email verified by Google",
  "account.linkedProvider": "Your sign-in method was connected successfully.",
  "account.oauthSessionFailed":
    "Your sign-in session could not be confirmed. Start a fresh sign-in attempt.",
  "account.confirmPassword": "Confirm password",
  "account.passwordMismatch":
    "The passwords do not match. Enter the same password in both fields.",
  "account.professionalRequired": "Enter at least two characters.",
  "account.changeRole": "Change account type",
  "account.backIdentity": "Back to account details",
  "account.completeProfile": "Continue your specialist application",
  "account.parentHelp":
    "Choose Google, Facebook, or create an account with your email. All email registration fields are required.",
  "account.specialistHelp":
    "Complete your professional profile and PDF before review. You can save it before verifying your email.",
  "account.emailMethod": "Or register with email",
  "account.stepIdentity": "Step 1 of 2 · Account details",
  "account.stepProfessional": "Step 2 of 2 · Professional details",
  "account.checkVerified": "I've verified my email",
  "account.stillPending":
    "Your email has not been verified yet. Open the message and confirm, then check again.",
  "account.signInToCheck":
    "Sign in to securely check your email status. Your account will stay restricted until verification.",
  "account.expiry":
    "New verification links are valid for 24 hours. Open the message and press the verification button.",
  "account.cooldown": "You can request another link in {seconds} seconds.",
  "account.setupIncomplete":
    "Your account was created. Sign in to finish saving your document and application. Do not register again.",
  "account.savedPending":
    "Your application is saved. It will enter administrative review after email verification.",
  "account.socialIdentity": "Identity provided by {provider}",
  "account.socialEmailHelp":
    "This contact email still requires NatiqAAC verification.",
  "account.socialConflict":
    "Already have an account? Sign in using its existing method, then connect this provider from Account connections.",
  "account.socialRestart":
    "If completion fails or expires, cancel and start again. Your existing account will not be duplicated.",
  "account.oauthGoogle": "Continue with Google",
  "account.oauthFacebook": "Continue with Facebook",
  "account.oauthCanceled":
    "Authentication was canceled or expired. You can try again.",
  "account.oauthBlocked":
    "The sign-in window could not open. Allow pop-ups and try again.",
  "account.oauthFailed":
    "Provider authentication failed. Try again or use email and password.",
  "account.oauthComplete": "Complete your account information",
  "account.oauthContinue": "Continue",
  "account.choose": "Choose your account type",
  "account.chooseHelp":
    "Create an account for your role. Specialist access requires professional review.",
  "account.parent": "Parent account",
  "account.specialist": "Specialist application",
  "account.specialization": "Professional specialization",
  "account.qualification": "Academic qualification",
  "account.summary": "Relevant professional information (optional)",
  "account.apply": "Create account and continue",
  "account.pending": "Verify your email",
  "account.pendingHelp":
    "Check your inbox for the verification link. Email verification is required before normal access. Specialists also require professional approval.",
  "account.notSent":
    "Your account was created, but the email could not be sent. Use resend to try again.",
  "account.resend": "Resend verification email",
  "account.resendDone":
    "If this account is eligible, a verification message will be sent. Check your inbox before trying again.",
  "account.confirm": "Confirm email verification",
  "account.confirmHelp":
    "Press the button to use this verification link. The link can be used once.",
  "account.verified":
    "Email verified. Sign in to continue. Specialist approval is a separate step.",
  "account.invalidLink":
    "The verification link is missing or invalid. Request a new email.",
  "account.status": "Your application status",
  "account.emailNeeded":
    "Verify your email to continue. You can finish your professional application while waiting.",
  "account.emailVerified": "Email verified",
  "account.document": "Supporting qualification document",
  "account.documentHelp":
    "Upload a PDF, up to 5 MB. Do not include unrelated personal or child information.",
  "account.documentPresent": "A supporting document has been uploaded.",
  "account.upload": "Upload document",
  "account.uploaded": "Document uploaded.",
  "account.submit": "Submit for review",
  "account.submitted": "Application submitted for review.",
  "account.DRAFT": "Draft — complete and submit your application",
  "account.PENDING_REVIEW": "Pending administrative review",
  "account.APPROVED": "Approved",
  "account.REJECTED": "Rejected",
  "account.applications": "Specialist applications",
  "account.empty": "No applications found.",
  "account.details": "View application",
  "account.approve": "Approve application",
  "account.reject": "Reject application",
  "account.reason": "Reason for rejection (visible to the applicant)",
  "account.confirmApprove": "Confirm approval and grant specialist access?",
  "account.confirmReject": "Confirm rejection of this application?",
  "account.confirmDecision": "Confirm decision",
  "account.cancel": "Cancel",
  "account.decided": "Decision recorded.",
  "account.download": "Download supporting document",
  "account.noDocument": "No document uploaded.",
  "account.back": "Back to applications",
  "account.fileInvalid": "Choose a PDF file no larger than 5 MB.",
  "account.loading": "Loading…",
} as const;

export const accountAr: Record<keyof typeof accountEn, string> = {
  "account.googleEmailConflict":
    "يوجد حساب بهذا البريد. سجّل الدخول بطريقته الحالية، ثم اختر ربط Google أو Facebook صراحةً من اتصالات الحساب.",
  "account.signInToLink": "تسجيل الدخول لربط الحساب",
  "account.identityConflict":
    "الحساب أو هوية المزوّد مسجّلة أو مرتبطة بالفعل. ابدأ محاولة دخول جديدة؛ لم يُنشأ حساب مكرر.",
  "account.providerAlreadyLinked":
    "يوجد ارتباط بهوية أخرى لهذا المزوّد في حسابك. لم يُغيّر أي ارتباط.",
  "account.registrationRequired":
    "اختر نوع الحساب لإنشاء حسابك باستخدام هذا المزوّد.",
  "account.transactionExpired":
    "انتهت محاولة الدخول أو لم تعد صالحة. ابدأ مجددًا للمتابعة بأمان.",
  "account.signInUnavailable":
    "خدمة تسجيل الدخول غير متاحة مؤقتًا. حدّث الصفحة وحاول لاحقًا.",
  "account.providerVerified": "البريد مؤكّد لدى Google",
  "account.linkedProvider": "تم ربط طريقة تسجيل الدخول بنجاح.",
  "account.oauthSessionFailed":
    "تعذّر تأكيد جلسة الدخول. ابدأ محاولة دخول جديدة.",
  "account.confirmPassword": "تأكيد كلمة المرور",
  "account.passwordMismatch":
    "كلمتا المرور غير متطابقتين. أدخل كلمة المرور نفسها في الحقلين.",
  "account.professionalRequired": "أدخل حرفين على الأقل.",
  "account.changeRole": "تغيير نوع الحساب",
  "account.backIdentity": "العودة إلى بيانات الحساب",
  "account.completeProfile": "متابعة طلبك المهني",
  "account.parentHelp":
    "تابع باستخدام Google أو Facebook، أو أنشئ حسابًا ببريدك الإلكتروني. جميع حقول التسجيل بالبريد مطلوبة.",
  "account.specialistHelp":
    "أكمل بياناتك المهنية ووثيقة PDF قبل المراجعة. يمكنك حفظها قبل تأكيد بريدك الإلكتروني.",
  "account.emailMethod": "أو سجّل بالبريد الإلكتروني",
  "account.stepIdentity": "الخطوة 1 من 2 · بيانات الحساب",
  "account.stepProfessional": "الخطوة 2 من 2 · البيانات المهنية",
  "account.checkVerified": "تحققت من بريدي",
  "account.stillPending":
    "لم يُؤكّد بريدك بعد. افتح الرسالة واضغط زر التأكيد، ثم تحقّق مجددًا.",
  "account.signInToCheck":
    "سجّل الدخول للتحقق من حالة بريدك بأمان. يبقى وصول حسابك مقيّدًا حتى التأكيد.",
  "account.expiry":
    "روابط التأكيد الجديدة صالحة لمدة 24 ساعة. افتح الرسالة واضغط زر تأكيد البريد الإلكتروني.",
  "account.cooldown": "يمكنك طلب رابط آخر بعد {seconds} ثانية.",
  "account.setupIncomplete":
    "تم إنشاء حسابك. سجّل الدخول لإكمال حفظ الوثيقة والطلب، دون إنشاء حساب جديد.",
  "account.savedPending":
    "حُفظ طلبك. سيُحال إلى مراجعة الإدارة بعد تأكيد بريدك الإلكتروني.",
  "account.socialIdentity": "هوية مقدّمة من {provider}",
  "account.socialEmailHelp": "يحتاج بريد التواصل هذا إلى التأكيد عبر ناطق.",
  "account.socialConflict":
    "لديك حساب؟ سجّل الدخول بطريقته الحالية، ثم اربط هذا المزوّد من اتصالات الحساب.",
  "account.socialRestart":
    "إذا تعذّر الإكمال أو انتهت صلاحيته، ألغِ العملية وابدأ مجددًا. لن يُنشأ حساب مكرر.",
  "account.oauthGoogle": "المتابعة باستخدام Google",
  "account.oauthFacebook": "المتابعة باستخدام Facebook",
  "account.oauthCanceled":
    "أُلغيت المصادقة أو انتهت صلاحيتها. يمكنك المحاولة مجددًا.",
  "account.oauthBlocked":
    "تعذر فتح نافذة تسجيل الدخول. اسمح بالنوافذ المنبثقة ثم أعد المحاولة.",
  "account.oauthFailed":
    "تعذرت المصادقة لدى المزوّد. أعد المحاولة أو استخدم البريد وكلمة المرور.",
  "account.oauthComplete": "أكمل معلومات حسابك",
  "account.oauthContinue": "المتابعة",
  "account.choose": "اختر نوع الحساب",
  "account.chooseHelp":
    "أنشئ حسابًا يناسب دورك. يتطلب وصول الأخصائي مراجعة مهنية.",
  "account.parent": "حساب ولي أمر",
  "account.specialist": "طلب انضمام أخصائي",
  "account.specialization": "التخصص المهني",
  "account.qualification": "المؤهل الأكاديمي",
  "account.summary": "معلومات مهنية ذات صلة (اختياري)",
  "account.apply": "إنشاء الحساب والمتابعة",
  "account.pending": "تأكيد بريدك الإلكتروني",
  "account.pendingHelp":
    "تحقق من بريدك الوارد للعثور على رابط التأكيد. يلزم تأكيد البريد قبل الوصول العادي. يحتاج الأخصائي أيضًا إلى الموافقة المهنية.",
  "account.notSent":
    "تم إنشاء حسابك، لكن تعذر إرسال البريد. استخدم إعادة الإرسال للمحاولة مجددًا.",
  "account.resend": "إعادة إرسال بريد التأكيد",
  "account.resendDone":
    "إذا كان الحساب مؤهلًا، ستُرسل رسالة تأكيد. تحقق من بريدك قبل المحاولة مجددًا.",
  "account.confirm": "تأكيد البريد الإلكتروني",
  "account.confirmHelp":
    "اضغط الزر لاستخدام رابط التأكيد. يمكن استخدام الرابط مرة واحدة.",
  "account.verified":
    "تم تأكيد البريد. سجّل الدخول للمتابعة. الموافقة على الأخصائي خطوة منفصلة.",
  "account.invalidLink": "رابط التأكيد مفقود أو غير صالح. اطلب رسالة جديدة.",
  "account.status": "حالة طلبك",
  "account.emailNeeded":
    "أكّد بريدك الإلكتروني للمتابعة. يمكنك إكمال طلبك المهني أثناء الانتظار.",
  "account.emailVerified": "البريد الإلكتروني مؤكّد",
  "account.document": "وثيقة إثبات المؤهل",
  "account.documentHelp":
    "ارفع ملف PDF حتى 5 ميغابايت. لا تُضمّن بيانات شخصية غير لازمة أو معلومات أطفال.",
  "account.documentPresent": "تم رفع وثيقة إثبات.",
  "account.upload": "رفع الوثيقة",
  "account.uploaded": "تم رفع الوثيقة.",
  "account.submit": "إرسال للمراجعة",
  "account.submitted": "تم إرسال الطلب للمراجعة.",
  "account.DRAFT": "مسودة — أكمل الطلب وأرسله",
  "account.PENDING_REVIEW": "بانتظار مراجعة الإدارة",
  "account.APPROVED": "موافق عليه",
  "account.REJECTED": "مرفوض",
  "account.applications": "طلبات الأخصائيين",
  "account.empty": "لا توجد طلبات.",
  "account.details": "عرض الطلب",
  "account.approve": "الموافقة على الطلب",
  "account.reject": "رفض الطلب",
  "account.reason": "سبب الرفض (يظهر لمقدم الطلب)",
  "account.confirmApprove": "تأكيد الموافقة ومنح وصول الأخصائي؟",
  "account.confirmReject": "تأكيد رفض هذا الطلب؟",
  "account.confirmDecision": "تأكيد القرار",
  "account.cancel": "إلغاء",
  "account.decided": "تم تسجيل القرار.",
  "account.download": "تنزيل وثيقة الإثبات",
  "account.noDocument": "لم تُرفع وثيقة.",
  "account.back": "العودة إلى الطلبات",
  "account.fileInvalid": "اختر ملف PDF بحجم لا يتجاوز 5 ميغابايت.",
  "account.loading": "جارٍ التحميل…",
};

export function useAccountCopy() {
  const { t } = useI18n();
  return (key: keyof typeof accountEn): string => t(key);
}
