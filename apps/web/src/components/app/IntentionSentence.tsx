'use client';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMyProfile } from '@/hooks/useQueries';

/** Les critères du membre en une phrase lisible (intention d'abord) ; la modification se fait dans « Mes critères » de la découverte. */
export function IntentionSentence({ count }: { count?: number }) {
  const t = useTranslations();
  const me = useMyProfile().data;
  if (!me) return null;
  const p = me.preference;
  const intent = p?.intents?.[0] ?? me.intent;
  const city = p?.city ?? me.city;
  return (
    <p className="rounded-2xl bg-soft px-4 py-3 text-sm leading-relaxed" data-testid="intention-sentence">
      {t(`engagement.sentence.intent.${intent}` as never)}
      {p ? ` ${t('engagement.sentence.ages', { min: p.ageMin, max: p.ageMax })}` : ''}
      {city ? ` ${t('engagement.sentence.place', { city })}` : ''}.{' '}
      {count != null && <span className="text-muted">{t('engagement.sentence.count', { n: count })} </span>}
      <Link href="/discover" className="font-semibold text-brand-ink underline">{t('engagement.sentence.edit')}</Link>
    </p>
  );
}
