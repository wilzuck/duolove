import { ArrowRight, BadgeCheck, CalendarHeart, Camera, Check, Compass, Crown, Heart, HeartHandshake, Hourglass, Lock, MessageCircleHeart, ShieldAlert, Sparkles, UserPlus, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { PageToc } from '@/components/marketing/PageToc';

const STEPS: [string, LucideIcon][] = [
  ['signup', UserPlus], ['profile', Camera], ['discover', Compass], ['like', Heart], ['match', Sparkles], ['chat', MessageCircleHeart], ['date', CalendarHeart], ['premium', Crown],
];
const WHY_ICONS: LucideIcon[] = [Sparkles, BadgeCheck, Hourglass, Lock];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.how'), description: t('how.subtitle') };
}

export default async function HowItWorks({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const why = t.raw('how.why') as { h: string; p: string }[];
  const free = t.raw('how.plansFree.items') as string[];
  const paid = t.raw('how.plansPaid.items') as string[];
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('how.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-6xl">{t('how.title')}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted md:text-xl">{t('how.subtitle')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/register"><Button size="lg">{t('home.ctaRegister')}<ArrowRight className="size-4" aria-hidden /></Button></Link>
            <Link href="/help"><Button size="lg" variant="outline">{t('how.ctaHelp')}</Button></Link>
          </div>
        </div>
      </section>

      <PageToc items={[{ id: 'steps', label: t('toc.steps') }, { id: 'why', label: t('toc.why') }, { id: 'plans', label: t('toc.plans') }, { id: 'safe', label: t('toc.safety') }]} />

      <section aria-labelledby="steps-title" id="steps" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-14">
        <h2 id="steps-title" className="text-center text-2xl font-extrabold md:text-3xl">{t('how.stepsTitle')}</h2>
        <div className="mt-10 grid gap-10 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <nav aria-label={t('how.stepsTitle')} className="hidden lg:block">
          <div className="sticky top-24 rounded-3xl border border-line bg-card p-5 shadow-soft">
            <ol className="space-y-1 text-sm">
              {STEPS.map(([key], i) => (
                <li key={key}><a href={`#step-${key}`} className="flex gap-3 rounded-xl px-2 py-1.5 text-muted hover:bg-soft hover:text-brand-ink"><span className="font-bold text-brand-ink" aria-hidden>{i + 1}</span>{t(`how.steps.${key}.title`)}</a></li>
              ))}
            </ol>
          </div>
        </nav>
        <ol className="relative space-y-5 before:absolute before:top-4 before:bottom-4 before:left-[1.65rem] before:w-px before:bg-line md:before:left-[1.9rem]">
          {STEPS.map(([key, Icon], i) => {
            const optional = key === 'premium';
            return (
              <li key={key} id={`step-${key}`} className="relative flex scroll-mt-24 gap-4 md:gap-6">
                <span className={`z-10 flex size-14 shrink-0 items-center justify-center rounded-full shadow-soft md:size-16 ${optional ? 'bg-gold text-navy' : 'bg-brand-strong text-white'}`}><Icon className="size-6 md:size-7" aria-hidden /><span className="sr-only">{i + 1}</span></span>
                <div className={`flex-1 rounded-3xl border bg-card p-5 shadow-soft md:p-6 ${optional ? 'border-dashed border-brand/40 bg-soft' : 'border-line'}`}>
                  <p className="text-xs font-bold tracking-wide text-brand-ink uppercase" aria-hidden>{String(i + 1).padStart(2, '0')}</p>
                  <h3 className="text-xl font-bold">{t(`how.steps.${key}.title`)}</h3>
                  <p className="mt-1.5 leading-relaxed text-muted">{t(`how.steps.${key}.text`)}</p>
                </div>
              </li>
            );
          })}
        </ol>
        </div>
      </section>

      <section aria-labelledby="why-title" id="why" className="scroll-mt-24 bg-soft/50 py-14">
        <div className="mx-auto max-w-6xl px-4">
          <h2 id="why-title" className="text-center text-2xl font-extrabold md:text-3xl">{t('how.whyTitle')}</h2>
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {why.map((w, i) => {
              const Icon = WHY_ICONS[i] ?? Heart;
              return <li key={w.h} className="rounded-3xl border border-line bg-card p-6 shadow-soft"><span className="flex size-12 items-center justify-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span><h3 className="mt-4 font-bold">{w.h}</h3><p className="mt-1 text-sm leading-relaxed text-muted">{w.p}</p></li>;
            })}
          </ul>
        </div>
      </section>

      <section aria-labelledby="age" className="mx-auto max-w-4xl px-4 py-14">
        <div className="flex flex-col items-center gap-4 rounded-[2rem] border border-line bg-card p-8 text-center shadow-soft md:p-10">
          <span className="flex size-14 items-center justify-center rounded-full bg-soft text-brand-ink"><HeartHandshake className="size-7" aria-hidden /></span>
          <h2 id="age" className="text-2xl font-extrabold md:text-3xl">{t('how.ageTitle')}</h2>
          <p className="max-w-xl text-lg leading-relaxed text-muted">{t('how.ageText')}</p>
          <Link href="/legal/community"><Button variant="outline">{t('how.ageCta')}</Button></Link>
        </div>
      </section>

      <section aria-labelledby="plans-title" id="plans" className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-14">
        <h2 id="plans-title" className="text-center text-2xl font-extrabold md:text-3xl">{t('how.plansTitle')}</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {([['plansFree', free], ['plansPaid', paid]] as const).map(([k, items]) => (
            <div key={k} className="rounded-3xl border border-line bg-card p-6 shadow-soft">
              <h3 className="text-xl font-bold">{t(`how.${k}.h`)}</h3>
              <ul className="mt-4 space-y-3">{items.map((it) => <li key={it} className="flex gap-3 leading-relaxed"><Check className="mt-1 size-4 shrink-0 text-success-ink" aria-hidden /><span>{it}</span></li>)}</ul>
            </div>
          ))}
        </div>
        <div className="mt-6 text-center"><Link href="/pricing"><Button variant="outline">{t('how.plansCta')}</Button></Link></div>
      </section>

      <section id="safe" className="mx-auto max-w-4xl scroll-mt-24 px-4 pb-14">
        <aside className="flex gap-4 rounded-3xl bg-gold/15 p-6" aria-label={t('how.safetyTitle')}>
          <ShieldAlert className="mt-1 size-6 shrink-0 text-gold-ink" aria-hidden />
          <div><h2 className="font-bold">{t('how.safetyTitle')}</h2><p className="mt-1 leading-relaxed text-muted">{t('how.safetyText')}</p></div>
        </aside>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-14 text-center text-white shadow-pop">
          <h2 className="text-3xl font-extrabold md:text-4xl">{t('how.finalTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">{t('how.finalText')}</p>
          <Link href="/register" className="mt-8 inline-block"><Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('home.ctaRegister')}</Button></Link>
        </div>
      </section>
    </>
  );
}
