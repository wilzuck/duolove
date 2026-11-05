import type { CreditType, Gender, Intent, Limits, LiveCriteria, Living, PlanCode, PlanFeatures, Seeking } from '@duomatch/types';

export type { Limits };

export interface Photo { id: string; url: string; thumbUrl: string; isPrimary?: boolean; position?: number }
export type LikeKind = 'PROFILE' | 'PHOTO' | 'PROMPT' | 'INTEREST';
export interface Affinity { score: number; reasons: { code: string; n?: number }[]; commonInterests: string[]; intentsCompatible: boolean; axes?: { intent: number; preferences: number; interests: number; location: number } }
export interface PromptAnswer { id: string; promptId: string; position: number; question: { fr: string; en: string }; answer: string }
export interface PromptDef { id: string; slug: string; textFr: string; textEn: string; active: boolean; sortOrder: number }
export interface EngagementConfig { flags: { profile_prompts: boolean; like_comments: boolean; daily_picks: boolean; message_reactions: boolean; message_replies: boolean; icebreakers: boolean; date_proposals: boolean; pause_mode: boolean; profile_tips: boolean; calls: boolean; speed_dating: boolean; daily_question: boolean }; calls: { enabled: boolean; simulated: boolean; ringSeconds: number; maxMinutes: number }; prompts: { min: number; max: number; answerMax: number }; commentMax: number; reactionEmojis: string[]; dates: { minNoticeHours: number; maxDaysAhead: number } }
export interface Card {
  id: string; displayName: string; age: number; city: string; country: string; bio: string; occupation: string | null;
  intent: Intent; verified: boolean; languages: string[]; interests: string[]; commonInterests: string[];
  distanceKm: number | null; compatibility: number | null; photos: Photo[];
  dailyQuestion?: { optionKey: string; same: boolean } | null;
  superLike?: boolean; likedAt?: string; affinity?: Affinity | null; prompts?: PromptAnswer[];
  comment?: string | null; likeTarget?: { kind: LikeKind; ref: string | null } | null; decision?: 'LIKE' | 'PASS' | 'SUPER_LIKE' | null;
  hasChildren?: boolean | null; likesPets?: boolean | null; living?: Living | null; heightCm?: number | null; originCountry?: string | null;
}
export interface Me {
  id: string; email: string; emailVerified: boolean; role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED'; suspendedUntil: string | null; marketingConsent: boolean;
  profile: { displayName: string; onboarded: boolean; completeness: number; thumbUrl: string | null; paused?: boolean; pauseEndsAt?: string | null } | null;
  entitlement: { plan: PlanCode; validUntil: string | null; credits: Record<CreditType, number>; limits: Limits };
  unreadNotifications: number;
  moderation: { reason: string; appealStatus: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED'; id: string } | null;
}
export interface MyProfile {
  id: string; displayName: string; age: number; gender: Gender; pronouns: string | null; country: string; city: string; bio: string;
  occupation: string | null; languages: string[]; intent: Intent; visibility: 'VISIBLE' | 'HIDDEN'; incognito: boolean; verified: boolean;
  verificationPending: boolean; readReceipts: boolean; readReceiptsLocked: boolean; typingIndicator: boolean; boostedUntil: string | null; completeness: number;
  completenessLevel: 'INCOMPLETE' | 'IN_PROGRESS' | 'COMPLETE'; onboarded: boolean;
  hasChildren: boolean | null; likesPets: boolean | null; living: Living | null; heightCm: number | null; originCountry: string | null; liveOptIn: boolean; interests: string[]; photos: Photo[];
  preference: { seeking: Seeking; ageMin: number; ageMax: number; country: string | null; city: string | null; intents: Intent[]; languages: string[]; interests: string[]; verifiedOnly: boolean; activeRecently: boolean; maxDistanceKm: number | null } | null;
}
export interface ConversationItem {
  id: string; matchId: string; createdAt: string; unread: number;
  user: { id: string; displayName: string; verified: boolean; thumbUrl: string | null };
  lastMessage: { body: string | null; hasImage: boolean; mine: boolean; createdAt: string } | null;
}
export interface ChatMessage {
  id: string; conversationId: string; senderId: string; mine: boolean; body: string | null; deleted: boolean;
  createdAt: string; readAt: string | null; attachments: { id: string; url: string; mime: string }[];
  reactions: { emoji: string; count: number; mine: boolean }[]; replyTo: { id: string; mine: boolean; deleted: boolean; body: string | null; hasImage: boolean } | null;
}
export interface Paged<T> { items: T[]; nextCursor: string | null }
export interface SwipeResult { action: string; matched: boolean; match: { id: string; conversationId: string; user: Card | null } | null }
export interface NotificationItem { id: string; type: string; readAt: string | null; createdAt: string; data: Record<string, unknown> }
export interface PriceOption { months: number; discountPercent: number; totalXof: number; monthlyEquivalentXof: number; savingsXof: number }
export interface PlanView { code: PlanCode; name: string; priceXof: number; currency: string; features: PlanFeatures; featured: boolean; sortOrder: number; prices: PriceOption[]; taglineFr?: string | null; taglineEn?: string | null }
export interface ProductView { code: string; kind: 'BOOST' | 'SUPER_LIKE_PACK' | 'TOKEN_PACK'; creditType: CreditType; name: string; quantity: number; priceXof: number; currency: string }
export interface Catalog { plans: PlanView[]; products: ProductView[] }
export interface SubscriptionState {
  plan: PlanCode; validUntil: string | null; limits: Limits; credits: Record<CreditType, number>;
  subscription: { id: string; plan: PlanCode; status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null } | null;
}
export interface PaymentItem { refundable: boolean; refund: string | null; id: string; kind: 'SUBSCRIPTION' | 'PRODUCT'; months: number; product: string | null; amountXof: number; currency: string; status: string; provider: string; plan: PlanCode | null; createdAt: string; paidAt: string | null; invoiceNumber: string | null }

export interface LiveAccepted extends Card { inviteId: string; status: 'ACCEPTED' | 'CHOSEN'; conversationId: string | null; liked: boolean; expiresAt: string }
export interface LiveState {
  access: { unlimited: boolean; trialsLeft: number | null; canStart: boolean };
  tokens: number; optIn: boolean;
  gift: { tokens: number; completeness: number; emailVerified: boolean };
  rules: { tokensPerChat: number; maxChoices: number; cooldownMinutes: number; searchHours: number };
  defaults: { seeking: Seeking; ageMin: number; ageMax: number; country: string | null };
  nextLaunchAt: string | null; incomingCount: number;
  search: { id: string; criteria: LiveCriteria; createdAt: string; expiresAt: string; pending: number; chosen: number; choicesLeft: number } | null;
  accepted: LiveAccepted[];
}
export interface LiveIncoming extends Card { inviteId: string; expiresAt: string }

export interface BlogCard { id: string; slug: string; locale: string; title: string; excerpt: string; coverUrl: string | null; coverThumbUrl: string | null; coverAlt: string | null; publishedAt: string | null; readMinutes: number }
export interface BlogPostFull extends BlogCard { body: string }
export interface AdminBlogRow extends BlogCard { status: 'DRAFT' | 'PUBLISHED'; coverKey: string | null; createdAt: string; updatedAt: string }
export interface AdminBlogPost extends AdminBlogRow { body: string }

export type DateStatus = 'PROPOSED' | 'ACCEPTED' | 'DECLINED' | 'RESCHEDULED' | 'CANCELED' | 'COMPLETED';
export interface DateItem {
  id: string; conversationId: string; status: DateStatus; startsAt: string; endsAt: string; placeKind: string; placeName: string; note: string | null;
  proposedByMe: boolean; previousId: string | null; createdAt: string; respondedAt: string | null; reminderMinutes: number | null; shared: boolean; myFeedback: number | null;
}
export interface SharedDate { status: DateStatus; startsAt: string; endsAt: string; placeKind: string; placeName: string; sharedBy: string; meeting: string; expiresAt: string }

export interface RhythmState {
  pause: { active: boolean; endsAt: string | null; maxDays: number; enabled: boolean };
  quiet: { start: string | null; end: string | null; tzOffsetMinutes: number; activeNow: boolean };
  dateReminders: boolean; limits: { maxEmailsPerDay: number };
}
export interface ProfileTip { code: string; have?: number; target?: number; anchor?: string }

export type CallStatus = 'RINGING' | 'ACTIVE' | 'DECLINED' | 'MISSED' | 'CANCELED' | 'ENDED';
export interface CallInfo {
  id: string; conversationId: string; kind: 'AUDIO' | 'VIDEO'; status: CallStatus; direction: 'incoming' | 'outgoing';
  other: { id: string; displayName: string }; ringExpiresAt: string | null; answeredAt: string | null; endedAt: string | null; maxMinutes: number; simulated: boolean;
}
export interface CallTicket { provider: 'livekit' | 'mock'; url: string; token: string; callId: string; kind: 'AUDIO' | 'VIDEO'; expiresInSeconds: number }

export interface SpeedPerson { id: string; displayName: string; age: number; city: string; bio: string; intent: string; interests: string[]; thumbUrl: string | null; left?: boolean }
export interface SpeedEventInfo {
  id: string; title: string; description: string; city: string | null; ageMin: number; ageMax: number; intent: string | null; capacity: number; registered: number; spotsLeft: number;
  roundSeconds: number; rounds: number; startsAt: string; status: string; cancelReason: string | null; phase: 'UPCOMING' | 'ROUND' | 'BREAK' | 'DECISION' | 'ENDED' | 'CANCELED';
  round: number; secondsLeft: number; myStatus: string | null; eligible?: string | null;
}
export interface SpeedRoom {
  event: SpeedEventInfo; rest: boolean; partner: SpeedPerson | null; pairId: string | null; myDecision?: string | null; eligible: string | null; messageMax: number;
  messages: { id: string; mine: boolean; body: string; createdAt: string }[];
  meetings: { pairId: string; round: number; user: SpeedPerson | null; myDecision: string | null }[];
  results: { user: SpeedPerson | null; conversationId: string }[];
}
export interface AdminSpeedRow extends SpeedEventInfo { pairs: number; mutualInterests: number }

export interface DailyQuestionState { enabled: boolean; question: { id: string; text: { fr: string; en: string }; options: { key: string; fr: string; en: string }[] } | null; myAnswer: string | null }
export interface AdminDailyQuestion { id: string; day: string | null; active: boolean; text: { fr: string; en: string }; options: { key: string; fr: string; en: string }[]; answers: number; perOption: Record<string, number>; isToday: boolean }
