import { z } from 'zod';

/** Âge minimum légal pour utiliser Crushduo. */
export const MIN_AGE = 18;

export const GENDERS = ['MAN', 'WOMAN', 'NON_BINARY', 'OTHER'] as const;
export type Gender = (typeof GENDERS)[number];

export const SEEKING = ['MEN', 'WOMEN', 'EVERYONE'] as const;
export type Seeking = (typeof SEEKING)[number];

export const INTENTS = ['SERIOUS', 'MARRIAGE', 'DATING', 'FRIENDSHIP', 'UNSURE'] as const;
export type Intent = (typeof INTENTS)[number];

export const PLAN_CODES = ['FREE', 'PREMIUM', 'VIP'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const REPORT_REASONS = [
  'FAKE_PROFILE',
  'SCAM',
  'HARASSMENT',
  'INAPPROPRIATE_CONTENT',
  'UNDERAGE',
  'SPAM',
  'OTHER',
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Pays prioritaires (marché cible). Code ISO 3166-1 alpha-2. */
export const COUNTRIES = [
  { code: 'BJ', fr: 'Bénin', en: 'Benin' },
  { code: 'CI', fr: "Côte d'Ivoire", en: 'Ivory Coast' },
  { code: 'TG', fr: 'Togo', en: 'Togo' },
  { code: 'SN', fr: 'Sénégal', en: 'Senegal' },
  { code: 'NE', fr: 'Niger', en: 'Niger' },
  { code: 'CM', fr: 'Cameroun', en: 'Cameroon' },
  { code: 'BF', fr: 'Burkina Faso', en: 'Burkina Faso' },
  { code: 'ML', fr: 'Mali', en: 'Mali' },
  { code: 'GA', fr: 'Gabon', en: 'Gabon' },
  { code: 'CD', fr: 'RD Congo', en: 'DR Congo' },
  { code: 'FR', fr: 'France', en: 'France' },
  { code: 'BE', fr: 'Belgique', en: 'Belgium' },
  { code: 'CA', fr: 'Canada', en: 'Canada' },
] as const;
/** Drapeau émoji d'un code pays ISO 3166-1 alpha-2 (lettres « indicateur régional » Unicode). */
export const countryFlag = (code: string): string => (/^[A-Za-z]{2}$/.test(code) ? String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : '');
export const COUNTRY_CODES = COUNTRIES.map((c) => c.code) as [string, ...string[]];

/** Centres d'intérêt proposés à l'onboarding (slug stable, libellé traduit côté web). */
export const INTEREST_SLUGS = [
  'music', 'cinema', 'cooking', 'travel', 'sport', 'reading', 'dance', 'faith',
  'fashion', 'tech', 'art', 'nature', 'photography', 'gaming', 'entrepreneurship', 'family',
] as const;

/**
 * Fonctionnalités d'une formule : CONFIGURABLES depuis l'administration (colonne `SubscriptionPlan.features`).
 * La logique métier ne lit jamais une formule « en dur » : elle lit ces clés via EntitlementsService.
 */
export const planFeaturesSchema = z.object({
  /** -1 = illimité (plafond anti-abus appliqué côté serveur). */
  daily_likes_limit: z.number().int().min(-1).max(100_000),
  super_likes_weekly: z.number().int().min(0).max(1000),
  can_see_likes: z.boolean(),
  advanced_filters: z.boolean(),
  boosts_monthly: z.number().int().min(0).max(100),
  incognito_mode: z.boolean(),
  rewind_enabled: z.boolean(),
  ads_enabled: z.boolean(),
  /** Menu « Match » (rencontres en direct) : réservé aux formules qui l'incluent ; sinon `live_match_trials` essais. */
  live_match_enabled: z.boolean().default(false),
  live_match_trials: z.number().int().min(0).max(20).default(2),
  /** Jetons Match offerts pour chaque mois d'abonnement acheté (crédités à l'activation, comme les boosts inclus). */
  match_tokens_monthly: z.number().int().min(0).max(500).default(0),
  /** Envoi de photos dans les messages : réservé aux formules qui l'incluent (le serveur refuse sinon, 403 PLAN_REQUIRED). */
  chat_images_enabled: z.boolean().default(false),
  read_receipts_control: z.boolean().default(false),
  daily_picks_count: z.number().int().min(1).max(30).default(5),
  /** Messagerie : idées pour briser la glace, appels audio / vidéo (lancer), rendez-vous (proposer). Réservés aux formules qui les incluent. */
  chat_suggestions_enabled: z.boolean().default(false),
  calls_enabled: z.boolean().default(false),
  dates_enabled: z.boolean().default(false),
});
export type PlanFeatures = z.infer<typeof planFeaturesSchema>;
export const PLAN_FEATURE_KEYS = Object.keys(planFeaturesSchema.shape) as (keyof PlanFeatures)[];

/** Plafond quotidien de likes quand la formule est « illimitée » : protège contre les scripts et les abus. */
export const UNLIMITED_LIKES_CAP = 1000;

/** Forme consommée par l'application (dérivée des fonctionnalités configurées). */
export interface Limits {
  dailyLikes: number; unlimitedLikes: boolean; superLikesWeekly: number; seeLikers: boolean; advancedFilters: boolean;
  rewind: boolean; boostsMonthly: number; incognito: boolean; ads: boolean; liveMatch: boolean; liveMatchTrials: number; matchTokensMonthly: number; chatImages: boolean; readReceiptsControl: boolean; dailyPicksCount: number;
  chatSuggestions: boolean; calls: boolean; dates: boolean;
}
export function limitsFromFeatures(f: PlanFeatures): Limits {
  const unlimited = f.daily_likes_limit < 0;
  return {
    dailyLikes: unlimited ? UNLIMITED_LIKES_CAP : f.daily_likes_limit, unlimitedLikes: unlimited, superLikesWeekly: f.super_likes_weekly,
    seeLikers: f.can_see_likes, advancedFilters: f.advanced_filters, rewind: f.rewind_enabled, boostsMonthly: f.boosts_monthly, incognito: f.incognito_mode, ads: f.ads_enabled,
    liveMatch: f.live_match_enabled, liveMatchTrials: f.live_match_trials, matchTokensMonthly: f.match_tokens_monthly, chatImages: f.chat_images_enabled, readReceiptsControl: f.read_receipts_control, dailyPicksCount: f.daily_picks_count,
    chatSuggestions: f.chat_suggestions_enabled, calls: f.calls_enabled, dates: f.dates_enabled,
  };
}

/** Durée 0 = « formule de 7 jours » (essai payant sans engagement ; désactivée tant que l'administration ne l'active pas). */
export const WEEK = 0;
export const DURATION_MONTHS = [0, 1, 3, 6, 12] as const;
export type DurationMonths = (typeof DURATION_MONTHS)[number];
/** Remises par durée proposées à l'initialisation ; modifiables dans l'administration. */
export const DEFAULT_DISCOUNTS: Record<DurationMonths, number> = { 0: 0, 1: 0, 3: 10, 6: 20, 12: 30 };

/** Prix d'une durée, calculé à partir du tarif mensuel RÉELLEMENT configuré (jamais d'un montant client). */
export function priceForDuration(monthlyXof: number, months: number, discountPercent: number, amountOverride?: number | null): number {
  if (amountOverride != null) return amountOverride;
  if (months === WEEK) return Math.max(50, Math.round((monthlyXof * 0.4) / 50) * 50); // 7 jours : 40 % du tarif mensuel, arrondi à 50 FCFA
  return Math.round((monthlyXof * months * (100 - discountPercent)) / 100);
}

/** Valeurs initiales (création si absentes uniquement : une modification d'administrateur n'est JAMAIS écrasée). */
export const DEFAULT_PLANS: Record<PlanCode, { name: string; priceXof: number; featured: boolean; sortOrder: number; features: PlanFeatures }> = {
  FREE: { name: 'Gratuit', priceXof: 0, featured: false, sortOrder: 0, features: { daily_likes_limit: 20, super_likes_weekly: 0, can_see_likes: false, advanced_filters: false, boosts_monthly: 0, incognito_mode: false, rewind_enabled: false, ads_enabled: true, live_match_enabled: false, live_match_trials: 2, match_tokens_monthly: 0, chat_images_enabled: false, read_receipts_control: false, daily_picks_count: 5, chat_suggestions_enabled: false, calls_enabled: false, dates_enabled: false } },
  PREMIUM: { name: 'Premium', priceXof: 2500, featured: true, sortOrder: 1, features: { daily_likes_limit: -1, super_likes_weekly: 5, can_see_likes: true, advanced_filters: true, boosts_monthly: 0, incognito_mode: false, rewind_enabled: true, ads_enabled: false, live_match_enabled: true, live_match_trials: 0, match_tokens_monthly: 5, chat_images_enabled: true, read_receipts_control: true, daily_picks_count: 10, chat_suggestions_enabled: true, calls_enabled: false, dates_enabled: true } },
  VIP: { name: 'VIP', priceXof: 5000, featured: false, sortOrder: 2, features: { daily_likes_limit: -1, super_likes_weekly: 15, can_see_likes: true, advanced_filters: true, boosts_monthly: 2, incognito_mode: true, rewind_enabled: true, ads_enabled: false, live_match_enabled: true, live_match_trials: 0, match_tokens_monthly: 15, chat_images_enabled: true, read_receipts_control: true, daily_picks_count: 10, chat_suggestions_enabled: true, calls_enabled: false, dates_enabled: true } },
};

export const CREDIT_TYPES = ['SUPER_LIKE', 'BOOST_30', 'BOOST_120', 'BOOST_1440', 'MATCH_TOKEN'] as const;
export type CreditType = (typeof CREDIT_TYPES)[number];
export const BOOST_MINUTES: Record<Exclude<CreditType, 'SUPER_LIKE' | 'MATCH_TOKEN'>, number> = { BOOST_30: 30, BOOST_120: 120, BOOST_1440: 1440 };

export const DEFAULT_PRODUCTS = [
  { code: 'BOOST_30', kind: 'BOOST', creditType: 'BOOST_30', name: 'Boost 30 minutes', quantity: 1, priceXof: 300, sortOrder: 0 },
  { code: 'BOOST_120', kind: 'BOOST', creditType: 'BOOST_120', name: 'Boost 2 heures', quantity: 1, priceXof: 700, sortOrder: 1 },
  { code: 'BOOST_1440', kind: 'BOOST', creditType: 'BOOST_1440', name: 'Boost 24 heures', quantity: 1, priceXof: 1500, sortOrder: 2 },
  { code: 'SUPERLIKE_5', kind: 'SUPER_LIKE_PACK', creditType: 'SUPER_LIKE', name: 'Pack 5 Super Likes', quantity: 5, priceXof: 500, sortOrder: 3 },
  { code: 'SUPERLIKE_15', kind: 'SUPER_LIKE_PACK', creditType: 'SUPER_LIKE', name: 'Pack 15 Super Likes', quantity: 15, priceXof: 1200, sortOrder: 4 },
  { code: 'SUPERLIKE_30', kind: 'SUPER_LIKE_PACK', creditType: 'SUPER_LIKE', name: 'Pack 30 Super Likes', quantity: 30, priceXof: 2000, sortOrder: 5 },
  { code: 'TOKENS_5', kind: 'TOKEN_PACK', creditType: 'MATCH_TOKEN', name: 'Pack 5 tokens Match', quantity: 5, priceXof: 1000, sortOrder: 6 },
  { code: 'TOKENS_15', kind: 'TOKEN_PACK', creditType: 'MATCH_TOKEN', name: 'Pack 15 tokens Match', quantity: 15, priceXof: 2500, sortOrder: 7 },
  { code: 'TOKENS_30', kind: 'TOKEN_PACK', creditType: 'MATCH_TOKEN', name: 'Pack 30 tokens Match', quantity: 30, priceXof: 4500, sortOrder: 8 },
] as const;

export function ageFromBirthDate(birthDate: Date, now = new Date()): number {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const m = now.getUTCMonth() - birthDate.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < birthDate.getUTCDate())) age--;
  return age;
}

const password = z
  .string()
  .min(10, 'password_too_short')
  .max(128)
  .regex(/[a-z]/, 'password_lowercase')
  .regex(/[A-Z]/, 'password_uppercase')
  .regex(/[0-9]/, 'password_digit');

export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(40),
  email: z.string().trim().toLowerCase().email().max(254),
  password,
  birthDate: z.coerce.date().refine((d) => ageFromBirthDate(d) >= MIN_AGE, { message: 'underage' }),
  gender: z.enum(GENDERS),
  country: z.enum(COUNTRY_CODES),
  city: z.string().trim().min(2).max(80),
  acceptTerms: z.literal(true, { message: 'terms_required' }),
  /** Code de parrainage (facultatif) : un code inconnu est ignoré sans erreur (pas d'énumération de codes). */
  referralCode: z.string().trim().toUpperCase().max(32).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** Situation de vie (facultatif sur le profil). */
export const LIVING = ['ALONE', 'FAMILY', 'ROOMMATES'] as const;
export type Living = (typeof LIVING)[number];
/** Mode de vie (facultatif) : situation, études, tabac, alcool, religion. Le signe astrologique est calculé côté serveur. */
export const MARITAL = ['SINGLE', 'DIVORCED', 'WIDOWED', 'SEPARATED'] as const;
export const EDUCATION = ['SECONDARY', 'BACCALAUREATE', 'BACHELOR', 'MASTER', 'DOCTORATE', 'OTHER'] as const;
export const HABIT = ['NEVER', 'SOMETIMES', 'OFTEN'] as const;
export const RELIGION = ['CHRISTIAN', 'MUSLIM', 'TRADITIONAL', 'OTHER', 'NONE'] as const;
export const TRI = ['ANY', 'YES', 'NO'] as const;

/** Menu « Match » : jetons, essais, délais. Modifiables ici ; la logique ne code rien en dur ailleurs. */
export const LIVE = {
  /** Jetons offerts une seule fois quand le profil atteint 100 %. */
  PROFILE_GIFT_TOKENS: 3,
  /** Prix d'une conversation ouverte avec une personne qui a accepté. */
  TOKENS_PER_CHAT: 1,
  /** Nombre maximal de personnes à qui l'on peut parler pour une recherche. */
  MAX_CHOICES: 2,
  /** Délai minimal entre deux lancements de recherche. */
  COOLDOWN_MINUTES: 15,
  /** Durée pendant laquelle une recherche reste active (les personnes qui se connectent ensuite sont invitées). */
  SEARCH_HOURS: 24,
  /** Une invitation sans réponse expire après ce délai. */
  INVITE_MINUTES: 30,
  /** Invitations envoyées au plus par recherche. */
  MAX_INVITES: 12,
  /** Invitations en attente au plus pour une même personne (anti-harcèlement). */
  MAX_PENDING_PER_INVITEE: 3,
  /** Une personne est « en ligne » si active depuis moins de ce délai. */
  ONLINE_MINUTES: 5,
} as const;

export const liveCriteriaSchema = z
  .object({
    seeking: z.enum(SEEKING),
    ageMin: z.number().int().min(MIN_AGE).max(99),
    ageMax: z.number().int().min(MIN_AGE).max(99),
    country: z.enum(COUNTRY_CODES).nullable().optional(),
    hasChildren: z.enum(TRI).default('ANY'),
    likesPets: z.enum(TRI).default('ANY'),
    living: z.enum(['ANY', ...LIVING]).default('ANY'),
    heightMin: z.number().int().min(120).max(230).nullable().optional(),
    heightMax: z.number().int().min(120).max(230).nullable().optional(),
    originCountry: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
    intents: z.array(z.enum(INTENTS)).max(5).optional(),
  })
  .refine((c) => c.ageMin <= c.ageMax, { message: 'age_range', path: ['ageMax'] })
  .refine((c) => c.heightMin == null || c.heightMax == null || c.heightMin <= c.heightMax, { message: 'height_range', path: ['heightMax'] });
export type LiveCriteria = z.infer<typeof liveCriteriaSchema>;

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(2).max(40).optional(),
  bio: z.string().trim().max(500).optional(),
  occupation: z.string().trim().max(80).optional(),
  pronouns: z.string().trim().max(30).optional(),
  country: z.enum(COUNTRY_CODES).optional(),
  city: z.string().trim().min(2).max(80).optional(),
  languages: z.array(z.string().min(2).max(5)).max(8).optional(),
  intent: z.enum(INTENTS).optional(),
  interests: z.array(z.enum(INTEREST_SLUGS)).max(10).optional(),
  gender: z.enum(GENDERS).optional(),
  // Mode de vie (facultatif ; `null` = effacer). Utilisé par les critères du menu Match.
  hasChildren: z.boolean().nullable().optional(),
  likesPets: z.boolean().nullable().optional(),
  living: z.enum(LIVING).nullable().optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  originCountry: z.string().regex(/^[A-Z]{2}$/).nullable().optional(),
  maritalStatus: z.enum(MARITAL).nullable().optional(),
  education: z.enum(EDUCATION).nullable().optional(),
  smoking: z.enum(HABIT).nullable().optional(),
  alcohol: z.enum(HABIT).nullable().optional(),
  religion: z.enum(RELIGION).nullable().optional(),
  showReligion: z.boolean().optional(),
  // « Ce qui compte le plus pour moi » : 3 au plus, codes du catalogue ou texte libre.
  values: z.array(z.string().trim().min(2).max(24)).max(3).optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const preferenceSchema = z
  .object({
    seeking: z.enum(SEEKING),
    ageMin: z.number().int().min(MIN_AGE).max(99),
    ageMax: z.number().int().min(MIN_AGE).max(99),
    country: z.enum(COUNTRY_CODES).nullable().optional(),
    city: z.string().trim().max(80).nullable().optional(),
    intents: z.array(z.enum(INTENTS)).max(5).optional(),
    // Filtres Premium (contrôlés côté serveur)
    languages: z.array(z.string().min(2).max(5)).max(8).optional(),
    interests: z.array(z.enum(INTEREST_SLUGS)).max(10).optional(),
    verifiedOnly: z.boolean().optional(),
    activeRecently: z.boolean().optional(),
    maxDistanceKm: z.number().int().min(5).max(500).nullable().optional(),
  })
  .refine((p) => p.ageMin <= p.ageMax, { message: 'age_range', path: ['ageMax'] });
export type PreferenceInput = z.infer<typeof preferenceSchema>;

export const locationSchema = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

/** Code promotionnel saisi par le membre : normalisé en majuscules ; la remise est TOUJOURS calculée côté serveur. */
export const promoCodeInput = z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, 'invalid_promo');
export const checkoutSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscription'), plan: z.enum(['PREMIUM', 'VIP']), months: z.union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)]).default(1), promoCode: promoCodeInput.optional() }),
  z.object({ type: z.literal('product'), code: z.string().min(2).max(40), promoCode: promoCodeInput.optional() }),
]);
export const promoPreviewSchema = z.object({ code: promoCodeInput, target: checkoutSchema });
export const promoRedeemSchema = z.object({ code: promoCodeInput });

/** Parrainage : récompense versée une seule fois par filleul, quand son profil est complet (100 %) et son e-mail vérifié. */
export const REFERRAL = { REFERRER_TOKENS: 5, REFEREE_TOKENS: 2, MAX_REWARDED_PER_REFERRER: 20, CODE_LENGTH: 8 } as const;
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const swipeSchema = z.object({
  targetId: z.string().min(1),
  action: z.enum(['LIKE', 'PASS', 'SUPER_LIKE']),
});
export type SwipeInput = z.infer<typeof swipeSchema>;

export const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
export const reportSchema = z.object({
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).optional(),
});

/**
 * Catalogue des interrupteurs de fonctionnalité (feature flags). La liste est FERMÉE : l'administration ne crée pas de clés libres,
 * elle active ou coupe celles-ci. Chaque clé est appliquée côté SERVEUR (jamais seulement masquée dans l'interface).
 * Absence de ligne en base = valeur par défaut `defaultOn`. `emergency` = prévu comme coupure d'urgence.
 */
export const FLAG_CATEGORIES = ['access', 'money', 'social'] as const;
export type FlagCategory = (typeof FLAG_CATEGORIES)[number];
export const FEATURE_FLAGS = [
  { key: 'registration_open', category: 'access', defaultOn: true, emergency: true },
  { key: 'payments_enabled', category: 'money', defaultOn: true, emergency: true },
  { key: 'promo_codes', category: 'money', defaultOn: true, emergency: false },
  { key: 'boosts', category: 'money', defaultOn: true, emergency: false },
  { key: 'live_match', category: 'social', defaultOn: true, emergency: true },
  { key: 'super_likes', category: 'social', defaultOn: true, emergency: false },
  { key: 'chat_images', category: 'social', defaultOn: true, emergency: true },
  { key: 'referral_program', category: 'social', defaultOn: true, emergency: false },
  { key: 'profile_prompts', category: 'social', defaultOn: true, emergency: false },
  { key: 'like_comments', category: 'social', defaultOn: true, emergency: false },
  { key: 'daily_picks', category: 'social', defaultOn: true, emergency: false },
  { key: 'message_reactions', category: 'social', defaultOn: true, emergency: false },
  { key: 'message_replies', category: 'social', defaultOn: true, emergency: false },
  { key: 'icebreakers', category: 'social', defaultOn: true, emergency: false },
  { key: 'date_proposals', category: 'social', defaultOn: true, emergency: false },
  { key: 'pause_mode', category: 'social', defaultOn: true, emergency: false },
  { key: 'profile_tips', category: 'social', defaultOn: true, emergency: false },
  { key: 'calls', category: 'social', defaultOn: true, emergency: true },
  { key: 'speed_dating', category: 'social', defaultOn: true, emergency: true },
  { key: 'daily_question', category: 'social', defaultOn: true, emergency: true },
] as const satisfies readonly { key: string; category: FlagCategory; defaultOn: boolean; emergency: boolean }[];
export type FlagKey = (typeof FEATURE_FLAGS)[number]['key'];
export const FLAG_KEYS = FEATURE_FLAGS.map((f) => f.key) as FlagKey[];
