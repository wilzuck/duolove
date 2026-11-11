import { AccordionItem } from '@/components/marketing/AccordionItem';
import { Coins, Rocket, Star } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BOOST_MINUTES } from '@duomatch/types';
import { Button } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { PageToc } from '@/components/marketing/PageToc';
import { PricingTable } from '@/components/marketing/PricingTable';
import { fetchCatalog } from '@/lib/catalog';
import { formatXof } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.pricing'), description: t('home.plansSubtitle') };
}

const groups = [
  { kind: 'BOOST', icon: Rocket, title: 'shop.groupBoosts', text: 'shop.groupBoostsText' },
  { kind: 'SUPER_LIKE_PACK', icon: Star, title: 'shop.groupSuperLikes', text: 'shop.groupSuperLikesText' },
  { kind: 'TOKEN_PACK', icon: Coins, title: 'shop.groupTokens', text: 'shop.groupTokensText' },
] as const;
const NEEDS = ['liked', 'filters', 'photos', 'visible', 'safe'] as const;
const FAQ = ['renew', 'cancel', 'momo', 'refund', 'guarantee', 'credits'] as const;

export default async function Pricing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, catalog] = await Promise.all([getTranslations(), fetchCatalog()]);
  return (
    <>
    <div className="bg-linear-to-b from-soft via-soft/40 to-transparent">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-16 pb-10 md:pt-24 md:pb-12">
        <h1 className="text-balance text-center text-4xl font-extrabold md:text-5xl">{t('home.plansTitle')}</h1>
        <p className="mx-auto mt-5 max-w-xl text-center text-lg text-muted">{t('home.plansSubtitle')}</p>
      </div>
    </div>
    <PageToc items={[{ id: 'tiers', label: t('toc.tiers') }, { id: 'needs', label: t('toc.needs') }, { id: 'shop', label: t('toc.shop') }, { id: 'faqp', label: t('toc.faq') }]} />
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 pb-16">
      <div id="tiers" className="scroll-mt-36"><PricingTable initial={catalog} /></div>

      <section className="mx-auto mt-16 max-w-4xl scroll-mt-36" aria-labelledby="needs-title" id="needs">
        <h2 id="needs-title" className="text-2xl font-bold">{t('needs.title')}</h2>
        <p className="mt-2 text-muted">{t('needs.lead')}</p>
        <ul className="mt-6 divide-y divide-line rounded-3xl border border-line bg-card shadow-soft">
          {NEEDS.map((k) => {
            const who = t(`needs.items.${k}.who` as never) as string;
            return (
              <li key={k} className="grid gap-2 p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_8rem] md:items-center md:gap-6">
                <h3 className="font-bold">{t(`needs.items.${k}.h` as never)}</h3>
                <p className="text-muted">{t(`needs.items.${k}.p` as never)}</p>
                <span className="w-fit rounded-full bg-soft px-3 py-1 text-sm font-semibold text-brand-ink md:justify-self-end">{t(`needs.${who}` as never)}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mx-auto mt-16 max-w-4xl scroll-mt-36" aria-labelledby="shop-title" id="shop">
        <h2 id="shop-title" className="text-2xl font-bold">{t('plans.shopTitle')}</h2>
        <p className="mt-2 text-muted">{t('plans.shopText')}</p>
        {groups.map((g) => {
          const items = catalog.products.filter((p) => p.kind === g.kind);
          if (!items.length) return null;
          const Icon = g.icon;
          return (
            <div key={g.kind} className="mt-10" role="group" aria-labelledby={`g-${g.kind}`}>
              <h3 id={`g-${g.kind}`} className="flex items-center gap-2 text-xl font-bold"><Icon className="size-5 text-brand-ink" aria-hidden />{t(g.title as never)}</h3>
              <p className="mt-1 text-sm text-muted">{t(g.text as never)}</p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                {items.map((p) => {
                  const mins = BOOST_MINUTES[p.creditType as keyof typeof BOOST_MINUTES];
                  const big = p.kind === 'BOOST' ? t(mins >= 60 ? 'plans.hoursShort' : 'plans.minutesShort', { n: mins >= 60 ? mins / 60 : mins }) : String(p.quantity);
                  const label = p.kind === 'BOOST' ? t('plans.boostLabel') : p.kind === 'SUPER_LIKE_PACK' ? t('plans.superLikesLabel') : t('plans.tokensLabel');
                  return (
                    <li key={p.code} className="flex flex-col items-center gap-1 rounded-3xl border border-line bg-card p-6 text-center shadow-soft">
                      <span className="font-display text-5xl font-extrabold text-brand-ink">{big}</span>
                      <span className="font-semibold">{label}</span>
                      {p.kind === 'BOOST' && <span className="text-sm text-muted">{t('plans.boostDuration')}</span>}
                      {p.kind !== 'BOOST' && p.quantity > 1 && <span className="text-sm text-muted">{t('plans.perUnit', { price: formatXof(Math.round(p.priceXof / p.quantity), locale) })}</span>}
                      <span className="mt-3 rounded-full bg-soft px-4 py-1.5 text-lg font-bold text-brand-ink">{formatXof(p.priceXof, locale)}</span>
                      <Link href={`/shop#prod-${p.kind}`} className="mt-3 w-full"><Button size="sm" className="w-full">{t('plans.order')}</Button></Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="mx-auto mt-16 max-w-3xl scroll-mt-36" aria-labelledby="faqp-title" id="faqp">
        <h2 id="faqp-title" className="text-2xl font-bold">{t('home.faqTitle')}</h2>
        <div className="mt-5 space-y-3">
          {FAQ.map((k) => (
            <AccordionItem key={k} question={t(`pricingFaq.${k}.q`)}>{t(`pricingFaq.${k}.a`)}</AccordionItem>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-16 max-w-4xl rounded-[2rem] bg-linear-to-br from-brand-strong to-brand-strong-2 px-6 py-12 text-center text-white shadow-pop" aria-labelledby="pricing-cta">
        <h2 id="pricing-cta" className="text-3xl font-extrabold">{t('how.finalTitle')}</h2>
        <p className="mx-auto mt-3 max-w-xl text-white/90">{t('how.finalText')}</p>
        <Link href="/register" className="mt-6 inline-block"><Button size="lg" className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('home.ctaRegister')}</Button></Link>
      </section>
    </div>
    </>
  );
}
