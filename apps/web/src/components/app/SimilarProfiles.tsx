'use client';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Avatar, Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { countryName } from './ProfileCard';
import { VerifiedBadge } from './VerifiedBadge';

interface Similar { id: string; displayName: string; age: number; city: string; country: string; verified: boolean; thumbUrl: string }

/** Colonne « Profils similaires » : jusqu'à trois autres membres proches (même pays, mêmes centres d'intérêt). Rien n'est affiché s'il n'y en a pas. */
export function SimilarProfiles({ userId }: { userId: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const q = useQuery({ queryKey: ['similar', userId], queryFn: () => api<{ items: Similar[] }>(`/profiles/${userId}/similar`), staleTime: 5 * 60_000, retry: false });
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <Card className="p-5" aria-labelledby={`similar-${userId}`} role="region">
      <h2 id={`similar-${userId}`} className="border-b border-line pb-3 font-display text-xl font-bold">{t('profileView.similar')}</h2>
      <ul className="mt-4 space-y-4">
        {items.map((s) => (
          <li key={s.id}>
            <Link href={`/profile/${s.id}`} className="flex items-center gap-4 rounded-2xl p-1 transition hover:bg-soft" aria-label={t('likes.view', { name: s.displayName })}>
              <Avatar src={s.thumbUrl} name={s.displayName} size={64} />
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 font-bold"><span className="truncate">{s.displayName}, {s.age}</span>{s.verified && <VerifiedBadge size="sm" />}</span>
                <span className="block truncate text-sm text-muted">{s.city}, {countryName(s.country, locale)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
