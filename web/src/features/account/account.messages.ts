import { useI18n } from "../../i18n/context";

export const accountEn = {
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
    "Verify your email before submitting your professional application.",
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
  "account.emailNeeded": "أكّد بريدك الإلكتروني قبل إرسال طلبك المهني.",
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
