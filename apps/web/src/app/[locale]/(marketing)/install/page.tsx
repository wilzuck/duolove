import { getTranslations, setRequestLocale } from 'next-intl/server';
import { InstallPanel } from '@/components/marketing/InstallPanel';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('install.title'), description: t('install.lead') };
}

export default async function InstallPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const t = await getTranslations();
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-3xl px-4 py-14 text-center md:py-20">
          <h1 className="text-balance text-4xl font-extrabold md:text-5xl">{t('install.title')}</h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-lg text-muted md:text-xl">{t('install.lead')}</p>
        </div>
      </section>
      <div className="mx-auto max-w-3xl px-4 pb-20"><InstallPanel /></div>
    </>
  );
}
