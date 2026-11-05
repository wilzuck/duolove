import { CalendarClock, MapPin, ShieldCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge } from '@duomatch/ui';
import { formatDate, formatTime } from '@/lib/format';
import type { SharedDate } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

async function load(token: string): Promise<SharedDate | null> {
  try {
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:4000'}/api/dates/shared/${encodeURIComponent(token)}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as SharedDate) : null;
  } catch {
    return null;
  }
}

/** Page publique (sans compte) d'un rendez-vous partagé VOLONTAIREMENT : prénoms, horaire, lieu public, statut. Rien d'autre. */
export default async function SharedDatePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const [t, d] = await Promise.all([getTranslations(), load(token)]);
  if (!d) {
    return <div className="mx-auto max-w-lg px-4 py-20 text-center"><h1 className="text-3xl font-extrabold">{t('dates.shared.gone')}</h1><p className="mt-3 text-muted">{t('dates.shared.goneText')}</p></div>;
  }
  return (
    <div className="mx-auto max-w-lg px-4 py-14">
      <h1 className="text-3xl font-extrabold">{t('dates.shared.title')}</h1>
      <p className="mt-3 text-muted">{t('dates.shared.intro', { who: d.sharedBy })}</p>
      <dl className="mt-8 space-y-4 rounded-3xl border border-line bg-card p-6 shadow-soft">
        <div><dt className="text-sm text-muted">{t('dates.shared.meeting')}</dt><dd className="text-lg font-bold">{d.meeting}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-sm text-muted"><CalendarClock className="size-4" aria-hidden />{t('dates.shared.when')}</dt><dd className="font-semibold">{formatDate(d.startsAt, locale, { weekday: 'long', day: 'numeric', month: 'long' })} · {formatTime(d.startsAt, locale)}–{formatTime(d.endsAt, locale)}</dd></div>
        <div><dt className="flex items-center gap-1.5 text-sm text-muted"><MapPin className="size-4" aria-hidden />{t('dates.shared.where')}</dt><dd className="font-semibold">{d.placeName} <span className="font-normal text-muted">({t(`dates.kind.${d.placeKind}` as never)})</span></dd></div>
        <div><dt className="text-sm text-muted">{t('dates.shared.status')}</dt><dd><Badge tone={d.status === 'ACCEPTED' || d.status === 'COMPLETED' ? 'success' : 'neutral'}>{t(`dates.status.${d.status}` as never)}</Badge></dd></div>
      </dl>
      {d.status === 'CANCELED' && <p className="mt-4 rounded-2xl bg-soft p-4 text-sm font-medium">{t('dates.shared.canceledNote')}</p>}
      <p className="mt-6 flex gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />{t('dates.shared.safety')}</p>
      <p className="mt-4 text-xs text-muted">{t('dates.shared.expires', { date: formatDate(d.expiresAt, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}</p>
    </div>
  );
}
