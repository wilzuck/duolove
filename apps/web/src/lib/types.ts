import type { CreditType, Gender, Intent, Limits, LiveCriteria, Living, PlanCode, PlanFeatures, Seeking } from '@duomatch/types';

export type { Limits };

export interface Photo { id: string; url: string; thumbUrl: string; isPrimary?: boolean; position?: number }
export interface Card {
  id: string; displayName: string; age: number; city: string; country: string; bio: string; occupation: string | null;
  intent: Intent; verified: boolean; languages: string[]; interests: string[]; commonInterests: string[];
  distanceKm: number | null; compatibility: number | null; photos: Photo[];
  superLike?: boolean; likedAt?: string;
  hasChildren?: boolean | null; likesPets?: boolean | null; living?: Living | null; heightCm?: number | null; originCountry?: string | null;
}
export interface Me {
  id: string; email: string; emailVerified: boolean; role: 'USER' | 'MODERATOR' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED' | 'DELETED'; suspendedUntil: string | null; marketingConsent: boolean;
  profile: { displayName: string; onboarded: boolean; completeness: number; thumbUrl: string | null } | null;
  entitlement: { plan: PlanCode; validUntil: string | null; credits: Record<CreditType, number>; limits: Limits };
  unreadNotifications: number;
  moderation: { reason: string; appealStatus: 'NONE' | 'PENDING' | 'ACCEPTED' | 'REJECTED'; id: string } | null;
}
export interface MyProfile {
  id: string; displayName: string; age: number; gender: Gender; pronouns: string | null; country: string; city: string; bio: string;
  occupation: string | null; languages: string[]; intent: Intent; visibility: 'VISIBLE' | 'HIDDEN'; incognito: boolean; verified: boolean;
  verificationPending: boolean; readReceipts: boolean; boostedUntil: string | null; completeness: number;
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
}
export interface Paged<T> { items: T[]; nextCursor: string | null }
export interface SwipeResult { action: string; matched: boolean; match: { id: string; conversationId: string; user: Card | null } | null }
export interface NotificationItem { id: string; type: string; readAt: string | null; createdAt: string; data: Record<string, unknown> }
export interface PriceOption { months: number; discountPercent: number; totalXof: number; monthlyEquivalentXof: number; savingsXof: number }
export interface PlanView { code: PlanCode; name: string; priceXof: number; currency: string; features: PlanFeatures; featured: boolean; sortOrder: number; prices: PriceOption[] }
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
