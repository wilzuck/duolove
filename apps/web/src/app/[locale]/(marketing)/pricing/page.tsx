import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PricingTable } from '@/components/marketing/PricingTable';
import { fetchCatalog } from '@/lib/catalog';
import { formatXof } from '@/lib/format';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const t = await getTranslations({ locale: (await params).locale });
  return { title: t('nav.pricing'), description: t('home.plansSubtitle') };
}

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

      <section className="mx-auto mt-16 max-w-3xl" aria-labelledby="shop">
        <h2 id="shop" className="text-2xl font-bold">{t('plans.shopTitle')}</h2>
        <p className="mt-2 text-muted">{t('plans.shopText')}</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {catalog.products.map((p) => <li key={p.code} className="flex items-center justify-between rounded-2xl border border-line bg-card px-5 py-4"><span className="font-semibold">{p.name}</span><span className="text-brand-ink font-bold">{formatXof(p.priceXof, locale)}</span></li>)}
        </ul>
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
