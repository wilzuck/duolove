import { Ban, Cookie, EyeOff, FileText, Gift, HelpCircle, Lock, MessageCircleHeart, PencilLine, Settings2, ShieldCheck, SlidersHorizontal, UserCheck, type LucideIcon } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Badge, Button } from '@duomatch/ui';
import { DocBody, type DocSection } from '@/components/marketing/DocBody';
import { Link } from '@/i18n/navigation';

const ICONS: Record<string, LucideIcon> = {
  essentiel: Gift, stockage: Cookie, connexion: Lock, preferences: SlidersHorizontal, tiers: UserCheck, jamais: Ban, gerer: Settings2, evolutions: PencilLine, contact: MessageCircleHeart,
};
const GLANCE_ICONS: LucideIcon[] = [Ban, EyeOff, ShieldCheck, Settings2];
type Row = { name: string; kind: string; purpose: string; duration: string; need: 'yes' | 'pref' };

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('legal.cookies.title'), description: t('legal.cookies.metaDescription') };
}

/** Politique de cookies : la liste est celle des cookies et stockages RÉELLEMENT posés par l'application (audit du code), tableau compris. */
export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const sections = t.raw('legal.cookies.sections') as DocSection[];
  const glance = t.raw('legal.cookies.glance') as { h: string; p: string }[];
  const rows = t.raw('legal.cookies.table.rows') as Row[];
  return (
    <>
      <section className="hero-glow">
        <div className="mx-auto max-w-4xl px-4 py-14 text-center md:py-20">
          <p className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-brand-ink shadow-soft"><Cookie className="size-4" aria-hidden />{t('legal.cookies.kicker')}</p>
          <h1 className="mt-6 text-balance text-4xl font-extrabold md:text-5xl">{t('legal.cookies.title')}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-lg text-muted">{t('legal.cookies.lead')}</p>
          <p className="mx-auto mt-6 max-w-2xl rounded-2xl bg-gold/15 p-4 text-left text-sm"><strong>{t('legal.draftTitle')}</strong> {t('legal.draftText')}</p>
          <p className="mt-3 text-sm text-muted">{t('legal.cookies.updated')}</p>
        </div>
      </section>

      <section aria-labelledby="glance" className="mx-auto max-w-6xl px-4 pt-10">
        <h2 id="glance" className="sr-only">{t('legal.cookies.glanceTitle')}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {glance.map((g, i) => {
            const Icon = GLANCE_ICONS[i] ?? ShieldCheck;
            return (
              <li key={g.h} className="rounded-3xl border border-line bg-card p-5 text-center shadow-soft">
                <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-soft text-brand-ink"><Icon className="size-6" aria-hidden /></span>
                <h3 className="mt-3 font-bold">{g.h}</h3><p className="mt-1 text-sm text-muted">{g.p}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="pt-10">
        <DocBody
          sections={sections} icons={ICONS} tocLabel={t('legal.cookies.toc')} listLabels={{ do: t('legal.cookies.listDo'), dont: t('legal.cookies.listDont'), info: t('legal.cookies.listInfo') }}
          extra={(id) => {
            if (id === 'stockage') {
              return (
                <div role="region" aria-label={t('legal.cookies.table.caption')} tabIndex={0} className="mt-5 overflow-x-auto rounded-2xl border border-line focus-visible:outline-2 focus-visible:outline-brand">
                  <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
                    <caption className="sr-only">{t('legal.cookies.table.caption')}</caption>
                    <thead className="bg-soft"><tr>{(['name', 'kind', 'purpose', 'duration', 'need'] as const).map((c) => <th key={c} scope="col" className="px-4 py-3 font-bold">{t(`legal.cookies.table.${c}`)}</th>)}</tr></thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.name} className="border-t border-line align-top">
                          <th scope="row" className="px-4 py-3 font-mono text-xs font-semibold">{r.name}</th>
                          <td className="px-4 py-3 text-muted">{r.kind}</td>
                          <td className="px-4 py-3">{r.purpose}</td>
                          <td className="px-4 py-3 text-muted">{r.duration}</td>
                          <td className="px-4 py-3"><Badge tone={r.need === 'yes' ? 'success' : 'neutral'}>{t(`legal.cookies.table.${r.need}`)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            }
            if (id === 'contact') return <div className="mt-5"><Link href="/contact"><Button>{t('legal.cookies.contact')}</Button></Link></div>;
            return null;
          }}
          footer={
            <nav aria-label={t('legal.cookies.seeAlso')} className="rounded-3xl bg-soft p-6">
              <h2 className="flex items-center gap-2 font-bold"><HelpCircle className="size-5 text-brand-ink" aria-hidden />{t('legal.cookies.seeAlso')}</h2>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 font-semibold text-brand-ink">
                <li><Link href="/legal/privacy" className="underline">{t('legal.cookies.privacy')}</Link></li>
                <li><Link href="/legal/terms" className="underline"><FileText className="mr-1 inline size-4" aria-hidden />{t('legal.cookies.terms')}</Link></li>
              </ul>
            </nav>
          }
        />
      </div>
    </>
  );
}
