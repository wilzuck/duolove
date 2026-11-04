import { BadgeCheck, CreditCard, HeartHandshake, Lock, MessageCircleHeart, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button, Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { PricingTable } from '@/components/marketing/PricingTable';
import { fetchCatalog } from '@/lib/catalog';
import { HeroVisual } from '@/components/marketing/HeroVisual';

const BENEFITS = [
  [Sparkles, 'matching'], [BadgeCheck, 'verified'], [MessageCircleHeart, 'chat'], [ShieldCheck, 'safety'], [Smartphone, 'mobile'], [CreditCard, 'momo'],
] as const;
const STEPS = ['signup', 'profile', 'discover', 'like', 'match', 'chat'] as const;
const FAQ = ['age', 'free', 'safety', 'payment', 'delete', 'verify'] as const;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const catalog = await fetchCatalog();
  const t = await getTranslations();
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 md:py-24 lg:grid-cols-2">
          <div className="space-y-7">
            <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('home.eyebrow')}</p>
            <h1 className="text-balance text-5xl font-extrabold leading-[1.05] md:text-6xl">{t('home.title')}</h1>
            <p className="max-w-xl text-lg text-muted">{t('home.subtitle')}</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/register"><Button size="lg">{t('home.ctaRegister')}</Button></Link>
              <Link href="/login"><Button size="lg" variant="outline">{t('home.ctaLogin')}</Button></Link>
            </div>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <li className="flex items-center gap-2"><Lock className="size-4 text-brand" aria-hidden />{t('home.trust.adults')}</li>
              <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-brand" aria-hidden />{t('home.trust.verified')}</li>
              <li className="flex items-center gap-2"><ShieldCheck className="size-4 text-brand" aria-hidden />{t('home.trust.private')}</li>
            </ul>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="benefits">
        <h2 id="benefits" className="mx-auto max-w-2xl text-center text-3xl font-extrabold md:text-4xl">{t('home.benefitsTitle')}</h2>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {BENEFITS.map(([Icon, k]) => (
            <Card key={k} className="space-y-3 p-6">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-soft text-brand"><Icon className="size-6" aria-hidden /></span>
              <h3 className="text-lg font-bold">{t(`home.benefits.${k}.title`)}</h3>
              <p className="text-muted">{t(`home.benefits.${k}.text`)}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-soft/60 py-20" aria-labelledby="how">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="how" className="mx-auto max-w-2xl text-center text-3xl font-extrabold md:text-4xl">{t('home.howTitle')}</h2>
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s} className="relative rounded-3xl border border-line bg-card p-6 shadow-soft">
                <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-strong font-display text-lg font-extrabold text-white">{i + 1}</span>
                <h3 className="text-lg font-bold">{t(`how.steps.${s}.title`)}</h3>
                <p className="mt-1 text-muted">{t(`how.steps.${s}.text`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20" aria-labelledby="plans">
        <h2 id="plans" className="mx-auto max-w-2xl text-center text-3xl font-extrabold md:text-4xl">{t('home.plansTitle')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">{t('home.plansSubtitle')}</p>
        <div className="mt-12">
          <PricingTable initial={catalog} />
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20" aria-labelledby="faq">
        <h2 id="faq" className="text-center text-3xl font-extrabold md:text-4xl">{t('home.faqTitle')}</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((k) => (
            <details key={k} className="group rounded-2xl border border-line bg-card px-5 py-4 open:shadow-soft">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{t(`faq.${k}.q`)}</summary>
              <p className="mt-3 text-muted">{t(`faq.${k}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-14 text-center text-white shadow-pop">
          <h2 className="text-3xl font-extrabold md:text-4xl">{t('home.finalTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">{t('home.finalText')}</p>
          <Link href="/register" className="mt-8 inline-block"><Button size="lg" className="bg-white text-brand-ink hover:bg-white/90" variant="ghost">{t('home.ctaRegister')}</Button></Link>
        </div>
      </section>
    </>
  );
}
