import { Ban, Banknote, CalendarHeart, CreditCard, FileText, Gavel, Heart, Lock, LogOut, MessageCircleHeart, Pencil, Radio, Scale, ScrollText, ShieldCheck, UserCheck, UserCog, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Button } from '@duomatch/ui';
import { DocBody, type DocSection } from '@/components/marketing/DocBody';
import { Link } from '@/i18n/navigation';

const ICONS: Record<string, LucideIcon> = {
  objet: ScrollText, acces: UserCheck, compte: UserCog, conduite: Ban, contenus: Heart, offres: CreditCard, paiements: Banknote, moderation: ShieldCheck,
  rencontres: CalendarHeart, disponibilite: Radio, donnees: Lock, fin: LogOut, evolutions: Pencil, droit: Gavel, contact: MessageCircleHeart,
};

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('legal.terms.title'), description: t('legal.terms.metaDescription') };
}

/** Conditions d'utilisation, structurées et lisibles. Texte à faire valider par un juriste avant la mise en production (bandeau conservé). */
export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const sections = t.raw('legal.terms.sections') as DocSection[];
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center md:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><FileText className="size-4" aria-hidden />{t('legal.terms.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-5xl">{t('legal.terms.title')}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted">{t('legal.terms.lead')}</p>
          <p className="mx-auto mt-6 max-w-2xl rounded-2xl bg-gold/15 p-4 text-left text-sm"><strong>{t('legal.draftTitle')}</strong> {t('legal.draftText')}</p>
          <p className="mt-3 text-sm text-muted">{t('legal.terms.updated')}</p>
        </div>
      </section>
      <div className="pt-10">
        <DocBody
          sections={sections} icons={ICONS} tocLabel={t('legal.terms.toc')} listLabels={{ do: t('legal.terms.listDo'), dont: t('legal.terms.listDont'), info: t('legal.terms.listInfo') }}
          extra={(id) => id === 'contact' && <div className="mt-5"><Link href="/contact"><Button>{t('legal.terms.contact')}</Button></Link></div>}
          footer={
            <nav aria-label={t('legal.terms.seeAlso')} className="rounded-3xl bg-soft p-6">
              <h2 className="flex items-center gap-2 font-bold"><Scale className="size-5 text-brand-ink" aria-hidden />{t('legal.terms.seeAlso')}</h2>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-semibold text-brand-ink">
                <li><Link href="/legal/community" className="underline">{t('legal.terms.community')}</Link></li>
                <li><Link href="/legal/privacy" className="underline">{t('legal.terms.privacy')}</Link></li>
                <li><Link href="/legal/cookies" className="underline">{t('legal.terms.cookies')}</Link></li>
              </ul>
            </nav>
          }
        />
      </div>
    </>
  );
}
