'use client';
import { Construction } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { maintenanceMessage, useSiteStatus } from './MaintenanceScreen';

/** Bandeau en haut de toutes les pages pendant la maintenance (visiteurs et équipe). */
export function MaintenanceBanner() {
  const t = useTranslations();
  const locale = useLocale();
  const { data } = useSiteStatus();
  if (!data?.maintenance) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-gold/20 px-4 py-2 text-center text-sm font-medium text-gold-ink">
      <Construction className="size-4 shrink-0" aria-hidden />
      <span>{t('maintenance.banner')}{maintenanceMessage(data, locale) ? ` ${maintenanceMessage(data, locale)}` : ''}</span>
    </div>
  );
}
