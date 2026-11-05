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
    dstat = dict((await one('SELECT status, count(*) FROM "DateProposal" GROUP BY status')).all())
    dtotal = sum(dstat.values())
    answered = sum(dstat.get(k, 0) for k in ("ACCEPTED", "COMPLETED", "DECLINED", "RESCHEDULED"))
    accepted = dstat.get("ACCEPTED", 0) + dstat.get("COMPLETED", 0)
    fb_n, fb_avg = (await one('SELECT count(r), round(avg(r)::numeric, 2) FROM (SELECT "proposerFeedback" r FROM "DateProposal" WHERE "proposerFeedback" IS NOT NULL '
                              'UNION ALL SELECT "inviteeFeedback" FROM "DateProposal" WHERE "inviteeFeedback" IS NOT NULL) t')).one()
    paused_now = (await one('SELECT count(*) FROM "Profile" WHERE "pausedAt" IS NOT NULL AND ("pauseEndsAt" IS NULL OR "pauseEndsAt" > :n)', n=now)).scalar_one()
    quiet_users = (await one('SELECT count(*) FROM "NotificationPreference" WHERE "quietStart" IS NOT NULL')).scalar_one()
    pending = (await one('SELECT count(*) FROM "User" WHERE "emailVerifiedAt" IS NULL AND status = \'ACTIVE\' AND "passwordHash" IS NOT NULL')).scalar_one()
    purged = (await one('SELECT COALESCE(max((value)::text::int), 0) FROM "SystemSetting" WHERE key = \'stats.unverified_purged\'')).scalar_one()
    from app.core import callsvc, speedsvc
    calls = await callsvc.stats(db, now - datetime.timedelta(days=30))
    speed = await speedsvc.stats(db)
    return {
        "calls": {**calls, "windowDays": 30}, "speed": speed,
        "signup": {"unverifiedPending": pending, "unverifiedPurgedTotal": purged},
        "rhythm": {"pausedNow": paused_now, "quietHoursUsers": quiet_users},
        "dates": {"proposed": dtotal, "accepted": accepted, "declined": dstat.get("DECLINED", 0), "canceled": dstat.get("CANCELED", 0), "completed": dstat.get("COMPLETED", 0),
                  "acceptRate": _rate(accepted, answered), "feedbackCount": fb_n, "feedbackAverage": float(fb_avg) if fb_avg is not None else None},
        "profilesCompleted": onboarded, "membersActive": members, "profilesWithPrompts": with_prompts, "profilesWithPromptsRate": _rate(with_prompts, onboarded),
        "likes": likes, "likesWithComment": commented, "likesWithCommentRate": _rate(commented, likes),
        "matches": matches, "matchRate": _rate(matches * 2, likes),  # part des likes qui ont abouti à un match (deux likes par match)
        "conversations": convs, "firstResponseRate": _rate(replied, convs), "reciprocalConversations": replied,
        "reports": reports, "reportsOpen": open_reports,
        "retention": {"d7": {"cohort": r7_n, "rate": _rate(r7, r7_n)}, "d30": {"cohort": r30_n, "rate": _rate(r30, r30_n)},
                      "definition": "Part des comptes encore actifs au moins 7 (ou 30) jours après leur inscription ; approximation fondée sur la dernière activité."},
        "premiumConversionRate": _rate(paid, members), "dailyPicks": {"last30Days": recs, "actedRate": _rate(acted, recs)},
        "unavailable": [],  # rendez-vous, rencontres terminées et satisfaction : mesurés à partir des déclarations volontaires des membres
    }
