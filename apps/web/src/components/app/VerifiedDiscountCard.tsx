'use client';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

interface Discount { percent: number; eligible: boolean; verified: boolean; approvedPhotos: number; photosNeeded: number }

/** Réduction « profil vérifié » : dit au membre qu'il l'a, ou ce qu'il lui manque pour l'obtenir. N'apparaît que si l'administration l'a activée. */
export function VerifiedDiscountCard() {
  const t = useTranslations();
  const { data } = useQuery({ queryKey: ['access', 'discount'], queryFn: () => api<Discount>('/access/discount') });
  if (!data || data.percent <= 0) return null;
  return (
    <Card className="mx-auto flex max-w-xl items-start gap-3 border-brand/30 p-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-soft text-brand-ink"><BadgeCheck className="size-5" aria-hidden /></span>
      <div className="text-sm">
        <p className="font-bold">{t('access.discountTitle', { percent: data.percent })}</p>
        <p className="text-muted">{data.eligible ? t('access.discountOk') : t('access.discountTodo', { n: data.photosNeeded })}</p>
        {!data.eligible && <Link href="/profile" className="mt-1 inline-block font-semibold text-brand-ink underline">{t('access.discountCta')}</Link>}
      </div>
    </Card>
  );
}
