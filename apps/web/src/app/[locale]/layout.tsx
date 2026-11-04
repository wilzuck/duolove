import type { Metadata, Viewport } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { NextIntlClientProvider, hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import '../globals.css';

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter', display: 'swap' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin', 'latin-ext'], variable: '--font-jakarta', display: 'swap' });

export const viewport: Viewport = { themeColor: '#e91e63', width: 'device-width', initialScale: 1 };

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale });
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('meta.title'), template: `%s · DuoMatch` },
    description: t('meta.description'),
    applicationName: 'DuoMatch',
    manifest: '/manifest.webmanifest',
    openGraph: { type: 'website', siteName: 'DuoMatch', title: t('meta.title'), description: t('meta.description'), locale: locale === 'en' ? 'en_US' : 'fr_FR', images: [{ url: '/og.png', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: t('meta.title'), description: t('meta.description') },
    icons: { icon: '/icon.svg' },
  };
}

// Applique le thème choisi avant le premier rendu (évite l'éclair clair → sombre). Script constant, sans donnée utilisateur.
const THEME_INIT = `try{var t=localStorage.getItem('duomatch-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${inter.variable} ${jakarta.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body className="min-h-dvh">
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
