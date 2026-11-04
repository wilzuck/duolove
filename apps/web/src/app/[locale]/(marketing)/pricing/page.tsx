import { Rocket, Star, Coins } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BOOST_MINUTES } from '@duomatch/types';
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
const FAQ = ['renew', 'cancel', 'momo', 'refund', 'guarantee', 'credits'] as const;

export default async function Pricing({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, catalog] = await Promise.all([getTranslations(), fetchCatalog()]);
  return (
    <div className="mx-auto max-w-6xl px-4 py-16">
      <h1 className="text-center text-4xl font-extrabold md:text-5xl">{t('home.plansTitle')}</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted">{t('home.plansSubtitle')}</p>
      <div className="mt-10"><PricingTable initial={catalog} /></div>

      <section className="mx-auto mt-16 max-w-4xl" aria-labelledby="shop">
        <h2 id="shop" className="text-2xl font-bold">{t('plans.shopTitle')}</h2>
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
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="faqp">
        <h2 id="faqp" className="text-2xl font-bold">{t('home.faqTitle')}</h2>
        <div className="mt-5 space-y-3">
          {FAQ.map((k) => (
            <details key={k} className="rounded-2xl border border-line bg-card px-5 py-4 open:shadow-soft"><summary className="cursor-pointer list-none font-semibold marker:hidden">{t(`pricingFaq.${k}.q`)}</summary><p className="mt-3 text-muted">{t(`pricingFaq.${k}.a`)}</p></details>
          ))}
        </div>
      </section>
    </div>
  );
}
