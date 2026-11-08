import { CreditCard, HeartHandshake, Lightbulb, LifeBuoy, Lock, Mail, MessageCircleQuestion, ShieldAlert, UserCog, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { ContactForm } from '@/components/marketing/ContactForm';
import { Link } from '@/i18n/navigation';
import { SUPPORT_EMAIL } from '@/lib/site';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.contact'), description: t('contact.lead') };
}

const TOPICS: [string, LucideIcon][] = [['account', UserCog], ['billing', CreditCard], ['safety', ShieldAlert], ['privacy', Lock], ['idea', Lightbulb], ['other', MessageCircleQuestion]];

export default async function Contact({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const tips = t.raw('contact.tips') as string[];
  const mail = (subject: string) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`CrushDuo — ${subject}`)}`;
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('contact.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-5xl">{t('contact.title')}</h1>
          <p className="mx-auto mt-4 max-w-xl text-balance text-lg text-muted">{t('contact.lead')}</p>
        </div>
      </section>

      <div className="mx-auto max-w-4xl space-y-12 px-4 py-12">
        <section aria-labelledby="topics">
          <h2 id="topics" className="text-2xl font-extrabold">{t('contact.topicsTitle')}</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TOPICS.map(([key, Icon]) => (
              <li key={key}>
                <a href={mail(t(`contact.topics.${key}.subject`))} className="flex h-full gap-4 rounded-3xl border border-line bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-pop">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>
                  <span><span className="block font-bold">{t(`contact.topics.${key}.h`)}</span><span className="mt-0.5 block text-sm text-muted">{t(`contact.topics.${key}.p`)}</span></span>
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="write-title" id="write" className="scroll-mt-24">
          <h2 id="write-title" className="mb-5 text-2xl font-extrabold">{t('contact.form.title')}</h2>
          <ContactForm />
        </section>

        <section aria-labelledby="mail" className="grid gap-5 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-card p-7 shadow-soft">
            <Mail className="size-8 text-brand-ink" aria-hidden />
            <h2 id="mail" className="mt-3 font-bold">{t('contact.emailLabel')}</h2>
            <a className="mt-1 block text-lg font-semibold text-brand-ink underline" href={mail(t('contact.subject'))}>{SUPPORT_EMAIL}</a>
            <p className="mt-3 text-sm text-muted">{t('contact.sla')}</p>
            <a href={mail(t('contact.subject'))} className="mt-5 inline-block"><Button>{t('contact.cta')}</Button></a>
          </div>
          <div className="rounded-3xl border border-line bg-soft/60 p-7">
            <h2 className="font-bold">{t('contact.tipsTitle')}</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted marker:text-brand-ink">{tips.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        </section>

        <aside aria-labelledby="urgent" className="flex gap-4 rounded-3xl bg-gold/15 p-6">
          <ShieldAlert className="mt-1 size-6 shrink-0 text-gold-ink" aria-hidden />
          <div><h2 id="urgent" className="font-bold">{t('contact.urgentTitle')}</h2><p className="mt-1 leading-relaxed text-muted">{t('contact.urgent')}</p></div>
        </aside>

        <section aria-labelledby="helpme" className="rounded-3xl border border-line bg-card p-7 text-center shadow-soft">
          <LifeBuoy className="mx-auto size-8 text-brand-ink" aria-hidden />
          <h2 id="helpme" className="mt-3 text-xl font-extrabold">{t('contact.helpTitle')}</h2>
          <div className="mt-5 flex flex-wrap justify-center gap-3"><Link href="/help"><Button>{t('contact.helpCta')}</Button></Link><Link href="/legal/community"><Button variant="outline">{t('contact.communityCta')}</Button></Link></div>
        </section>
      </div>
    </>
  );
}
