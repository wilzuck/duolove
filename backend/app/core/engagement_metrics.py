"""Indicateurs d'engagement calculés sur les données réelles (jamais inventés). Les rencontres réelles ne se mesureraient qu'à partir de
déclarations volontaires : cette fonctionnalité n'existe pas encore, elle figure donc dans `unavailable`."""
import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import appsettings


def _rate(num: int, den: int) -> float | None:
    return round(num * 100 / den, 1) if den else None


async def compute(db: AsyncSession, now: datetime.datetime) -> dict:
    one = lambda q, **p: db.execute(text(q), p)  # noqa: E731
    cfg = await appsettings.all_values(db)
    members = (await one('SELECT count(*) FROM "User" WHERE status = \'ACTIVE\'')).scalar_one()
    onboarded = (await one('SELECT count(*) FROM "Profile" WHERE "onboardedAt" IS NOT NULL')).scalar_one()
    with_prompts = (await one('SELECT count(*) FROM (SELECT "userId" FROM "ProfilePromptAnswer" GROUP BY "userId" HAVING count(*) >= :m) t', m=cfg["prompts.min"])).scalar_one()
    likes = (await one('SELECT count(*) FROM "Swipe" WHERE action IN (\'LIKE\', \'SUPER_LIKE\')')).scalar_one()
    commented = (await one('SELECT count(*) FROM "Swipe" WHERE action IN (\'LIKE\', \'SUPER_LIKE\') AND comment IS NOT NULL')).scalar_one()
    matches = (await one('SELECT count(*) FROM "Match" WHERE status = \'ACTIVE\'')).scalar_one()
    convs, replied = (await one('''
        WITH first AS (SELECT DISTINCT ON ("conversationId") "conversationId", "senderId" FROM "Message" WHERE "deletedAt" IS NULL ORDER BY "conversationId", "createdAt")
        SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Message" m WHERE m."conversationId" = f."conversationId" AND m."senderId" <> f."senderId" AND m."deletedAt" IS NULL)) FROM first f''')).one()
    r7_n, r7 = (await one('SELECT count(*), count(*) FILTER (WHERE "lastActiveAt" >= "createdAt" + interval \'7 days\') FROM "User" WHERE "createdAt" <= :t', t=now - datetime.timedelta(days=7))).one()
    r30_n, r30 = (await one('SELECT count(*), count(*) FILTER (WHERE "lastActiveAt" >= "createdAt" + interval \'30 days\') FROM "User" WHERE "createdAt" <= :t', t=now - datetime.timedelta(days=30))).one()
    paid = (await one('SELECT count(*) FROM "Entitlement" WHERE plan <> \'FREE\'')).scalar_one()
    reports, open_reports = (await one('SELECT count(*), count(*) FILTER (WHERE status = \'OPEN\') FROM "Report"')).one()
    recs, acted = (await one('''
        SELECT count(*), count(*) FILTER (WHERE EXISTS (SELECT 1 FROM "Swipe" s WHERE s."giverId" = r."userId" AND s."targetId" = r."targetId" AND s."createdAt" >= r."createdAt"))
        FROM "DailyRecommendation" r WHERE r.day >= :d''', d=(now - datetime.timedelta(days=30)).date())).one()
    return {
        "profilesCompleted": onboarded, "membersActive": members, "profilesWithPrompts": with_prompts, "profilesWithPromptsRate": _rate(with_prompts, onboarded),
        "likes": likes, "likesWithComment": commented, "likesWithCommentRate": _rate(commented, likes),
        "matches": matches, "matchRate": _rate(matches * 2, likes),  # part des likes qui ont abouti à un match (deux likes par match)
        "conversations": convs, "firstResponseRate": _rate(replied, convs), "reciprocalConversations": replied,
        "reports": reports, "reportsOpen": open_reports,
        "retention": {"d7": {"cohort": r7_n, "rate": _rate(r7, r7_n)}, "d30": {"cohort": r30_n, "rate": _rate(r30, r30_n)},
                      "definition": "Part des comptes encore actifs au moins 7 (ou 30) jours après leur inscription ; approximation fondée sur la dernière activité."},
        "premiumConversionRate": _rate(paid, members), "dailyPicks": {"last30Days": recs, "actedRate": _rate(acted, recs)},
        "unavailable": ["dateProposals", "datesAccepted", "satisfaction", "realMeetings"],
    }
