import type { Messages } from "./ar";
import { accountEn } from "../features/account/account.messages";

export const en = {
  "adminV2.settings": "Settings",
  "adminV2.settingsHelp":
    "Choose your display language now. Other administration settings are in development.",
  "adminV2.availableNow": "Available now",
  "adminV2.languageSetting": "Display language",
  "adminV2.languageSettingHelp":
    "Your language is saved in this browser and applied to the interface immediately.",
  "adminV2.plannedWorkspace": "What this workspace will support",
  "adminV2.frontendOnly": "Frontend foundation",
  "adminV2.frontendOnlyHelp":
    "These areas are in development. They are not connected to administrative data or operations yet.",
  "adminV2.inPreparation": "In development · not available yet",
  "adminV2.userDirectory": "User directory",
  "adminV2.userDirectoryHelp":
    "A workspace for parent and specialist accounts and their details. No records are loaded yet.",
  "adminV2.userFilters": "Search and filters",
  "adminV2.userFiltersHelp":
    "Account search and role and status filters are planned for the integrated service.",
  "adminV2.userAccess": "Account status",
  "adminV2.userAccessHelp":
    "Suspension and reactivation require authorized backend APIs. No account changes are available here.",
  "adminV2.words": "Words",
  "adminV2.wordsHelp":
    "A workspace for organizing communication vocabulary and reviewing its text.",
  "adminV2.pictures": "Pictures",
  "adminV2.picturesHelp":
    "A visual library for communication pictures, pending content-management integration.",
  "adminV2.sounds": "Sounds",
  "adminV2.soundsHelp":
    "Organize audio materials associated with communication content.",
  "adminV2.symbols": "AAC symbols",
  "adminV2.symbolsHelp":
    "A workspace for browsing and organizing augmentative and alternative communication symbols.",
  "adminV2.categories": "Categories",
  "adminV2.categoriesHelp":
    "Group content into clear categories once the service is available.",
  "adminV2.adminDirectory": "Administrator accounts",
  "adminV2.adminDirectoryHelp":
    "An administrator directory following the approved equal-permission policy, with no new roles.",
  "adminV2.invitations": "Admin invitations",
  "adminV2.invitationsHelp":
    "Invitation management awaits secure integration. This page does not send invitations.",
  "adminV2.adminAccess": "Account activation",
  "adminV2.adminAccessHelp":
    "A future workspace for deactivation and reactivation. There is no public Admin registration.",
  "adminV2.auditContext": "Action and participants",
  "adminV2.auditContextHelp":
    "Organize the action, its administrator and the account or content it targets.",
  "adminV2.auditTime": "Timeline",
  "adminV2.auditTimeHelp":
    "Show operation timestamps when an authorized administrative log is available. No events are displayed yet.",
  "adminV2.auditReason": "Decision context",
  "adminV2.auditReasonHelp":
    "Present reasons and decision context where appropriate, with no sample audit records.",
  "adminV2.workspaceSettings": "Administration preferences",
  "adminV2.workspaceSettingsHelp":
    "A foundation for settings to be approved later. No platform settings can be saved here.",
  "adminV2.settingsSafety": "Settings scope",
  "adminV2.settingsSafetyHelp":
    "Security, permission and retention policies cannot be changed from this preliminary interface.",
  "adminV2.verification": "Specialist review preview",
  "adminV2.secureReviewHelp":
    "Open the profile to check the private document and review the decision securely.",
  "adminV2.openSecureReview": "Open review profile",
  "adminV2.users": "User management",
  "adminV2.content": "Content studio",
  "adminV2.admins": "Admin management",
  "adminV2.audit": "Audit logs",
  "adminV2.usersHelp":
    "We are preparing a workspace to manage parent and specialist accounts and review their status.",
  "adminV2.contentHelp":
    "A dedicated workspace for organizing words, pictures, sounds and communication symbols is coming soon.",
  "adminV2.adminsHelp":
    "We are preparing tools to invite administrators and manage their accounts securely.",
  "adminV2.auditHelp":
    "A workspace for reviewing important administrative operations is coming soon.",
  "adminV2.comingSoon": "Coming soon",
  "adminV2.inDevelopment": "This section is in development",
  "adminV2.backOverview": "Back to overview",
  "adminV2.statistics": "Specialist application statistics",
  "adminV2.pending": "Awaiting review",
  "adminV2.approved": "Approved applications",
  "adminV2.rejected": "Rejected applications",
  "adminV2.total": "Total applications",
  "adminV2.totalHelp": "Includes draft applications",
  "adminV2.pendingHelp": "Ready for a review decision",
  "adminV2.recordedDecisions": "Recorded review decisions",
  "adminV2.alerts": "Important Alerts",
  "adminV2.reviewAlert": "Applications need your decision",
  "adminV2.reviewAlertHelp":
    "Review the professional profile and attached document.",
  "adminV2.noAlerts": "No review alerts at the moment",
  "adminV2.dataUnavailable": "Unable to load administration data",
  "adminV2.recent": "Recent specialist requests",
  "adminV2.recentHelp":
    "The five most recently submitted applications, newest first.",
  "adminV2.noRecent": "No submitted applications yet",
  "adminV2.noRecentHelp":
    "Applications will appear here when they are submitted for review.",
  "adminV2.reviewRequest": "Review request",
  "adminV2.viewRequest": "View request",
  "signature.read": "Professional profile",
  "signature.document": "Qualification document",
  "signature.decide": "Review decision",
  "signature.closeNavigation": "Close navigation",
  "signature.results": "Displayed results",
  "signature.of": "of",
  "signature.loaded": "loaded applications",
  "signature.pdf": "PDF file · private access",
  "signature.available": "Document attached",
  "signature.reviewContext":
    "Review the profile and document before deciding. Your decision will be recorded in the application history.",
  "admin.workspaceLabel": "Administration workspace",
  "admin.footer": "A considered space to manage Natiq",
  "admin.overviewIntro":
    "Review applications that need your attention and follow platform updates.",
  "admin.priority": "Review priority",
  "admin.pendingTitle": "Specialist applications",
  "admin.waitingReview": "awaiting review",
  "admin.countUnavailable": "Count unavailable",
  "admin.noPending":
    "No specialist applications are awaiting review. You can still explore previous applications.",
  "admin.reviewHelp":
    "Review the qualifications and supporting document before granting specialist access.",
  "admin.reviewCta": "Review Specialist Applications",
  "admin.viewAll": "View all applications",
  "admin.accountHelp":
    "The account you are currently using to administer the platform.",
  "admin.reviewWorkflow": "A considered review",
  "admin.reviewThoughtfully": "From application to a clear decision",
  "admin.stepRead":
    "Read the specialization, qualification and professional information.",
  "admin.stepDocument":
    "Download the supporting document and review it in context.",
  "admin.stepDecide":
    "Approve the application or explain your rejection to the applicant.",
  "admin.privateDocuments":
    "Documents are private. Access them for review and avoid sharing them outside that purpose.",
  "admin.traceableTitle": "A clear decision, on record",
  "admin.traceableHelp":
    "Review decisions are recorded. Rejection reasons are visible to applicants so they can understand the outcome.",
  "admin.applicationsIntro":
    "Review professional applications and qualifications, then make an informed decision.",
  "admin.search": "Search displayed applications",
  "admin.searchPlaceholder": "Specialist name, email or specialization",
  "admin.filterStatus": "Application status",
  "admin.allStatuses": "All statuses",
  "admin.listLimit":
    "Up to 100 of the oldest applications are shown. Search and filters cover these records, not the full history.",
  "admin.submitted": "Submitted on",
  "admin.notSubmitted": "Not yet submitted",
  "admin.noResults": "No applications match your selection",
  "admin.noResultsHelp": "Try another name or view all statuses.",
  "admin.clearFilters": "Clear search and filters",
  "admin.noApplicationsHelp":
    "Applications will appear here when specialists start registering.",
  "admin.applicant": "Applicant",
  "admin.documentPrivate":
    "Private document — downloaded through authorized access.",
  "admin.noSummary": "No additional professional information provided.",
  "admin.reviewHistory": "Review history",
  "admin.refreshDetails": "Refresh application details",
  "admin.reasonHint":
    "Write a clear, respectful reason of 10 to 1000 characters. It will be visible to the applicant.",
  "admin.confirmTarget":
    "Check the applicant details before confirming your decision.",
  "admin.refreshList": "Refresh applications",
  ...accountEn,
  "account.connections": "Connect sign-in methods",
  "account.connectionsHelp":
    "Connect Google or Facebook while signed in to your current account. Your account permissions will stay the same.",
  "admin.title": "Welcome to the Natiq admin centre",
  "admin.portal": "Admin portal",
  "admin.navigation": "Admin navigation",
  "admin.workspace": "Workspace",
  "admin.overview": "Overview",
  "admin.scope":
    "Administration starts here. Approved tools will be added as they are completed.",
  "admin.intro":
    "Welcome to your Natiq workspace. A clear, secure starting point for platform administration.",
  "admin.unavailable": "Unable to load the overview",
  "admin.currentAccount": "Your current account",
  "admin.accountTitle": "Platform administrator",
  "admin.accessVerified": "Admin access verified",
  "admin.privacyTitle": "Privacy comes first",
  "admin.privacy":
    "This workspace is for platform administration. It does not display children's information, learning records, photos or recordings.",
  "admin.foundationTitle": "Ready for the next steps",
  "admin.foundation":
    "Admin invitations, account and content management, and audit logging are planned features. They are not available yet.",
  "admin.sessionTitle": "A temporary, secure session",
  "brand.name": "Natiq",
  "brand.caption": "A space to communicate",
  "brand.login": "Natiq, sign-in page",
  "brand.welcome": "Natiq, welcome page",
  "layout.skip": "Skip to content",
  "layout.header": "A step closer to expression",
  "layout.eyebrow": "Every expression matters",
  "layout.headline": "We communicate in different ways",
  "layout.headlineEnd": "and connect through understanding",
  "layout.description":
    "A space for communication and learning, giving parents a clear starting point to support their children.",
  "layout.smallStep": "A small step today,",
  "layout.moreSpace": "more room to communicate.",
  "layout.footer": "Natiq — making room for every expression",
  "layout.parents": "Parent portal",
  "art.space": "Room for every expression",
  "art.morning": "Good morning",
  "art.love": "I love you",
  "art.want": "I want",
  "art.express": "to express myself",
  "art.step": "Communication starts with a step",
  "language.label": "Interface language",
  "auth.login": "Sign in",
  "auth.register": "Create account",
  "auth.loginTag": "Welcome back",
  "auth.registerTag": "A fresh start",
  "auth.loginTitle": "Glad you're here.",
  "auth.registerTitle": "A space for your child starts with you.",
  "auth.loginDescription":
    "Sign in to your Natiq account and let's continue together.",
  "auth.registerDescription":
    "Create a parent account to begin your journey with Natiq.",
  "auth.options": "Account options",
  "auth.registered": "Your account has been created. You can now sign in.",
  "auth.fullName": "Full name",
  "auth.email": "Email address",
  "auth.password": "Password",
  "auth.namePlaceholder": "What would you like us to call you?",
  "auth.emailPlaceholder": "name@example.com",
  "auth.passwordPlaceholder": "••••••••",
  "auth.showPassword": "Show password",
  "auth.hidePassword": "Hide password",
  "auth.passwordHint":
    "At least 8 characters and no more than 72 bytes. Spaces in your password are preserved.",
  "auth.creating": "Creating account…",
  "auth.signingIn": "Signing in…",
  "auth.createParent": "Create parent account",
  "auth.wait": "Please wait for the request to finish.",
  "auth.already": "Already have an account?",
  "auth.firstVisit": "First time here?",
  "auth.signInLink": "Sign in",
  "auth.createLink": "Create a parent account",
  "auth.temporary": "Your session is temporary in this window.",
  "auth.reload": "Refreshing the page requires you to sign in again.",
  "validation.nameRequired": "Enter your full name.",
  "validation.nameLong": "Your name must be no more than 100 characters.",
  "validation.emailRequired": "Enter your email address.",
  "validation.emailInvalid": "Enter a valid email address.",
  "validation.passwordRequired": "Enter your password.",
  "validation.passwordShort": "Use at least 8 characters.",
  "validation.passwordLong":
    "Your password is too long. The limit is 72 bytes; some characters use more than one byte.",
  "error.unexpected": "Something went wrong. Please try again.",
  "error.network":
    "Unable to connect to the service. Check your connection and try again.",
  "error.config":
    "The service address is not configured correctly. Please contact the app team.",
  "error.contract":
    "The service returned an unexpected response. Please try again later.",
  "error.badRequest":
    "Some details were not accepted. Check the fields and try again.",
  "error.credentials": "The email address or password is incorrect.",
  "error.session":
    "Your session has expired or is no longer valid. Please sign in again.",
  "error.inactive": "This account is inactive. Please contact the app team.",
  "error.duplicate":
    "This email address is already registered. You can sign in to your account.",
  "error.conflict":
    "The request could not be completed because of conflicting data.",
  "error.rateLimit": "Too many requests. Please try again later.",
  "error.retrySeconds":
    "Too many requests. You can try again in {seconds} seconds.",
  "error.retrySecond":
    "Too many requests. You can try again in {seconds} second.",
  "error.unavailable":
    "The service is temporarily unavailable. Please try again later.",
  "error.request":
    "The request could not be completed. Please try again later.",
  "session.expired": "Your session has expired. Please sign in again.",
  "session.signedOut": "You have signed out of this browser.",
  "session.checking": "Checking your session…",
  "session.tryAgain": "Let's try again",
  "session.unverified": "Unable to verify your session.",
  "session.retry": "Try again",
  "session.back": "Back to sign in",
  "home.title": "Welcome to Natiq.",
  "home.account": "Your account",
  "home.signedIn": "Signed in",
  "home.discover": "Discover what's ahead",
  "home.signOut": "Sign out",
  "home.localSignOut": "This will end your session on this device only.",
  "home.soon": "Coming soon",
  "home.futureTitle": "New experiences are on the way",
  "home.futureDescription":
    "We're preparing communication and learning experiences. They'll appear here soon.",
  "role.PARENT": "Parent",
  "role.SPECIALIST": "Specialist",
  "role.ADMIN": "Administrator",
  "title.home": "Your account",
  "meta.description": "Natiq — parent sign-in and registration",
} satisfies Messages;
