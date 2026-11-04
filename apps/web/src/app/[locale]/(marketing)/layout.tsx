import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MarketingFooter } from '@/components/marketing/Footer';
import { MarketingHeader } from '@/components/marketing/Header';

export default async function MarketingLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <>
      <a href="#main" className="skip-link">{t('common.skipToContent')}</a>
      <MarketingHeader />
      <main id="main">{children}</main>
      <MarketingFooter />
    </>
  );
}
