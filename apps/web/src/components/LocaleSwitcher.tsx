'use client';
import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { useUi } from '@/lib/store';

export function LocaleSwitcher() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const alternates = useUi((s) => s.localeAlternates);
  // Un article n'a pas le même lien dans l'autre langue : on va vers sa traduction, ou vers la liste des articles s'il n'est pas traduit.
  const target = (l: string) => alternates?.[l] ?? (pathname.startsWith('/blog/') ? '/blog' : pathname);
  return (
    <label className="relative inline-flex items-center">
      <Languages className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden />
      <span className="sr-only">{t('common.language')}</span>
      <select value={locale} onChange={(e) => router.replace(target(e.target.value), { locale: e.target.value })}
        className="h-10 cursor-pointer appearance-none rounded-full border border-line bg-card pr-3 pl-9 text-sm font-medium uppercase">
        {routing.locales.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
    </label>
  );
}
