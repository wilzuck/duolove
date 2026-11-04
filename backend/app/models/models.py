"""Modèles SQLAlchemy, générés depuis le schéma PostgreSQL puis adaptés (identifiants et updatedAt côté application).
Les noms de tables et colonnes sont ceux créés initialement par Prisma (casse conservée)."""
from typing import Optional
import datetime
import enum

from app.core.ids import new_id, utcnow

from sqlalchemy import ARRAY, Boolean, Column, DateTime, Double, Enum, ForeignKeyConstraint, Index, Integer, PrimaryKeyConstraint, String, Table, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TIMESTAMP
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

class Base(DeclarativeBase):
    pass


class AppealStatus(str, enum.Enum):
    NONE = 'NONE'
    PENDING = 'PENDING'
    ACCEPTED = 'ACCEPTED'
    REJECTED = 'REJECTED'


class CreditReason(str, enum.Enum):
    PURCHASE = 'PURCHASE'
    GRANT_PLAN = 'GRANT_PLAN'
    CONSUME = 'CONSUME'
    REFUND = 'REFUND'
    ADMIN_GRANT = 'ADMIN_GRANT'
    GRANT_PROFILE = 'GRANT_PROFILE'
    PROMO = 'PROMO'
    REFERRAL = 'REFERRAL'


class CreditType(str, enum.Enum):
    SUPER_LIKE = 'SUPER_LIKE'
    BOOST_30 = 'BOOST_30'
    BOOST_120 = 'BOOST_120'
    BOOST_1440 = 'BOOST_1440'
    MATCH_TOKEN = 'MATCH_TOKEN'


class Gender(str, enum.Enum):
    MAN = 'MAN'
    WOMAN = 'WOMAN'
    NON_BINARY = 'NON_BINARY'
    OTHER = 'OTHER'


class Intent(str, enum.Enum):
    SERIOUS = 'SERIOUS'
    MARRIAGE = 'MARRIAGE'
    DATING = 'DATING'
    FRIENDSHIP = 'FRIENDSHIP'
    UNSURE = 'UNSURE'


class LiveInviteStatus(str, enum.Enum):
    PENDING = 'PENDING'
    ACCEPTED = 'ACCEPTED'
    DECLINED = 'DECLINED'
    EXPIRED = 'EXPIRED'
    CHOSEN = 'CHOSEN'


class LiveSearchStatus(str, enum.Enum):
    ACTIVE = 'ACTIVE'
    CLOSED = 'CLOSED'
    EXPIRED = 'EXPIRED'


class LivingSituation(str, enum.Enum):
    ALONE = 'ALONE'
    FAMILY = 'FAMILY'
    ROOMMATES = 'ROOMMATES'


class MatchStatus(str, enum.Enum):
    ACTIVE = 'ACTIVE'
    UNMATCHED = 'UNMATCHED'


class ModerationActionType(str, enum.Enum):
    WARN = 'WARN'
    SUSPEND = 'SUSPEND'
    BAN = 'BAN'
    UNSUSPEND = 'UNSUSPEND'
    PHOTO_REJECT = 'PHOTO_REJECT'
    VERIFICATION_APPROVE = 'VERIFICATION_APPROVE'
    VERIFICATION_REJECT = 'VERIFICATION_REJECT'
    APPEAL_ACCEPT = 'APPEAL_ACCEPT'
    APPEAL_REJECT = 'APPEAL_REJECT'


class ModerationStatus(str, enum.Enum):
    PENDING = 'PENDING'
    APPROVED = 'APPROVED'
    REJECTED = 'REJECTED'


class NotificationType(str, enum.Enum):
    LIKE = 'LIKE'
    MATCH = 'MATCH'
    MESSAGE = 'MESSAGE'
    PROFILE_VERIFIED = 'PROFILE_VERIFIED'
    SUBSCRIPTION_ACTIVATED = 'SUBSCRIPTION_ACTIVATED'
    SUBSCRIPTION_EXPIRING = 'SUBSCRIPTION_EXPIRING'
    SECURITY_ALERT = 'SECURITY_ALERT'
    REFUND_UPDATE = 'REFUND_UPDATE'
    LIVE_INVITE = 'LIVE_INVITE'
    LIVE_ACCEPTED = 'LIVE_ACCEPTED'
    REFERRAL_REWARD = 'REFERRAL_REWARD'


class PaymentKind(str, enum.Enum):
    SUBSCRIPTION = 'SUBSCRIPTION'
    PRODUCT = 'PRODUCT'


class PaymentStatus(str, enum.Enum):
    PENDING = 'PENDING'
    SUCCEEDED = 'SUCCEEDED'
    FAILED = 'FAILED'
    REFUNDED = 'REFUNDED'


class PlanCode(str, enum.Enum):
    FREE = 'FREE'
    PREMIUM = 'PREMIUM'
    VIP = 'VIP'


class ProductKind(str, enum.Enum):
    BOOST = 'BOOST'
    SUPER_LIKE_PACK = 'SUPER_LIKE_PACK'
    TOKEN_PACK = 'TOKEN_PACK'


class PromoKind(str, enum.Enum):
    PERCENT = 'PERCENT'
    TOKENS = 'TOKENS'


class ReferralStatus(str, enum.Enum):
    PENDING = 'PENDING'
    REWARDED = 'REWARDED'


class RefundSource(str, enum.Enum):
    USER = 'USER'
    ADMIN = 'ADMIN'


class RefundStatus(str, enum.Enum):
    REQUESTED = 'REQUESTED'
    PROCESSING = 'PROCESSING'
    COMPLETED = 'COMPLETED'
    REJECTED = 'REJECTED'
    FAILED = 'FAILED'


class ReportReason(str, enum.Enum):
    FAKE_PROFILE = 'FAKE_PROFILE'
    SCAM = 'SCAM'
    HARASSMENT = 'HARASSMENT'
    INAPPROPRIATE_CONTENT = 'INAPPROPRIATE_CONTENT'
    UNDERAGE = 'UNDERAGE'
    SPAM = 'SPAM'
    OTHER = 'OTHER'


class ReportStatus(str, enum.Enum):
    OPEN = 'OPEN'
    REVIEWING = 'REVIEWING'
    RESOLVED = 'RESOLVED'
    DISMISSED = 'DISMISSED'


class Role(str, enum.Enum):
    USER = 'USER'
    MODERATOR = 'MODERATOR'
    ADMIN = 'ADMIN'
    SUPER_ADMIN = 'SUPER_ADMIN'


class Seeking(str, enum.Enum):
    MEN = 'MEN'
    WOMEN = 'WOMEN'
    EVERYONE = 'EVERYONE'


class SubscriptionStatus(str, enum.Enum):
    PENDING = 'PENDING'
    ACTIVE = 'ACTIVE'
    PAST_DUE = 'PAST_DUE'
    CANCELED = 'CANCELED'
    EXPIRED = 'EXPIRED'


class SwipeAction(str, enum.Enum):
    LIKE = 'LIKE'
    PASS = 'PASS'
    SUPER_LIKE = 'SUPER_LIKE'


class TokenType(str, enum.Enum):
    EMAIL_VERIFY = 'EMAIL_VERIFY'
    PASSWORD_RESET = 'PASSWORD_RESET'
    MAGIC_LINK = 'MAGIC_LINK'


class UserStatus(str, enum.Enum):
    ACTIVE = 'ACTIVE'
    SUSPENDED = 'SUSPENDED'
    BANNED = 'BANNED'
    DELETED = 'DELETED'


class Visibility(str, enum.Enum):
    VISIBLE = 'VISIBLE'
    HIDDEN = 'HIDDEN'


class FeatureFlag(Base):
    __tablename__ = 'FeatureFlag'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='FeatureFlag_pkey'),
        Index('FeatureFlag_key_key', 'key', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    description: Mapped[Optional[str]] = mapped_column(Text)


class Interest(Base):
    __tablename__ = 'Interest'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='Interest_pkey'),
        Index('Interest_slug_key', 'slug', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(Text, nullable=False)

    User: Mapped[list['User']] = relationship('User', secondary='UserInterest', back_populates='Interest_')


class Product(Base):
    __tablename__ = 'Product'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='Product_pkey'),
        Index('Product_code_key', 'code', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[ProductKind] = mapped_column(Enum(ProductKind, values_callable=lambda cls: [member.value for member in cls], name='ProductKind'), nullable=False)
    creditType: Mapped[CreditType] = mapped_column(Enum(CreditType, values_callable=lambda cls: [member.value for member in cls], name='CreditType'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    priceXof: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'XOF'::text"))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    sortOrder: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))

    Payment: Mapped[list['Payment']] = relationship('Payment', back_populates='Product_')


class PromoCode(Base):
    __tablename__ = 'PromoCode'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='PromoCode_pkey'),
        Index('PromoCode_code_key', 'code', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[PromoKind] = mapped_column(Enum(PromoKind, values_callable=lambda cls: [member.value for member in cls], name='PromoKind'), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    percent: Mapped[Optional[int]] = mapped_column(Integer)
    tokens: Mapped[Optional[int]] = mapped_column(Integer)
    maxRedemptions: Mapped[Optional[int]] = mapped_column(Integer)
    startsAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    expiresAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    Payment: Mapped[list['Payment']] = relationship('Payment', back_populates='PromoCode_')


class SubscriptionPlan(Base):
    __tablename__ = 'SubscriptionPlan'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='SubscriptionPlan_pkey'),
        Index('SubscriptionPlan_code_key', 'code', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    code: Mapped[PlanCode] = mapped_column(Enum(PlanCode, values_callable=lambda cls: [member.value for member in cls], name='PlanCode'), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    priceXof: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'XOF'::text"))
    intervalDays: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('30'))
    features: Mapped[object] = mapped_column(JSONB, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    featured: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    sortOrder: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))

    PlanPrice: Mapped[list['PlanPrice']] = relationship('PlanPrice', back_populates='SubscriptionPlan_')
    Subscription: Mapped[list['Subscription']] = relationship('Subscription', back_populates='SubscriptionPlan_')


class SystemSetting(Base):
    __tablename__ = 'SystemSetting'
    __table_args__ = (
        PrimaryKeyConstraint('key', name='SystemSetting_pkey'),
    )

    key: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    value: Mapped[object] = mapped_column(JSONB, nullable=False)
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)


class User(Base):
    __tablename__ = 'User'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='User_pkey'),
        Index('User_email_key', 'email', unique=True),
        Index('User_lastActiveAt_idx', 'lastActiveAt'),
        Index('User_referralCode_key', 'referralCode', unique=True),
        Index('User_status_role_idx', 'status', 'role')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(Text, nullable=False)
    role: Mapped[Role] = mapped_column(Enum(Role, values_callable=lambda cls: [member.value for member in cls], name='Role'), nullable=False, server_default=text('\'USER\'::"Role"'))
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus, values_callable=lambda cls: [member.value for member in cls], name='UserStatus'), nullable=False, server_default=text('\'ACTIVE\'::"UserStatus"'))
    acceptedTermsAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    marketingConsent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    failedLogins: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    lastActiveAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    emailVerifiedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    passwordHash: Mapped[Optional[str]] = mapped_column(Text)
    suspendedUntil: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    lockedUntil: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    deletedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    referralCode: Mapped[Optional[str]] = mapped_column(Text)

    Interest_: Mapped[list['Interest']] = relationship('Interest', secondary='UserInterest', back_populates='User')
    Account: Mapped[list['Account']] = relationship('Account', back_populates='User_')
    AuditLog: Mapped[list['AuditLog']] = relationship('AuditLog', back_populates='User_')
    Block_blockedId: Mapped[list['Block']] = relationship('Block', foreign_keys='[Block.blockedId]', back_populates='User_')
    Block_blockerId: Mapped[list['Block']] = relationship('Block', foreign_keys='[Block.blockerId]', back_populates='User1')
    Boost: Mapped[list['Boost']] = relationship('Boost', back_populates='User_')
    CreditTransaction: Mapped[list['CreditTransaction']] = relationship('CreditTransaction', back_populates='User_')
    CreditWallet: Mapped[list['CreditWallet']] = relationship('CreditWallet', back_populates='User_')
    Entitlement: Mapped[list['Entitlement']] = relationship('Entitlement', back_populates='User_')
    LiveSearch: Mapped[list['LiveSearch']] = relationship('LiveSearch', back_populates='User_')
    Match_userAId: Mapped[list['Match']] = relationship('Match', foreign_keys='[Match.userAId]', back_populates='User_')
    Match_userBId: Mapped[list['Match']] = relationship('Match', foreign_keys='[Match.userBId]', back_populates='User1')
    Notification: Mapped[list['Notification']] = relationship('Notification', back_populates='User_')
    NotificationPreference: Mapped[list['NotificationPreference']] = relationship('NotificationPreference', back_populates='User_')
    Preference: Mapped[list['Preference']] = relationship('Preference', back_populates='User_')
    Profile: Mapped[list['Profile']] = relationship('Profile', back_populates='User_')
    Referral_refereeId: Mapped[list['Referral']] = relationship('Referral', foreign_keys='[Referral.refereeId]', back_populates='User_')
    Referral_referrerId: Mapped[list['Referral']] = relationship('Referral', foreign_keys='[Referral.referrerId]', back_populates='User1')
    Report_reporterId: Mapped[list['Report']] = relationship('Report', foreign_keys='[Report.reporterId]', back_populates='User_')
    Report_targetId: Mapped[list['Report']] = relationship('Report', foreign_keys='[Report.targetId]', back_populates='User1')
    Session: Mapped[list['Session']] = relationship('Session', back_populates='User_')
    Subscription: Mapped[list['Subscription']] = relationship('Subscription', back_populates='User_')
    Swipe_giverId: Mapped[list['Swipe']] = relationship('Swipe', foreign_keys='[Swipe.giverId]', back_populates='User_')
    Swipe_targetId: Mapped[list['Swipe']] = relationship('Swipe', foreign_keys='[Swipe.targetId]', back_populates='User1')
    VerificationRequest: Mapped[list['VerificationRequest']] = relationship('VerificationRequest', back_populates='User_')
    VerificationToken: Mapped[list['VerificationToken']] = relationship('VerificationToken', back_populates='User_')
    LiveInvite_inviteeId: Mapped[list['LiveInvite']] = relationship('LiveInvite', foreign_keys='[LiveInvite.inviteeId]', back_populates='User_')
    LiveInvite_seekerId: Mapped[list['LiveInvite']] = relationship('LiveInvite', foreign_keys='[LiveInvite.seekerId]', back_populates='User1')
    ModerationAction_moderatorId: Mapped[list['ModerationAction']] = relationship('ModerationAction', foreign_keys='[ModerationAction.moderatorId]', back_populates='User_')
    ModerationAction_targetUserId: Mapped[list['ModerationAction']] = relationship('ModerationAction', foreign_keys='[ModerationAction.targetUserId]', back_populates='User1')
    Payment: Mapped[list['Payment']] = relationship('Payment', back_populates='User_')
    Message: Mapped[list['Message']] = relationship('Message', back_populates='User_')


class WebhookEvent(Base):
    __tablename__ = 'WebhookEvent'
    __table_args__ = (
        PrimaryKeyConstraint('id', name='WebhookEvent_pkey'),
        Index('WebhookEvent_provider_eventId_key', 'provider', 'eventId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    eventId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    receivedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    processedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))



class Account(Base):
    __tablename__ = 'Account'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Account_userId_fkey'),
        PrimaryKeyConstraint('id', name='Account_pkey'),
        Index('Account_provider_providerAccountId_key', 'provider', 'providerAccountId', unique=True),
        Index('Account_userId_idx', 'userId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    providerAccountId: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    User_: Mapped['User'] = relationship('User', back_populates='Account')


class AuditLog(Base):
    __tablename__ = 'AuditLog'
    __table_args__ = (
        ForeignKeyConstraint(['actorId'], ['User.id'], ondelete='SET NULL', onupdate='CASCADE', name='AuditLog_actorId_fkey'),
        PrimaryKeyConstraint('id', name='AuditLog_pkey'),
        Index('AuditLog_action_createdAt_idx', 'action', 'createdAt'),
        Index('AuditLog_actorId_createdAt_idx', 'actorId', 'createdAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[object] = mapped_column('metadata', JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    actorId: Mapped[Optional[str]] = mapped_column(Text)
    targetType: Mapped[Optional[str]] = mapped_column(Text)
    targetId: Mapped[Optional[str]] = mapped_column(Text)

    User_: Mapped[Optional['User']] = relationship('User', back_populates='AuditLog')


class Block(Base):
    __tablename__ = 'Block'
    __table_args__ = (
        ForeignKeyConstraint(['blockedId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Block_blockedId_fkey'),
        ForeignKeyConstraint(['blockerId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Block_blockerId_fkey'),
        PrimaryKeyConstraint('id', name='Block_pkey'),
        Index('Block_blockedId_idx', 'blockedId'),
        Index('Block_blockerId_blockedId_key', 'blockerId', 'blockedId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    blockerId: Mapped[str] = mapped_column(Text, nullable=False)
    blockedId: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    User_: Mapped['User'] = relationship('User', foreign_keys=[blockedId], back_populates='Block_blockedId')
    User1: Mapped['User'] = relationship('User', foreign_keys=[blockerId], back_populates='Block_blockerId')


class Boost(Base):
    __tablename__ = 'Boost'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Boost_userId_fkey'),
        PrimaryKeyConstraint('id', name='Boost_pkey'),
        Index('Boost_userId_endsAt_idx', 'userId', 'endsAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    startsAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    endsAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    durationMinutes: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    User_: Mapped['User'] = relationship('User', back_populates='Boost')


class CreditTransaction(Base):
    __tablename__ = 'CreditTransaction'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='CreditTransaction_userId_fkey'),
        PrimaryKeyConstraint('id', name='CreditTransaction_pkey'),
        Index('CreditTransaction_userId_createdAt_idx', 'userId', 'createdAt'),
        Index('CreditTransaction_userId_reason_refId_key', 'userId', 'reason', 'refId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[CreditType] = mapped_column(Enum(CreditType, values_callable=lambda cls: [member.value for member in cls], name='CreditType'), nullable=False)
    delta: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[CreditReason] = mapped_column(Enum(CreditReason, values_callable=lambda cls: [member.value for member in cls], name='CreditReason'), nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    refId: Mapped[Optional[str]] = mapped_column(Text)

    User_: Mapped['User'] = relationship('User', back_populates='CreditTransaction')


class CreditWallet(Base):
    __tablename__ = 'CreditWallet'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='CreditWallet_userId_fkey'),
        PrimaryKeyConstraint('id', name='CreditWallet_pkey'),
        Index('CreditWallet_userId_type_key', 'userId', 'type', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[CreditType] = mapped_column(Enum(CreditType, values_callable=lambda cls: [member.value for member in cls], name='CreditType'), nullable=False)
    balance: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)

    User_: Mapped['User'] = relationship('User', back_populates='CreditWallet')


class Entitlement(Base):
    __tablename__ = 'Entitlement'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Entitlement_userId_fkey'),
        PrimaryKeyConstraint('id', name='Entitlement_pkey'),
        Index('Entitlement_userId_key', 'userId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    plan: Mapped[PlanCode] = mapped_column(Enum(PlanCode, values_callable=lambda cls: [member.value for member in cls], name='PlanCode'), nullable=False, server_default=text('\'FREE\'::"PlanCode"'))
    boostCredits: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    validUntil: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', back_populates='Entitlement')


class LiveSearch(Base):
    __tablename__ = 'LiveSearch'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='LiveSearch_userId_fkey'),
        PrimaryKeyConstraint('id', name='LiveSearch_pkey'),
        Index('LiveSearch_status_expiresAt_idx', 'status', 'expiresAt'),
        Index('LiveSearch_userId_createdAt_idx', 'userId', 'createdAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    criteria: Mapped[object] = mapped_column(JSONB, nullable=False)
    status: Mapped[LiveSearchStatus] = mapped_column(Enum(LiveSearchStatus, values_callable=lambda cls: [member.value for member in cls], name='LiveSearchStatus'), nullable=False, server_default=text('\'ACTIVE\'::"LiveSearchStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    expiresAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)

    User_: Mapped['User'] = relationship('User', back_populates='LiveSearch')
    LiveInvite: Mapped[list['LiveInvite']] = relationship('LiveInvite', back_populates='LiveSearch_')


class Match(Base):
    __tablename__ = 'Match'
    __table_args__ = (
        ForeignKeyConstraint(['userAId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Match_userAId_fkey'),
        ForeignKeyConstraint(['userBId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Match_userBId_fkey'),
        PrimaryKeyConstraint('id', name='Match_pkey'),
        Index('Match_userAId_userBId_key', 'userAId', 'userBId', unique=True),
        Index('Match_userBId_idx', 'userBId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userAId: Mapped[str] = mapped_column(Text, nullable=False)
    userBId: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[MatchStatus] = mapped_column(Enum(MatchStatus, values_callable=lambda cls: [member.value for member in cls], name='MatchStatus'), nullable=False, server_default=text('\'ACTIVE\'::"MatchStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    unmatchedById: Mapped[Optional[str]] = mapped_column(Text)

    User_: Mapped['User'] = relationship('User', foreign_keys=[userAId], back_populates='Match_userAId')
    User1: Mapped['User'] = relationship('User', foreign_keys=[userBId], back_populates='Match_userBId')
    Conversation: Mapped[list['Conversation']] = relationship('Conversation', back_populates='Match_')


class Notification(Base):
    __tablename__ = 'Notification'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Notification_userId_fkey'),
        PrimaryKeyConstraint('id', name='Notification_pkey'),
        Index('Notification_userId_readAt_createdAt_idx', 'userId', 'readAt', text('"createdAt" DESC'))
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType, values_callable=lambda cls: [member.value for member in cls], name='NotificationType'), nullable=False)
    data: Mapped[object] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    readAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', back_populates='Notification')


class NotificationPreference(Base):
    __tablename__ = 'NotificationPreference'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='NotificationPreference_userId_fkey'),
        PrimaryKeyConstraint('id', name='NotificationPreference_pkey'),
        Index('NotificationPreference_userId_key', 'userId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    inAppLikes: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    inAppMatches: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    inAppMessages: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    emailLikes: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    emailMatches: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    emailMessages: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    pushEnabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))

    User_: Mapped['User'] = relationship('User', back_populates='NotificationPreference')


class PlanPrice(Base):
    __tablename__ = 'PlanPrice'
    __table_args__ = (
        ForeignKeyConstraint(['planId'], ['SubscriptionPlan.id'], ondelete='CASCADE', onupdate='CASCADE', name='PlanPrice_planId_fkey'),
        PrimaryKeyConstraint('id', name='PlanPrice_pkey'),
        Index('PlanPrice_planId_months_key', 'planId', 'months', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    planId: Mapped[str] = mapped_column(Text, nullable=False)
    months: Mapped[int] = mapped_column(Integer, nullable=False)
    discountPercent: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    amountOverride: Mapped[Optional[int]] = mapped_column(Integer)

    SubscriptionPlan_: Mapped['SubscriptionPlan'] = relationship('SubscriptionPlan', back_populates='PlanPrice')


class Preference(Base):
    __tablename__ = 'Preference'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Preference_userId_fkey'),
        PrimaryKeyConstraint('id', name='Preference_pkey'),
        Index('Preference_userId_key', 'userId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    seeking: Mapped[Seeking] = mapped_column(Enum(Seeking, values_callable=lambda cls: [member.value for member in cls], name='Seeking'), nullable=False, server_default=text('\'EVERYONE\'::"Seeking"'))
    ageMin: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('18'))
    ageMax: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('60'))
    verifiedOnly: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    activeRecently: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    country: Mapped[Optional[str]] = mapped_column(Text)
    city: Mapped[Optional[str]] = mapped_column(Text)
    intents: Mapped[Optional[list[Intent]]] = mapped_column(ARRAY(Enum(Intent, values_callable=lambda cls: [member.value for member in cls], name='Intent')))
    maxDistanceKm: Mapped[Optional[int]] = mapped_column(Integer)
    languages: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text()), server_default=text('ARRAY[]::text[]'))
    interests: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text()), server_default=text('ARRAY[]::text[]'))

    User_: Mapped['User'] = relationship('User', back_populates='Preference')


class Profile(Base):
    __tablename__ = 'Profile'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Profile_userId_fkey'),
        PrimaryKeyConstraint('id', name='Profile_pkey'),
        Index('Profile_country_city_idx', 'country', 'city'),
        Index('Profile_gender_birthDate_idx', 'gender', 'birthDate'),
        Index('Profile_userId_key', 'userId', unique=True),
        Index('Profile_visibility_boostedUntil_idx', 'visibility', 'boostedUntil')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    displayName: Mapped[str] = mapped_column(Text, nullable=False)
    birthDate: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    gender: Mapped[Gender] = mapped_column(Enum(Gender, values_callable=lambda cls: [member.value for member in cls], name='Gender'), nullable=False)
    country: Mapped[str] = mapped_column(Text, nullable=False)
    city: Mapped[str] = mapped_column(Text, nullable=False)
    bio: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''::text"))
    intent: Mapped[Intent] = mapped_column(Enum(Intent, values_callable=lambda cls: [member.value for member in cls], name='Intent'), nullable=False, server_default=text('\'UNSURE\'::"Intent"'))
    visibility: Mapped[Visibility] = mapped_column(Enum(Visibility, values_callable=lambda cls: [member.value for member in cls], name='Visibility'), nullable=False, server_default=text('\'VISIBLE\'::"Visibility"'))
    incognito: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    completeness: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    readReceipts: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    liveOptIn: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('true'))
    pronouns: Mapped[Optional[str]] = mapped_column(Text)
    approxLat: Mapped[Optional[float]] = mapped_column(Double(53))
    approxLng: Mapped[Optional[float]] = mapped_column(Double(53))
    occupation: Mapped[Optional[str]] = mapped_column(Text)
    languages: Mapped[Optional[list[str]]] = mapped_column(ARRAY(Text()), server_default=text("ARRAY['fr'::text]"))
    boostedUntil: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    onboardedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    hasChildren: Mapped[Optional[bool]] = mapped_column(Boolean)
    heightCm: Mapped[Optional[int]] = mapped_column(Integer)
    likesPets: Mapped[Optional[bool]] = mapped_column(Boolean)
    living: Mapped[Optional[LivingSituation]] = mapped_column(Enum(LivingSituation, values_callable=lambda cls: [member.value for member in cls], name='LivingSituation'))
    originCountry: Mapped[Optional[str]] = mapped_column(Text)

    User_: Mapped['User'] = relationship('User', back_populates='Profile')
    ProfilePhoto: Mapped[list['ProfilePhoto']] = relationship('ProfilePhoto', back_populates='Profile_')


class Referral(Base):
    __tablename__ = 'Referral'
    __table_args__ = (
        ForeignKeyConstraint(['refereeId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Referral_refereeId_fkey'),
        ForeignKeyConstraint(['referrerId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Referral_referrerId_fkey'),
        PrimaryKeyConstraint('id', name='Referral_pkey'),
        Index('Referral_refereeId_key', 'refereeId', unique=True),
        Index('Referral_referrerId_status_idx', 'referrerId', 'status')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    referrerId: Mapped[str] = mapped_column(Text, nullable=False)
    refereeId: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ReferralStatus] = mapped_column(Enum(ReferralStatus, values_callable=lambda cls: [member.value for member in cls], name='ReferralStatus'), nullable=False, server_default=text('\'PENDING\'::"ReferralStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    rewardedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', foreign_keys=[refereeId], back_populates='Referral_refereeId')
    User1: Mapped['User'] = relationship('User', foreign_keys=[referrerId], back_populates='Referral_referrerId')


class Report(Base):
    __tablename__ = 'Report'
    __table_args__ = (
        ForeignKeyConstraint(['reporterId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Report_reporterId_fkey'),
        ForeignKeyConstraint(['targetId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Report_targetId_fkey'),
        PrimaryKeyConstraint('id', name='Report_pkey'),
        Index('Report_status_createdAt_idx', 'status', 'createdAt'),
        Index('Report_targetId_idx', 'targetId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    reporterId: Mapped[str] = mapped_column(Text, nullable=False)
    targetId: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[ReportReason] = mapped_column(Enum(ReportReason, values_callable=lambda cls: [member.value for member in cls], name='ReportReason'), nullable=False)
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus, values_callable=lambda cls: [member.value for member in cls], name='ReportStatus'), nullable=False, server_default=text('\'OPEN\'::"ReportStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    details: Mapped[Optional[str]] = mapped_column(Text)
    resolvedById: Mapped[Optional[str]] = mapped_column(Text)
    resolvedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', foreign_keys=[reporterId], back_populates='Report_reporterId')
    User1: Mapped['User'] = relationship('User', foreign_keys=[targetId], back_populates='Report_targetId')
    ModerationAction: Mapped[list['ModerationAction']] = relationship('ModerationAction', back_populates='Report_')


class Session(Base):
    __tablename__ = 'Session'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Session_userId_fkey'),
        PrimaryKeyConstraint('id', name='Session_pkey'),
        Index('Session_tokenHash_key', 'tokenHash', unique=True),
        Index('Session_userId_revokedAt_idx', 'userId', 'revokedAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    tokenHash: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    lastUsedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    expiresAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    userAgent: Mapped[Optional[str]] = mapped_column(Text)
    ipHash: Mapped[Optional[str]] = mapped_column(Text)
    revokedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', back_populates='Session')


class Subscription(Base):
    __tablename__ = 'Subscription'
    __table_args__ = (
        ForeignKeyConstraint(['planId'], ['SubscriptionPlan.id'], ondelete='RESTRICT', onupdate='CASCADE', name='Subscription_planId_fkey'),
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Subscription_userId_fkey'),
        PrimaryKeyConstraint('id', name='Subscription_pkey'),
        Index('Subscription_currentPeriodEnd_status_idx', 'currentPeriodEnd', 'status'),
        Index('Subscription_userId_status_idx', 'userId', 'status')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    planId: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[SubscriptionStatus] = mapped_column(Enum(SubscriptionStatus, values_callable=lambda cls: [member.value for member in cls], name='SubscriptionStatus'), nullable=False, server_default=text('\'PENDING\'::"SubscriptionStatus"'))
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    cancelAtPeriodEnd: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    updatedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, default=utcnow, onupdate=utcnow)
    months: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    providerRef: Mapped[Optional[str]] = mapped_column(Text)
    currentPeriodEnd: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    SubscriptionPlan_: Mapped['SubscriptionPlan'] = relationship('SubscriptionPlan', back_populates='Subscription')
    User_: Mapped['User'] = relationship('User', back_populates='Subscription')
    Payment: Mapped[list['Payment']] = relationship('Payment', back_populates='Subscription_')


class Swipe(Base):
    __tablename__ = 'Swipe'
    __table_args__ = (
        ForeignKeyConstraint(['giverId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Swipe_giverId_fkey'),
        ForeignKeyConstraint(['targetId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Swipe_targetId_fkey'),
        PrimaryKeyConstraint('id', name='Swipe_pkey'),
        Index('Swipe_giverId_createdAt_idx', 'giverId', 'createdAt'),
        Index('Swipe_giverId_targetId_key', 'giverId', 'targetId', unique=True),
        Index('Swipe_targetId_action_idx', 'targetId', 'action')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    giverId: Mapped[str] = mapped_column(Text, nullable=False)
    targetId: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[SwipeAction] = mapped_column(Enum(SwipeAction, values_callable=lambda cls: [member.value for member in cls], name='SwipeAction'), nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    User_: Mapped['User'] = relationship('User', foreign_keys=[giverId], back_populates='Swipe_giverId')
    User1: Mapped['User'] = relationship('User', foreign_keys=[targetId], back_populates='Swipe_targetId')


t_UserInterest = Table(
    'UserInterest', Base.metadata,
    Column('userId', Text, primary_key=True),
    Column('interestId', Text, primary_key=True),
    ForeignKeyConstraint(['interestId'], ['Interest.id'], ondelete='CASCADE', onupdate='CASCADE', name='UserInterest_interestId_fkey'),
    ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='UserInterest_userId_fkey'),
    PrimaryKeyConstraint('userId', 'interestId', name='UserInterest_pkey'),
    Index('UserInterest_interestId_idx', 'interestId')
)


class VerificationRequest(Base):
    __tablename__ = 'VerificationRequest'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='VerificationRequest_userId_fkey'),
        PrimaryKeyConstraint('id', name='VerificationRequest_pkey'),
        Index('VerificationRequest_status_createdAt_idx', 'status', 'createdAt'),
        Index('VerificationRequest_userId_idx', 'userId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    selfieKey: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[ModerationStatus] = mapped_column(Enum(ModerationStatus, values_callable=lambda cls: [member.value for member in cls], name='ModerationStatus'), nullable=False, server_default=text('\'PENDING\'::"ModerationStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    reviewedById: Mapped[Optional[str]] = mapped_column(Text)
    reviewedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    note: Mapped[Optional[str]] = mapped_column(Text)

    User_: Mapped['User'] = relationship('User', back_populates='VerificationRequest')


class VerificationToken(Base):
    __tablename__ = 'VerificationToken'
    __table_args__ = (
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='VerificationToken_userId_fkey'),
        PrimaryKeyConstraint('id', name='VerificationToken_pkey'),
        Index('VerificationToken_tokenHash_key', 'tokenHash', unique=True),
        Index('VerificationToken_userId_type_idx', 'userId', 'type')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[TokenType] = mapped_column(Enum(TokenType, values_callable=lambda cls: [member.value for member in cls], name='TokenType'), nullable=False)
    tokenHash: Mapped[str] = mapped_column(Text, nullable=False)
    expiresAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    usedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', back_populates='VerificationToken')


class Conversation(Base):
    __tablename__ = 'Conversation'
    __table_args__ = (
        ForeignKeyConstraint(['matchId'], ['Match.id'], ondelete='CASCADE', onupdate='CASCADE', name='Conversation_matchId_fkey'),
        PrimaryKeyConstraint('id', name='Conversation_pkey'),
        Index('Conversation_matchId_key', 'matchId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    matchId: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    lastMessageAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    Match_: Mapped['Match'] = relationship('Match', back_populates='Conversation')
    Message: Mapped[list['Message']] = relationship('Message', back_populates='Conversation_')


class LiveInvite(Base):
    __tablename__ = 'LiveInvite'
    __table_args__ = (
        ForeignKeyConstraint(['inviteeId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='LiveInvite_inviteeId_fkey'),
        ForeignKeyConstraint(['searchId'], ['LiveSearch.id'], ondelete='CASCADE', onupdate='CASCADE', name='LiveInvite_searchId_fkey'),
        ForeignKeyConstraint(['seekerId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='LiveInvite_seekerId_fkey'),
        PrimaryKeyConstraint('id', name='LiveInvite_pkey'),
        Index('LiveInvite_inviteeId_status_idx', 'inviteeId', 'status'),
        Index('LiveInvite_searchId_inviteeId_key', 'searchId', 'inviteeId', unique=True),
        Index('LiveInvite_seekerId_status_idx', 'seekerId', 'status')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    searchId: Mapped[str] = mapped_column(Text, nullable=False)
    seekerId: Mapped[str] = mapped_column(Text, nullable=False)
    inviteeId: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[LiveInviteStatus] = mapped_column(Enum(LiveInviteStatus, values_callable=lambda cls: [member.value for member in cls], name='LiveInviteStatus'), nullable=False, server_default=text('\'PENDING\'::"LiveInviteStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    expiresAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False)
    respondedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', foreign_keys=[inviteeId], back_populates='LiveInvite_inviteeId')
    LiveSearch_: Mapped['LiveSearch'] = relationship('LiveSearch', back_populates='LiveInvite')
    User1: Mapped['User'] = relationship('User', foreign_keys=[seekerId], back_populates='LiveInvite_seekerId')


class ModerationAction(Base):
    __tablename__ = 'ModerationAction'
    __table_args__ = (
        ForeignKeyConstraint(['moderatorId'], ['User.id'], ondelete='RESTRICT', onupdate='CASCADE', name='ModerationAction_moderatorId_fkey'),
        ForeignKeyConstraint(['reportId'], ['Report.id'], ondelete='SET NULL', onupdate='CASCADE', name='ModerationAction_reportId_fkey'),
        ForeignKeyConstraint(['targetUserId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='ModerationAction_targetUserId_fkey'),
        PrimaryKeyConstraint('id', name='ModerationAction_pkey'),
        Index('ModerationAction_appealStatus_idx', 'appealStatus'),
        Index('ModerationAction_targetUserId_createdAt_idx', 'targetUserId', 'createdAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    moderatorId: Mapped[str] = mapped_column(Text, nullable=False)
    targetUserId: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[ModerationActionType] = mapped_column(Enum(ModerationActionType, values_callable=lambda cls: [member.value for member in cls], name='ModerationActionType'), nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    appealStatus: Mapped[AppealStatus] = mapped_column(Enum(AppealStatus, values_callable=lambda cls: [member.value for member in cls], name='AppealStatus'), nullable=False, server_default=text('\'NONE\'::"AppealStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    reportId: Mapped[Optional[str]] = mapped_column(Text)
    expiresAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    appealText: Mapped[Optional[str]] = mapped_column(Text)
    appealedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    User_: Mapped['User'] = relationship('User', foreign_keys=[moderatorId], back_populates='ModerationAction_moderatorId')
    Report_: Mapped[Optional['Report']] = relationship('Report', back_populates='ModerationAction')
    User1: Mapped['User'] = relationship('User', foreign_keys=[targetUserId], back_populates='ModerationAction_targetUserId')


class Payment(Base):
    __tablename__ = 'Payment'
    __table_args__ = (
        ForeignKeyConstraint(['productId'], ['Product.id'], ondelete='SET NULL', onupdate='CASCADE', name='Payment_productId_fkey'),
        ForeignKeyConstraint(['promoCodeId'], ['PromoCode.id'], ondelete='SET NULL', onupdate='CASCADE', name='Payment_promoCodeId_fkey'),
        ForeignKeyConstraint(['subscriptionId'], ['Subscription.id'], ondelete='SET NULL', onupdate='CASCADE', name='Payment_subscriptionId_fkey'),
        ForeignKeyConstraint(['userId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Payment_userId_fkey'),
        PrimaryKeyConstraint('id', name='Payment_pkey'),
        Index('Payment_provider_providerRef_key', 'provider', 'providerRef', unique=True),
        Index('Payment_userId_createdAt_idx', 'userId', 'createdAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    userId: Mapped[str] = mapped_column(Text, nullable=False)
    amountXof: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'XOF'::text"))
    provider: Mapped[str] = mapped_column(Text, nullable=False)
    providerRef: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus, values_callable=lambda cls: [member.value for member in cls], name='PaymentStatus'), nullable=False, server_default=text('\'PENDING\'::"PaymentStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    kind: Mapped[PaymentKind] = mapped_column(Enum(PaymentKind, values_callable=lambda cls: [member.value for member in cls], name='PaymentKind'), nullable=False, server_default=text('\'SUBSCRIPTION\'::"PaymentKind"'))
    months: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('1'))
    discountXof: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    subscriptionId: Mapped[Optional[str]] = mapped_column(Text)
    failureReason: Mapped[Optional[str]] = mapped_column(Text)
    paidAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    productId: Mapped[Optional[str]] = mapped_column(Text)
    promoCodeId: Mapped[Optional[str]] = mapped_column(Text)

    Product_: Mapped[Optional['Product']] = relationship('Product', back_populates='Payment')
    PromoCode_: Mapped[Optional['PromoCode']] = relationship('PromoCode', back_populates='Payment')
    Subscription_: Mapped[Optional['Subscription']] = relationship('Subscription', back_populates='Payment')
    User_: Mapped['User'] = relationship('User', back_populates='Payment')
    Invoice: Mapped[list['Invoice']] = relationship('Invoice', back_populates='Payment_')
    Refund: Mapped[list['Refund']] = relationship('Refund', back_populates='Payment_')


class ProfilePhoto(Base):
    __tablename__ = 'ProfilePhoto'
    __table_args__ = (
        ForeignKeyConstraint(['profileId'], ['Profile.id'], ondelete='CASCADE', onupdate='CASCADE', name='ProfilePhoto_profileId_fkey'),
        PrimaryKeyConstraint('id', name='ProfilePhoto_pkey'),
        Index('ProfilePhoto_moderationStatus_idx', 'moderationStatus'),
        Index('ProfilePhoto_profileId_position_idx', 'profileId', 'position')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    profileId: Mapped[str] = mapped_column(Text, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    isPrimary: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text('false'))
    width: Mapped[int] = mapped_column(Integer, nullable=False)
    height: Mapped[int] = mapped_column(Integer, nullable=False)
    moderationStatus: Mapped[ModerationStatus] = mapped_column(Enum(ModerationStatus, values_callable=lambda cls: [member.value for member in cls], name='ModerationStatus'), nullable=False, server_default=text('\'PENDING\'::"ModerationStatus"'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    Profile_: Mapped['Profile'] = relationship('Profile', back_populates='ProfilePhoto')


class Invoice(Base):
    __tablename__ = 'Invoice'
    __table_args__ = (
        ForeignKeyConstraint(['paymentId'], ['Payment.id'], ondelete='CASCADE', onupdate='CASCADE', name='Invoice_paymentId_fkey'),
        PrimaryKeyConstraint('id', name='Invoice_pkey'),
        Index('Invoice_number_key', 'number', unique=True),
        Index('Invoice_paymentId_key', 'paymentId', unique=True)
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    paymentId: Mapped[str] = mapped_column(Text, nullable=False)
    number: Mapped[str] = mapped_column(Text, nullable=False)
    amountXof: Mapped[int] = mapped_column(Integer, nullable=False)
    issuedAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)

    Payment_: Mapped['Payment'] = relationship('Payment', back_populates='Invoice')


class Message(Base):
    __tablename__ = 'Message'
    __table_args__ = (
        ForeignKeyConstraint(['conversationId'], ['Conversation.id'], ondelete='CASCADE', onupdate='CASCADE', name='Message_conversationId_fkey'),
        ForeignKeyConstraint(['senderId'], ['User.id'], ondelete='CASCADE', onupdate='CASCADE', name='Message_senderId_fkey'),
        PrimaryKeyConstraint('id', name='Message_pkey'),
        Index('Message_conversationId_createdAt_idx', 'conversationId', text('"createdAt" DESC')),
        Index('Message_senderId_idx', 'senderId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    conversationId: Mapped[str] = mapped_column(Text, nullable=False)
    senderId: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    readAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))
    deletedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    Conversation_: Mapped['Conversation'] = relationship('Conversation', back_populates='Message')
    User_: Mapped['User'] = relationship('User', back_populates='Message')
    MessageAttachment: Mapped[list['MessageAttachment']] = relationship('MessageAttachment', back_populates='Message_')


class Refund(Base):
    __tablename__ = 'Refund'
    __table_args__ = (
        ForeignKeyConstraint(['paymentId'], ['Payment.id'], ondelete='CASCADE', onupdate='CASCADE', name='Refund_paymentId_fkey'),
        PrimaryKeyConstraint('id', name='Refund_pkey'),
        Index('Refund_paymentId_idx', 'paymentId'),
        Index('Refund_status_createdAt_idx', 'status', 'createdAt')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    paymentId: Mapped[str] = mapped_column(Text, nullable=False)
    amountXof: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[RefundSource] = mapped_column(Enum(RefundSource, values_callable=lambda cls: [member.value for member in cls], name='RefundSource'), nullable=False)
    status: Mapped[RefundStatus] = mapped_column(Enum(RefundStatus, values_callable=lambda cls: [member.value for member in cls], name='RefundStatus'), nullable=False, server_default=text('\'REQUESTED\'::"RefundStatus"'))
    requestedById: Mapped[str] = mapped_column(Text, nullable=False)
    creditsReversed: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text('0'))
    createdAt: Mapped[datetime.datetime] = mapped_column(TIMESTAMP(precision=3), nullable=False, server_default=text('CURRENT_TIMESTAMP'), default=utcnow)
    decidedById: Mapped[Optional[str]] = mapped_column(Text)
    decisionNote: Mapped[Optional[str]] = mapped_column(Text)
    providerRef: Mapped[Optional[str]] = mapped_column(Text)
    failureReason: Mapped[Optional[str]] = mapped_column(Text)
    decidedAt: Mapped[Optional[datetime.datetime]] = mapped_column(TIMESTAMP(precision=3))

    Payment_: Mapped['Payment'] = relationship('Payment', back_populates='Refund')


class MessageAttachment(Base):
    __tablename__ = 'MessageAttachment'
    __table_args__ = (
        ForeignKeyConstraint(['messageId'], ['Message.id'], ondelete='CASCADE', onupdate='CASCADE', name='MessageAttachment_messageId_fkey'),
        PrimaryKeyConstraint('id', name='MessageAttachment_pkey'),
        Index('MessageAttachment_messageId_idx', 'messageId')
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=new_id)
    messageId: Mapped[str] = mapped_column(Text, nullable=False)
    key: Mapped[str] = mapped_column(Text, nullable=False)
    mime: Mapped[str] = mapped_column(Text, nullable=False)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    moderationStatus: Mapped[ModerationStatus] = mapped_column(Enum(ModerationStatus, values_callable=lambda cls: [member.value for member in cls], name='ModerationStatus'), nullable=False, server_default=text('\'PENDING\'::"ModerationStatus"'))

    Message_: Mapped['Message'] = relationship('Message', back_populates='MessageAttachment')
