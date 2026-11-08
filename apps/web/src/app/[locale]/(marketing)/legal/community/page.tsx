import { Banknote, BadgeCheck, CalendarHeart, Flag, Heart, HeartHandshake, Image as ImageIcon, Leaf, Lock, MessageCircleHeart, Scale, ShieldAlert, Smile, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { DocBody, type DocSection } from '@/components/marketing/DocBody';
import { Link } from '@/i18n/navigation';


const ICONS: Record<string, LucideIcon> = {
  promesse: Heart, respect: HeartHandshake, sincerite: BadgeCheck, argent: Banknote, contenus: ImageIcon, rencontres: CalendarHeart,
  'vie-privee': Lock, signaler: Flag, sanctions: Scale, 'bien-etre': Leaf, contact: MessageCircleHeart,
};
const GLANCE_ICONS: LucideIcon[] = [HeartHandshake, BadgeCheck, ShieldAlert, Lock, Smile];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('legal.community.title'), description: t('legal.community.metaDescription') };
}

/** Charte de la communauté : fond rédigé sur ce que la plateforme fait réellement (modération humaine, blocage, vérification, contestation…). */
export default async function CommunityPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const sections = t.raw('legal.community.sections') as DocSection[];
  const glance = t.raw('legal.community.glance') as { h: string; p: string }[];
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center md:py-24">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><HeartHandshake className="size-4" aria-hidden />{t('legal.community.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-6xl">{t('legal.community.title')}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted md:text-xl">{t('legal.community.lead')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href="#signaler"><Button size="lg" variant="outline">{t('legal.community.ctaReport')}</Button></a>
            <Link href="/help"><Button size="lg">{t('legal.community.ctaHelp')}</Button></Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="glance" className="mx-auto max-w-7xl px-4 sm:px-6 py-12">
        <h2 id="glance" className="text-center text-2xl font-bold md:text-3xl">{t('legal.community.glanceTitle')}</h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {glance.map((g, i) => {
            const Icon = GLANCE_ICONS[i] ?? Heart;
            return (
              <li key={g.h} className="rounded-3xl border border-line bg-card p-5 text-center shadow-soft">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span>
                <h3 className="mt-3 font-bold">{g.h}</h3><p className="mt-1 text-sm text-muted">{g.p}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <DocBody
        sections={sections} icons={ICONS} tocLabel={t('legal.community.toc')} listLabels={{ do: t('legal.community.listDo'), dont: t('legal.community.listDont'), info: t('legal.community.listInfo') }}
        extra={(id) => id === 'contact' && (
          <div className="mt-5 flex flex-wrap gap-3"><Link href="/contact"><Button>{t('legal.community.finalContact')}</Button></Link><Link href="/help"><Button variant="outline">{t('legal.community.ctaHelp')}</Button></Link></div>
        )}
        footer={<p className="px-2 text-sm text-muted">{t('legal.community.updated')} · {t('legal.community.complements')} <Link href="/legal/terms" className="font-semibold text-brand-ink underline">{t('legal.community.termsLink')}</Link>.</p>}
      />

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-14 text-center text-white shadow-pop">
          <h2 className="text-3xl font-extrabold md:text-4xl">{t('legal.community.finalTitle')}</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/90">{t('legal.community.finalText')}</p>
          <Link href="/register" className="mt-8 inline-block"><Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('legal.community.finalCta')}</Button></Link>
        </div>
      </section>
    </>
  );
}
