from typing import Annotated, Literal

from pydantic import BeforeValidator, Field, model_validator

from app.core.constants import MIN_AGE
from typing import Literal

from app.schemas.common import Body, CountryT, GenderT, IntentT, InterestT, Iso2, LivingT, SeekingT, Trimmed

Lang = Annotated[str, Field(min_length=2, max_length=5)]


class ProfileUpdateIn(Body):
    displayName: Annotated[Trimmed, Field(min_length=2, max_length=40)] | None = None
    bio: Annotated[Trimmed, Field(max_length=500)] | None = None
    occupation: Annotated[Trimmed, Field(max_length=80)] | None = None
    pronouns: Annotated[Trimmed, Field(max_length=30)] | None = None
    country: CountryT | None = None
    city: Annotated[Trimmed, Field(min_length=2, max_length=80)] | None = None
    languages: Annotated[list[Lang], Field(max_length=8)] | None = None
    intent: IntentT | None = None
    interests: Annotated[list[InterestT], Field(max_length=10)] | None = None
    gender: GenderT | None = None
    hasChildren: bool | None = None
    likesPets: bool | None = None
    living: LivingT | None = None
    heightCm: Annotated[int, Field(ge=120, le=230)] | None = None
    originCountry: Iso2 | None = None
    maritalStatus: Literal["SINGLE", "DIVORCED", "WIDOWED", "SEPARATED"] | None = None
    education: Literal["SECONDARY", "BACCALAUREATE", "BACHELOR", "MASTER", "DOCTORATE", "OTHER"] | None = None
    smoking: Literal["NEVER", "SOMETIMES", "OFTEN"] | None = None
    alcohol: Literal["NEVER", "SOMETIMES", "OFTEN"] | None = None
    religion: Literal["CHRISTIAN", "MUSLIM", "TRADITIONAL", "OTHER", "NONE"] | None = None
    showReligion: bool | None = None
    values: Annotated[list[Annotated[str, Field(max_length=40)]], Field(max_length=3)] | None = None


class PreferenceIn(Body):
    seeking: SeekingT
    ageMin: Annotated[int, Field(ge=MIN_AGE, le=99)]
    ageMax: Annotated[int, Field(ge=MIN_AGE, le=99)]
    country: CountryT | None = None
    city: Annotated[Trimmed, Field(max_length=80)] | None = None
    intents: Annotated[list[IntentT], Field(max_length=5)] | None = None
    languages: Annotated[list[Lang], Field(max_length=8)] | None = None
    interests: Annotated[list[InterestT], Field(max_length=10)] | None = None
    verifiedOnly: bool | None = None
    activeRecently: bool | None = None
    maxDistanceKm: Annotated[int, Field(ge=5, le=500)] | None = None

    @model_validator(mode="after")
    def _ages(self):
        if self.ageMin > self.ageMax:
            raise ValueError("age_range")
        return self


class LocationIn(Body):
    lat: Annotated[float, Field(ge=-90, le=90)]
    lng: Annotated[float, Field(ge=-180, le=180)]


class SettingsIn(Body):
    visibility: Literal["VISIBLE", "HIDDEN"] | None = None
    incognito: bool | None = None
    readReceipts: bool | None = None
    typingIndicator: bool | None = None
    showActivity: bool | None = None


class OrderIn(Body):
    ids: Annotated[list[str], Field(min_length=1, max_length=10)]


class SwipeIn(Body):
    targetId: Annotated[str, Field(min_length=1)]
    action: Literal["LIKE", "PASS", "SUPER_LIKE"]
    comment: Annotated[str, BeforeValidator(lambda v: v.strip() if isinstance(v, str) else v)] | None = None
    targetKind: Literal["PHOTO", "PROMPT", "INTEREST", "VALUE", "PROFILE"] | None = None
    targetRef: Annotated[str, Field(max_length=120)] | None = None


class PromptAnswerIn(Body):
    promptId: Annotated[str, Field(min_length=1)]
    answer: Annotated[str, BeforeValidator(lambda v: v.strip() if isinstance(v, str) else v), Field(min_length=3, max_length=300)]


class RhythmIn(Body):
    quietStart: str | None = None
    quietEnd: str | None = None
    tzOffsetMinutes: Annotated[int, Field(ge=-720, le=840)] | None = None
    dateReminders: bool | None = None


class PauseIn(Body):
    days: Annotated[int, Field(ge=1, le=365)] | None = None


class PromptAnswersIn(Body):
    items: Annotated[list[PromptAnswerIn], Field(max_length=8)]


class NotifPrefsIn(Body):
    inAppLikes: bool | None = None
    inAppMatches: bool | None = None
    inAppMessages: bool | None = None
    emailLikes: bool | None = None
    emailMatches: bool | None = None
    emailMessages: bool | None = None
    pushEnabled: bool | None = None
    emailWeekly: bool | None = None


class DeleteAccountIn(Body):
    password: Annotated[str, Field(max_length=128)] | None = None
    confirm: Literal["DELETE"]


class AppealIn(Body):
    text: Annotated[Trimmed, Field(min_length=10, max_length=1000)]


class ConsentIn(Body):
    marketingConsent: bool
