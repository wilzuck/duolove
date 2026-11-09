import { FloatingHearts } from '@/components/marketing/FloatingHearts';
import { ArrowRight, BadgeCheck, CalendarHeart, Check, ChevronRight, CreditCard, Heart, HeartHandshake, MessageCircle, Mail, MessageCircleHeart, Radio, Search, ShieldCheck, Smartphone, Sparkles, Timer, UserPlus, Users, Zap } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button, Card } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { NewsletterForm } from '@/components/marketing/NewsletterForm';
import { PricingTable } from '@/components/marketing/PricingTable';
import { fetchCatalog } from '@/lib/catalog';

const BENEFITS = [
  [Sparkles, 'matching'], [BadgeCheck, 'verified'], [MessageCircleHeart, 'chat'], [ShieldCheck, 'safety'], [Smartphone, 'mobile'], [CalendarHeart, 'daily'], [Radio, 'live'], [Timer, 'speed'], [CreditCard, 'momo'],
] as const;
const CHIPS = ['verified', 'serious', 'data'] as const;
const STRIP = [[Users, 'community'], [ShieldCheck, 'security'], [Heart, 'profiles'], [Zap, 'simple']] as const;
const HOW = [[UserPlus, 's1'], [Search, 's2'], [MessageCircle, 's3']] as const;
const FAQ = ['age', 'free', 'safety', 'payment', 'delete', 'verify'] as const;

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const catalog = await fetchCatalog();
  const t = await getTranslations();
  return (
    <>
      <FloatingHearts />
      <section className="hero-glow relative overflow-hidden pb-24 md:pb-28">
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 pt-6 sm:px-6 md:pt-10 lg:grid-cols-2 lg:gap-0">
          <div className="min-w-0 space-y-7 text-center lg:pb-10 lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('home.eyebrow')}</p>
            <h1 className="font-display text-[2.4rem] font-extrabold leading-[1.08] tracking-tight text-balance sm:text-5xl lg:text-6xl">
              {t('home.v2.h1a')} <span className="inline-block text-brand">{t('home.v2.h1b')}</span>
            </h1>
            <p className="mx-auto max-w-xl text-lg leading-relaxed text-fg/85 sm:text-xl lg:mx-0">{t('home.v2.lead')}</p>
            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm font-medium lg:justify-start">
              {CHIPS.map((k) => (
                <li key={k} className="flex items-center gap-2"><span className="flex size-6 items-center justify-center rounded-full bg-brand-strong text-white"><Check className="size-3.5" strokeWidth={3} aria-hidden /></span>{t(`home.v2.chips.${k}`)}</li>
              ))}
            </ul>
            <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:flex-wrap sm:justify-center lg:justify-start">
              <Link href="/register" className="sm:w-auto"><Button size="lg" className="h-auto min-h-14 w-full max-w-full py-2 px-6 text-center text-base whitespace-normal sm:w-auto">{t('home.v2.ctaCreate')}<ArrowRight className="size-5" aria-hidden /></Button></Link>
              <Link href="/how-it-works" className="sm:w-auto"><Button size="lg" variant="outline" className="h-14 w-full border-brand-strong bg-transparent px-6 text-base text-brand-ink hover:bg-soft sm:w-auto">{t('home.v2.ctaDiscover')}</Button></Link>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-xl lg:-mr-10 lg:max-w-none">
            <img src="/images/hero-match.webp" alt={t('home.v2.heroAlt')} width={1404} height={1120} fetchPriority="high" decoding="async" className="h-auto w-full select-none drop-shadow-[0_24px_40px_rgb(233_30_99/.12)]" />
          </div>
        </div>
      </section>

      <section id="securite" className="relative z-10 mx-auto -mt-16 max-w-7xl scroll-mt-24 px-4 sm:px-6" aria-label={t('home.v2.strip.security.title')}>
        <ul className="grid gap-6 rounded-[2rem] border border-line/70 bg-card/95 p-6 shadow-soft backdrop-blur sm:grid-cols-2 lg:grid-cols-4 lg:gap-4 lg:p-8">
          {STRIP.map(([Icon, k]) => (
            <li key={k} className="flex items-start gap-4">
              <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span>
              <div>
                <h2 className="font-display text-base leading-snug font-bold">{t(`home.v2.strip.${k}.title`)}</h2>
                <p className="mt-1 text-sm text-muted">{t(`home.v2.strip.${k}.text`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="fonctionnalites" className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6 py-20" aria-labelledby="benefits">
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

      <section id="comment-ca-marche" className="scroll-mt-24 bg-soft px-4 py-20 sm:px-6" aria-labelledby="how3">
        <div className="mx-auto max-w-7xl">
        <h2 id="how3" className="text-center font-display text-3xl font-extrabold md:text-4xl">{t('home.v2.how3.title')}</h2>
        <ol className="mt-12 grid items-start gap-12 md:grid-cols-3 md:gap-14">
          {HOW.map(([Icon, k], i) => (
            <li key={k} className="relative">
              <div className="text-center">
                <div className="mx-auto flex w-fit flex-col items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-strong font-display text-base font-extrabold text-white">{i + 1}</span>
                  <span className="flex size-20 items-center justify-center rounded-[1.6rem] bg-card text-brand-ink shadow-sm"><Icon className="size-9" aria-hidden /></span>
                </div>
                <h3 className="mt-5 font-display text-xl font-bold">{t(`home.v2.how3.${k}.title`)}</h3>
                <p className="mx-auto mt-2 max-w-[17rem] text-fg/80">{t(`home.v2.how3.${k}.text`)}</p>
              </div>
              {i < HOW.length - 1 && <ChevronRight aria-hidden className="absolute top-[5.3rem] -right-10 hidden size-6 text-brand md:block" />}
            </li>
          ))}
        </ol>
        </div>
      </section>

      <section id="abonnements" className="mx-auto max-w-7xl scroll-mt-24 px-4 sm:px-6 py-20" aria-labelledby="plans">
        <h2 id="plans" className="mx-auto max-w-2xl text-center text-3xl font-extrabold md:text-4xl">{t('home.plansTitle')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted">{t('home.plansSubtitle')}</p>
        <div className="mt-12">
          <PricingTable initial={catalog} />
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-4 pb-20" aria-labelledby="faq-title">
        <h2 id="faq-title" className="text-center text-3xl font-extrabold md:text-4xl">{t('home.faqTitle')}</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((k) => (
            <details key={k} className="group rounded-2xl border border-line bg-card px-5 py-4 open:shadow-soft">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">{t(`faq.${k}.q`)}</summary>
              <p className="mt-3 text-muted">{t(`faq.${k}.a`)}</p>
            </details>
          ))}
        </div>
      </section>

      <section id="newsletter" className="px-4 pb-20 sm:px-6" aria-labelledby="newsletter-title">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-soft px-6 py-12 text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft"><Mail className="size-7" aria-hidden /></span>
          <h2 id="newsletter-title" className="mt-5 font-display text-3xl font-extrabold md:text-4xl">{t('newsletter.title')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-muted">{t('newsletter.text')}</p>
          <div className="mt-7"><NewsletterForm /></div>
          <p className="mt-4 text-xs text-muted">{t('newsletter.privacy')}</p>
        </div>
      </section>

      <section className="px-4 pt-6 pb-20 sm:px-6">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-12 text-center text-white shadow-pop">
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">{t('home.v2.final.title')}</h2>
          <Link href="/register" className="mt-7 inline-block"><Button size="lg" className="h-14 bg-white px-8 text-base text-[#c2185b] hover:bg-white/90" variant="ghost">{t('home.v2.final.cta')}<ArrowRight className="size-5" aria-hidden /></Button></Link>
          <p className="mt-7 flex items-center justify-center gap-4 text-white/90"><span aria-hidden className="h-px w-12 bg-white/50 sm:w-24" />{t('meta.tagline')}<span aria-hidden className="h-px w-12 bg-white/50 sm:w-24" /></p>
        </div>
      </section>
    </>
  );
}
