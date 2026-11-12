'use client';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

interface Discount { percent: number; eligible: boolean; verified: boolean; approvedPhotos: number; photosNeeded: number; months: number; remainingMonths: number | null; capReached: boolean }

/** Réduction « profil vérifié » : dit au membre qu'il l'a, ce qui lui manque pour l'obtenir, ou que l'offre est terminée. N'apparaît que si l'administration l'a activée.
 *  `compact` (page de profil) : on n'affiche que l'invitation à se faire vérifier, pas la confirmation. */
export function VerifiedDiscountCard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const { data } = useQuery({ queryKey: ['access', 'discount'], queryFn: () => api<Discount>('/access/discount') });
  if (!data || data.percent <= 0) return null;
  const spent = !data.eligible && data.verified && data.photosNeeded <= data.approvedPhotos;  // rien à faire de plus : offre épuisée (durée ou plafond)
  if (compact && (data.eligible || spent)) return null;
  const title = data.months > 0 ? t('access.discountTitleMonths', { percent: data.percent, n: data.months }) : t('access.discountTitle', { percent: data.percent });
  return (
    <Card className="mx-auto flex max-w-xl items-start gap-3 border-brand/30 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-soft text-brand-ink"><BadgeCheck className="size-5" aria-hidden /></span>
      <div className="text-sm">
        <p className="font-bold">{title}</p>
        <p className="text-muted">{data.eligible ? t('access.discountOk') : data.capReached ? t('access.discountCap') : spent ? t('access.discountSpent') : t('access.discountTodo', { n: data.photosNeeded })}</p>
        {!data.eligible && !spent && !data.capReached && <Link href="/profile?edit=1" className="mt-1 inline-block font-semibold text-brand-ink underline">{t('access.discountCta')}</Link>}
      </div>
    </Card>
  );
}
