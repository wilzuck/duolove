

CREATE TYPE public."AppealStatus" AS ENUM (
    'NONE',
    'PENDING',
    'ACCEPTED',
    'REJECTED'
);

CREATE TYPE public."CreditReason" AS ENUM (
    'PURCHASE',
    'GRANT_PLAN',
    'CONSUME',
    'REFUND',
    'ADMIN_GRANT',
    'GRANT_PROFILE',
    'PROMO',
    'REFERRAL'
);

CREATE TYPE public."CreditType" AS ENUM (
    'SUPER_LIKE',
    'BOOST_30',
    'BOOST_120',
    'BOOST_1440',
    'MATCH_TOKEN'
);

CREATE TYPE public."Gender" AS ENUM (
    'MAN',
    'WOMAN',
    'NON_BINARY',
    'OTHER'
);

CREATE TYPE public."Intent" AS ENUM (
    'SERIOUS',
    'MARRIAGE',
    'DATING',
    'FRIENDSHIP',
    'UNSURE'
);

CREATE TYPE public."LiveInviteStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'DECLINED',
    'EXPIRED',
    'CHOSEN'
);

CREATE TYPE public."LiveSearchStatus" AS ENUM (
    'ACTIVE',
    'CLOSED',
    'EXPIRED'
);

CREATE TYPE public."LivingSituation" AS ENUM (
    'ALONE',
    'FAMILY',
    'ROOMMATES'
);

CREATE TYPE public."MatchStatus" AS ENUM (
    'ACTIVE',
    'UNMATCHED'
);

CREATE TYPE public."ModerationActionType" AS ENUM (
    'WARN',
    'SUSPEND',
    'BAN',
    'UNSUSPEND',
    'PHOTO_REJECT',
    'VERIFICATION_APPROVE',
    'VERIFICATION_REJECT',
    'APPEAL_ACCEPT',
    'APPEAL_REJECT'
);

CREATE TYPE public."ModerationStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TYPE public."NotificationType" AS ENUM (
    'LIKE',
    'MATCH',
    'MESSAGE',
    'PROFILE_VERIFIED',
    'SUBSCRIPTION_ACTIVATED',
    'SUBSCRIPTION_EXPIRING',
    'SECURITY_ALERT',
    'REFUND_UPDATE',
    'LIVE_INVITE',
    'LIVE_ACCEPTED',
    'REFERRAL_REWARD'
);

CREATE TYPE public."PaymentKind" AS ENUM (
    'SUBSCRIPTION',
    'PRODUCT'
);

CREATE TYPE public."PaymentStatus" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'REFUNDED'
);

CREATE TYPE public."PlanCode" AS ENUM (
    'FREE',
    'PREMIUM',
    'VIP'
);

CREATE TYPE public."ProductKind" AS ENUM (
    'BOOST',
    'SUPER_LIKE_PACK',
    'TOKEN_PACK'
);

CREATE TYPE public."PromoKind" AS ENUM (
    'PERCENT',
    'TOKENS'
);

CREATE TYPE public."ReferralStatus" AS ENUM (
    'PENDING',
    'REWARDED'
);

CREATE TYPE public."RefundSource" AS ENUM (
    'USER',
    'ADMIN'
);

CREATE TYPE public."RefundStatus" AS ENUM (
    'REQUESTED',
    'PROCESSING',
    'COMPLETED',
    'REJECTED',
    'FAILED'
);

CREATE TYPE public."ReportReason" AS ENUM (
    'FAKE_PROFILE',
    'SCAM',
    'HARASSMENT',
    'INAPPROPRIATE_CONTENT',
    'UNDERAGE',
    'SPAM',
    'OTHER'
);

CREATE TYPE public."ReportStatus" AS ENUM (
    'OPEN',
    'REVIEWING',
    'RESOLVED',
    'DISMISSED'
);

CREATE TYPE public."Role" AS ENUM (
    'USER',
    'MODERATOR',
    'ADMIN',
    'SUPER_ADMIN'
);

CREATE TYPE public."Seeking" AS ENUM (
    'MEN',
    'WOMEN',
    'EVERYONE'
);

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'PENDING',
    'ACTIVE',
    'PAST_DUE',
    'CANCELED',
    'EXPIRED'
);

CREATE TYPE public."SwipeAction" AS ENUM (
    'LIKE',
    'PASS',
    'SUPER_LIKE'
);

CREATE TYPE public."TokenType" AS ENUM (
    'EMAIL_VERIFY',
    'PASSWORD_RESET'
);

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'SUSPENDED',
    'BANNED',
    'DELETED'
);

CREATE TYPE public."Visibility" AS ENUM (
    'VISIBLE',
    'HIDDEN'
);

CREATE TABLE public."Account" (
    id text NOT NULL,
    "userId" text NOT NULL,
    provider text NOT NULL,
    "providerAccountId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."AuditLog" (
    id text NOT NULL,
    "actorId" text,
    action text NOT NULL,
    "targetType" text,
    "targetId" text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Block" (
    id text NOT NULL,
    "blockerId" text NOT NULL,
    "blockedId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Boost" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "startsAt" timestamp(3) without time zone NOT NULL,
    "endsAt" timestamp(3) without time zone NOT NULL,
    "durationMinutes" integer NOT NULL,
    source text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Conversation" (
    id text NOT NULL,
    "matchId" text NOT NULL,
    "lastMessageAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."CreditTransaction" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."CreditType" NOT NULL,
    delta integer NOT NULL,
    reason public."CreditReason" NOT NULL,
    "refId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."CreditWallet" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."CreditType" NOT NULL,
    balance integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Entitlement" (
    id text NOT NULL,
    "userId" text NOT NULL,
    plan public."PlanCode" DEFAULT 'FREE'::public."PlanCode" NOT NULL,
    "validUntil" timestamp(3) without time zone,
    "boostCredits" integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."FeatureFlag" (
    id text NOT NULL,
    key text NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    description text,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Interest" (
    id text NOT NULL,
    slug text NOT NULL
);

CREATE TABLE public."Invoice" (
    id text NOT NULL,
    "paymentId" text NOT NULL,
    number text NOT NULL,
    "amountXof" integer NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."LiveInvite" (
    id text NOT NULL,
    "searchId" text NOT NULL,
    "seekerId" text NOT NULL,
    "inviteeId" text NOT NULL,
    status public."LiveInviteStatus" DEFAULT 'PENDING'::public."LiveInviteStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "respondedAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."LiveSearch" (
    id text NOT NULL,
    "userId" text NOT NULL,
    criteria jsonb NOT NULL,
    status public."LiveSearchStatus" DEFAULT 'ACTIVE'::public."LiveSearchStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Match" (
    id text NOT NULL,
    "userAId" text NOT NULL,
    "userBId" text NOT NULL,
    status public."MatchStatus" DEFAULT 'ACTIVE'::public."MatchStatus" NOT NULL,
    "unmatchedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Message" (
    id text NOT NULL,
    "conversationId" text NOT NULL,
    "senderId" text NOT NULL,
    body text NOT NULL,
    "readAt" timestamp(3) without time zone,
    "deletedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."MessageAttachment" (
    id text NOT NULL,
    "messageId" text NOT NULL,
    key text NOT NULL,
    mime text NOT NULL,
    size integer NOT NULL,
    "moderationStatus" public."ModerationStatus" DEFAULT 'PENDING'::public."ModerationStatus" NOT NULL
);

CREATE TABLE public."ModerationAction" (
    id text NOT NULL,
    "moderatorId" text NOT NULL,
    "targetUserId" text NOT NULL,
    "reportId" text,
    type public."ModerationActionType" NOT NULL,
    reason text NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "appealStatus" public."AppealStatus" DEFAULT 'NONE'::public."AppealStatus" NOT NULL,
    "appealText" text,
    "appealedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Notification" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."NotificationType" NOT NULL,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."NotificationPreference" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "inAppLikes" boolean DEFAULT true NOT NULL,
    "inAppMatches" boolean DEFAULT true NOT NULL,
    "inAppMessages" boolean DEFAULT true NOT NULL,
    "emailLikes" boolean DEFAULT false NOT NULL,
    "emailMatches" boolean DEFAULT true NOT NULL,
    "emailMessages" boolean DEFAULT false NOT NULL,
    "pushEnabled" boolean DEFAULT false NOT NULL
);

CREATE TABLE public."Payment" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "subscriptionId" text,
    "amountXof" integer NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    provider text NOT NULL,
    "providerRef" text NOT NULL,
    status public."PaymentStatus" DEFAULT 'PENDING'::public."PaymentStatus" NOT NULL,
    "failureReason" text,
    "paidAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kind public."PaymentKind" DEFAULT 'SUBSCRIPTION'::public."PaymentKind" NOT NULL,
    months integer DEFAULT 1 NOT NULL,
    "productId" text,
    quantity integer DEFAULT 1 NOT NULL,
    "discountXof" integer DEFAULT 0 NOT NULL,
    "promoCodeId" text
);

CREATE TABLE public."PlanPrice" (
    id text NOT NULL,
    "planId" text NOT NULL,
    months integer NOT NULL,
    "discountPercent" integer DEFAULT 0 NOT NULL,
    "amountOverride" integer,
    active boolean DEFAULT true NOT NULL
);

CREATE TABLE public."Preference" (
    id text NOT NULL,
    "userId" text NOT NULL,
    seeking public."Seeking" DEFAULT 'EVERYONE'::public."Seeking" NOT NULL,
    "ageMin" integer DEFAULT 18 NOT NULL,
    "ageMax" integer DEFAULT 60 NOT NULL,
    country text,
    city text,
    intents public."Intent"[],
    "maxDistanceKm" integer,
    languages text[] DEFAULT ARRAY[]::text[],
    interests text[] DEFAULT ARRAY[]::text[],
    "verifiedOnly" boolean DEFAULT false NOT NULL,
    "activeRecently" boolean DEFAULT false NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."Product" (
    id text NOT NULL,
    code text NOT NULL,
    kind public."ProductKind" NOT NULL,
    "creditType" public."CreditType" NOT NULL,
    name text NOT NULL,
    quantity integer DEFAULT 1 NOT NULL,
    "priceXof" integer NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public."Profile" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "displayName" text NOT NULL,
    "birthDate" timestamp(3) without time zone NOT NULL,
    gender public."Gender" NOT NULL,
    pronouns text,
    country text NOT NULL,
    city text NOT NULL,
    "approxLat" double precision,
    "approxLng" double precision,
    bio text DEFAULT ''::text NOT NULL,
    occupation text,
    languages text[] DEFAULT ARRAY['fr'::text],
    intent public."Intent" DEFAULT 'UNSURE'::public."Intent" NOT NULL,
    visibility public."Visibility" DEFAULT 'VISIBLE'::public."Visibility" NOT NULL,
    incognito boolean DEFAULT false NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    completeness integer DEFAULT 0 NOT NULL,
    "boostedUntil" timestamp(3) without time zone,
    "readReceipts" boolean DEFAULT true NOT NULL,
    "onboardedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "hasChildren" boolean,
    "heightCm" integer,
    "likesPets" boolean,
    "liveOptIn" boolean DEFAULT true NOT NULL,
    living public."LivingSituation",
    "originCountry" text
);

CREATE TABLE public."ProfilePhoto" (
    id text NOT NULL,
    "profileId" text NOT NULL,
    key text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "isPrimary" boolean DEFAULT false NOT NULL,
    width integer NOT NULL,
    height integer NOT NULL,
    "moderationStatus" public."ModerationStatus" DEFAULT 'PENDING'::public."ModerationStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."PromoCode" (
    id text NOT NULL,
    code text NOT NULL,
    kind public."PromoKind" NOT NULL,
    percent integer,
    tokens integer,
    "maxRedemptions" integer,
    "startsAt" timestamp(3) without time zone,
    "expiresAt" timestamp(3) without time zone,
    active boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Referral" (
    id text NOT NULL,
    "referrerId" text NOT NULL,
    "refereeId" text NOT NULL,
    status public."ReferralStatus" DEFAULT 'PENDING'::public."ReferralStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "rewardedAt" timestamp(3) without time zone
);

CREATE TABLE public."Refund" (
    id text NOT NULL,
    "paymentId" text NOT NULL,
    "amountXof" integer NOT NULL,
    reason text NOT NULL,
    source public."RefundSource" NOT NULL,
    status public."RefundStatus" DEFAULT 'REQUESTED'::public."RefundStatus" NOT NULL,
    "requestedById" text NOT NULL,
    "decidedById" text,
    "decisionNote" text,
    "providerRef" text,
    "failureReason" text,
    "creditsReversed" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "decidedAt" timestamp(3) without time zone
);

CREATE TABLE public."Report" (
    id text NOT NULL,
    "reporterId" text NOT NULL,
    "targetId" text NOT NULL,
    reason public."ReportReason" NOT NULL,
    details text,
    status public."ReportStatus" DEFAULT 'OPEN'::public."ReportStatus" NOT NULL,
    "resolvedById" text,
    "resolvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."Session" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "userAgent" text,
    "ipHash" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastUsedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone
);

CREATE TABLE public."Subscription" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "planId" text NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'PENDING'::public."SubscriptionStatus" NOT NULL,
    provider text NOT NULL,
    "providerRef" text,
    "currentPeriodEnd" timestamp(3) without time zone,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    months integer DEFAULT 1 NOT NULL
);

CREATE TABLE public."SubscriptionPlan" (
    id text NOT NULL,
    code public."PlanCode" NOT NULL,
    name text NOT NULL,
    "priceXof" integer NOT NULL,
    currency text DEFAULT 'XOF'::text NOT NULL,
    "intervalDays" integer DEFAULT 30 NOT NULL,
    features jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    featured boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL
);

CREATE TABLE public."Swipe" (
    id text NOT NULL,
    "giverId" text NOT NULL,
    "targetId" text NOT NULL,
    action public."SwipeAction" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."SystemSetting" (
    key text NOT NULL,
    value jsonb NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

CREATE TABLE public."User" (
    id text NOT NULL,
    email text NOT NULL,
    "emailVerifiedAt" timestamp(3) without time zone,
    "passwordHash" text,
    role public."Role" DEFAULT 'USER'::public."Role" NOT NULL,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    "suspendedUntil" timestamp(3) without time zone,
    "acceptedTermsAt" timestamp(3) without time zone NOT NULL,
    "marketingConsent" boolean DEFAULT false NOT NULL,
    "failedLogins" integer DEFAULT 0 NOT NULL,
    "lockedUntil" timestamp(3) without time zone,
    "lastActiveAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "deletedAt" timestamp(3) without time zone,
    "referralCode" text
);

CREATE TABLE public."UserInterest" (
    "userId" text NOT NULL,
    "interestId" text NOT NULL
);

CREATE TABLE public."VerificationRequest" (
    id text NOT NULL,
    "userId" text NOT NULL,
    "selfieKey" text NOT NULL,
    status public."ModerationStatus" DEFAULT 'PENDING'::public."ModerationStatus" NOT NULL,
    "reviewedById" text,
    "reviewedAt" timestamp(3) without time zone,
    note text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."VerificationToken" (
    id text NOT NULL,
    "userId" text NOT NULL,
    type public."TokenType" NOT NULL,
    "tokenHash" text NOT NULL,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "usedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public."WebhookEvent" (
    id text NOT NULL,
    provider text NOT NULL,
    "eventId" text NOT NULL,
    type text NOT NULL,
    "receivedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "processedAt" timestamp(3) without time zone
);

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Boost"
    ADD CONSTRAINT "Boost_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."CreditTransaction"
    ADD CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."CreditWallet"
    ADD CONSTRAINT "CreditWallet_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Entitlement"
    ADD CONSTRAINT "Entitlement_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."FeatureFlag"
    ADD CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Interest"
    ADD CONSTRAINT "Interest_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."LiveInvite"
    ADD CONSTRAINT "LiveInvite_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."LiveSearch"
    ADD CONSTRAINT "LiveSearch_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."MessageAttachment"
    ADD CONSTRAINT "MessageAttachment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PlanPrice"
    ADD CONSTRAINT "PlanPrice_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Preference"
    ADD CONSTRAINT "Preference_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."ProfilePhoto"
    ADD CONSTRAINT "ProfilePhoto_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Profile"
    ADD CONSTRAINT "Profile_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."PromoCode"
    ADD CONSTRAINT "PromoCode_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Referral"
    ADD CONSTRAINT "Referral_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Refund"
    ADD CONSTRAINT "Refund_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SubscriptionPlan"
    ADD CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Subscription"
    ADD CONSTRAINT "Subscription_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."Swipe"
    ADD CONSTRAINT "Swipe_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."SystemSetting"
    ADD CONSTRAINT "SystemSetting_pkey" PRIMARY KEY (key);

ALTER TABLE ONLY public."UserInterest"
    ADD CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("userId", "interestId");

ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."VerificationRequest"
    ADD CONSTRAINT "VerificationRequest_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."VerificationToken"
    ADD CONSTRAINT "VerificationToken_pkey" PRIMARY KEY (id);

ALTER TABLE ONLY public."WebhookEvent"
    ADD CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY (id);

CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON public."Account" USING btree (provider, "providerAccountId");

CREATE INDEX "Account_userId_idx" ON public."Account" USING btree ("userId");

CREATE INDEX "AuditLog_action_createdAt_idx" ON public."AuditLog" USING btree (action, "createdAt");

CREATE INDEX "AuditLog_actorId_createdAt_idx" ON public."AuditLog" USING btree ("actorId", "createdAt");

CREATE INDEX "Block_blockedId_idx" ON public."Block" USING btree ("blockedId");

CREATE UNIQUE INDEX "Block_blockerId_blockedId_key" ON public."Block" USING btree ("blockerId", "blockedId");

CREATE INDEX "Boost_userId_endsAt_idx" ON public."Boost" USING btree ("userId", "endsAt");

CREATE UNIQUE INDEX "Conversation_matchId_key" ON public."Conversation" USING btree ("matchId");

CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON public."CreditTransaction" USING btree ("userId", "createdAt");

CREATE UNIQUE INDEX "CreditTransaction_userId_reason_refId_key" ON public."CreditTransaction" USING btree ("userId", reason, "refId");

CREATE UNIQUE INDEX "CreditWallet_userId_type_key" ON public."CreditWallet" USING btree ("userId", type);

CREATE UNIQUE INDEX "Entitlement_userId_key" ON public."Entitlement" USING btree ("userId");

CREATE UNIQUE INDEX "FeatureFlag_key_key" ON public."FeatureFlag" USING btree (key);

CREATE UNIQUE INDEX "Interest_slug_key" ON public."Interest" USING btree (slug);

CREATE UNIQUE INDEX "Invoice_number_key" ON public."Invoice" USING btree (number);

CREATE UNIQUE INDEX "Invoice_paymentId_key" ON public."Invoice" USING btree ("paymentId");

CREATE INDEX "LiveInvite_inviteeId_status_idx" ON public."LiveInvite" USING btree ("inviteeId", status);

CREATE UNIQUE INDEX "LiveInvite_searchId_inviteeId_key" ON public."LiveInvite" USING btree ("searchId", "inviteeId");

CREATE INDEX "LiveInvite_seekerId_status_idx" ON public."LiveInvite" USING btree ("seekerId", status);

CREATE INDEX "LiveSearch_status_expiresAt_idx" ON public."LiveSearch" USING btree (status, "expiresAt");

CREATE INDEX "LiveSearch_userId_createdAt_idx" ON public."LiveSearch" USING btree ("userId", "createdAt");

CREATE UNIQUE INDEX "Match_userAId_userBId_key" ON public."Match" USING btree ("userAId", "userBId");

CREATE INDEX "Match_userBId_idx" ON public."Match" USING btree ("userBId");

CREATE INDEX "MessageAttachment_messageId_idx" ON public."MessageAttachment" USING btree ("messageId");

CREATE INDEX "Message_conversationId_createdAt_idx" ON public."Message" USING btree ("conversationId", "createdAt" DESC);

CREATE INDEX "Message_senderId_idx" ON public."Message" USING btree ("senderId");

CREATE INDEX "ModerationAction_appealStatus_idx" ON public."ModerationAction" USING btree ("appealStatus");

CREATE INDEX "ModerationAction_targetUserId_createdAt_idx" ON public."ModerationAction" USING btree ("targetUserId", "createdAt");

CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON public."NotificationPreference" USING btree ("userId");

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON public."Notification" USING btree ("userId", "readAt", "createdAt" DESC);

CREATE UNIQUE INDEX "Payment_provider_providerRef_key" ON public."Payment" USING btree (provider, "providerRef");

CREATE INDEX "Payment_userId_createdAt_idx" ON public."Payment" USING btree ("userId", "createdAt");

CREATE UNIQUE INDEX "PlanPrice_planId_months_key" ON public."PlanPrice" USING btree ("planId", months);

CREATE UNIQUE INDEX "Preference_userId_key" ON public."Preference" USING btree ("userId");

CREATE UNIQUE INDEX "Product_code_key" ON public."Product" USING btree (code);

CREATE INDEX "ProfilePhoto_moderationStatus_idx" ON public."ProfilePhoto" USING btree ("moderationStatus");

CREATE INDEX "ProfilePhoto_profileId_position_idx" ON public."ProfilePhoto" USING btree ("profileId", "position");

CREATE INDEX "Profile_country_city_idx" ON public."Profile" USING btree (country, city);

CREATE INDEX "Profile_gender_birthDate_idx" ON public."Profile" USING btree (gender, "birthDate");

CREATE UNIQUE INDEX "Profile_userId_key" ON public."Profile" USING btree ("userId");

CREATE INDEX "Profile_visibility_boostedUntil_idx" ON public."Profile" USING btree (visibility, "boostedUntil");

CREATE UNIQUE INDEX "PromoCode_code_key" ON public."PromoCode" USING btree (code);

CREATE UNIQUE INDEX "Referral_refereeId_key" ON public."Referral" USING btree ("refereeId");

CREATE INDEX "Referral_referrerId_status_idx" ON public."Referral" USING btree ("referrerId", status);

CREATE INDEX "Refund_paymentId_idx" ON public."Refund" USING btree ("paymentId");

CREATE INDEX "Refund_status_createdAt_idx" ON public."Refund" USING btree (status, "createdAt");

CREATE INDEX "Report_status_createdAt_idx" ON public."Report" USING btree (status, "createdAt");

CREATE INDEX "Report_targetId_idx" ON public."Report" USING btree ("targetId");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON public."Session" USING btree ("tokenHash");

CREATE INDEX "Session_userId_revokedAt_idx" ON public."Session" USING btree ("userId", "revokedAt");

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON public."SubscriptionPlan" USING btree (code);

CREATE INDEX "Subscription_currentPeriodEnd_status_idx" ON public."Subscription" USING btree ("currentPeriodEnd", status);

CREATE INDEX "Subscription_userId_status_idx" ON public."Subscription" USING btree ("userId", status);

CREATE INDEX "Swipe_giverId_createdAt_idx" ON public."Swipe" USING btree ("giverId", "createdAt");

CREATE UNIQUE INDEX "Swipe_giverId_targetId_key" ON public."Swipe" USING btree ("giverId", "targetId");

CREATE INDEX "Swipe_targetId_action_idx" ON public."Swipe" USING btree ("targetId", action);

CREATE INDEX "UserInterest_interestId_idx" ON public."UserInterest" USING btree ("interestId");

CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

CREATE INDEX "User_lastActiveAt_idx" ON public."User" USING btree ("lastActiveAt");

CREATE UNIQUE INDEX "User_referralCode_key" ON public."User" USING btree ("referralCode");

CREATE INDEX "User_status_role_idx" ON public."User" USING btree (status, role);

CREATE INDEX "VerificationRequest_status_createdAt_idx" ON public."VerificationRequest" USING btree (status, "createdAt");

CREATE INDEX "VerificationRequest_userId_idx" ON public."VerificationRequest" USING btree ("userId");

CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON public."VerificationToken" USING btree ("tokenHash");

CREATE INDEX "VerificationToken_userId_type_idx" ON public."VerificationToken" USING btree ("userId", type);

CREATE UNIQUE INDEX "WebhookEvent_provider_eventId_key" ON public."WebhookEvent" USING btree (provider, "eventId");

ALTER TABLE ONLY public."Account"
    ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."AuditLog"
    ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Block"
    ADD CONSTRAINT "Block_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Boost"
    ADD CONSTRAINT "Boost_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Conversation"
    ADD CONSTRAINT "Conversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES public."Match"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CreditTransaction"
    ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."CreditWallet"
    ADD CONSTRAINT "CreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Entitlement"
    ADD CONSTRAINT "Entitlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Invoice"
    ADD CONSTRAINT "Invoice_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."Payment"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."LiveInvite"
    ADD CONSTRAINT "LiveInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."LiveInvite"
    ADD CONSTRAINT "LiveInvite_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES public."LiveSearch"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."LiveInvite"
    ADD CONSTRAINT "LiveInvite_seekerId_fkey" FOREIGN KEY ("seekerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."LiveSearch"
    ADD CONSTRAINT "LiveSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_userAId_fkey" FOREIGN KEY ("userAId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Match"
    ADD CONSTRAINT "Match_userBId_fkey" FOREIGN KEY ("userBId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."MessageAttachment"
    ADD CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public."Message"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES public."Conversation"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Message"
    ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_moderatorId_fkey" FOREIGN KEY ("moderatorId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES public."Report"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."ModerationAction"
    ADD CONSTRAINT "ModerationAction_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."NotificationPreference"
    ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Notification"
    ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES public."PromoCode"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES public."Subscription"(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE ONLY public."Payment"
    ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."PlanPrice"
    ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."SubscriptionPlan"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Preference"
    ADD CONSTRAINT "Preference_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."ProfilePhoto"
    ADD CONSTRAINT "ProfilePhoto_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES public."Profile"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Profile"
    ADD CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Referral"
    ADD CONSTRAINT "Referral_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Referral"
    ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Refund"
    ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES public."Payment"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Report"
    ADD CONSTRAINT "Report_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Session"
    ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Subscription"
    ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES public."SubscriptionPlan"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE ONLY public."Subscription"
    ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Swipe"
    ADD CONSTRAINT "Swipe_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."Swipe"
    ADD CONSTRAINT "Swipe_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."UserInterest"
    ADD CONSTRAINT "UserInterest_interestId_fkey" FOREIGN KEY ("interestId") REFERENCES public."Interest"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."UserInterest"
    ADD CONSTRAINT "UserInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VerificationRequest"
    ADD CONSTRAINT "VerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE ONLY public."VerificationToken"
    ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;


