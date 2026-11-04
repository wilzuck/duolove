import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { use } from 'react';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

const STEPS = ['signup', 'profile', 'discover', 'like', 'match', 'chat'] as const;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.how'), description: t('how.subtitle') };
}

export default function HowItWorks({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  const t = useTranslations();
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <h1 className="text-4xl font-extrabold md:text-5xl">{t('how.title')}</h1>
      <p className="mt-4 max-w-2xl text-lg text-muted">{t('how.subtitle')}</p>
      <ol className="mt-12 space-y-4">
        {STEPS.map((s, i) => (
          <li key={s} className="flex gap-5 rounded-3xl border border-line bg-card p-6 shadow-soft">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-strong font-display text-xl font-extrabold text-white">{i + 1}</span>
            <div><h2 className="text-xl font-bold">{t(`how.steps.${s}.title`)}</h2><p className="mt-1 text-muted">{t(`how.steps.${s}.text`)}</p></div>
          </li>
        ))}
        <li className="flex gap-5 rounded-3xl border-2 border-dashed border-brand/40 bg-soft p-6">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gold font-display text-xl font-extrabold text-navy">+</span>
          <div><h2 className="text-xl font-bold">{t('how.steps.premium.title')}</h2><p className="mt-1 text-muted">{t('how.steps.premium.text')}</p></div>
        </li>
      </ol>
      <aside className="mt-10 flex gap-4 rounded-3xl bg-gold/15 p-6" aria-labelledby="safe">
        <AlertTriangle className="mt-1 size-6 shrink-0 text-gold-ink" aria-hidden />
        <div><h2 id="safe" className="font-bold">{t('how.safetyTitle')}</h2><p className="mt-1 text-muted">{t('how.safetyText')}</p></div>
      </aside>
      <div className="mt-10"><Link href="/register"><Button size="lg">{t('home.ctaRegister')}<ArrowRight className="size-4" /></Button></Link></div>
    </div>
  );
}
