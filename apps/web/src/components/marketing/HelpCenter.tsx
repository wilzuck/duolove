'use client';
import { AccordionItem } from './AccordionItem';
import { ArrowRight, BookOpen, CalendarHeart, CreditCard, HeartHandshake, Lock, Search, ShieldCheck, Sparkles, X, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Button, Input } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';

const SECTIONS: [string, LucideIcon][] = [['start', Sparkles], ['meet', HeartHandshake], ['chat', CalendarHeart], ['safety', ShieldCheck], ['billing', CreditCard], ['privacy', Lock]];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
type Item = { q: string; a: string };

/** Centre d'aide : recherche instantanée (insensible aux accents et à la casse), thèmes en accès direct, réponses dépliables accessibles. */
export function HelpCenter() {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const data = useMemo(() => SECTIONS.map(([id, icon]) => ({ id, icon, items: t.raw(`help.items.${id}`) as Item[] })), [t]);
  const q = norm(query.trim());
  const filtered = data.map((s) => ({ ...s, items: q ? s.items.filter((i) => norm(i.q).includes(q) || norm(i.a).includes(q)) : s.items })).filter((s) => s.items.length);
  const count = filtered.reduce((n, s) => n + s.items.length, 0);
  return (
    <div className="mx-auto max-w-4xl px-4 pb-16">
      <form role="search" onSubmit={(e) => e.preventDefault()} className="-mt-7">
        <div className="relative">
          <label htmlFor="help-search" className="sr-only">{t('help.searchLabel')}</label>
          <Search className="pointer-events-none absolute top-1/2 left-5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <Input id="help-search" type="search" className="h-14 rounded-full bg-card pr-12 pl-13 text-base shadow-pop" placeholder={t('help.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('help.clear')} className="absolute top-1/2 right-4 -translate-y-1/2 rounded-full p-1.5 text-muted hover:bg-soft"><X className="size-5" /></button>}
        </div>
        <p className="mt-2 px-4 text-sm text-muted" role="status" aria-live="polite">{query ? t('help.results', { n: count }) : ''}</p>
      </form>

      {!query && (
        <nav aria-label={t('help.categories')} className="mt-8">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {data.map(({ id, icon: Icon }) => (
              <li key={id}><a href={`#h-${id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-4 font-semibold shadow-soft transition hover:-translate-y-0.5 hover:shadow-pop"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>{t(`help.sections.${id}`)}</a></li>
            ))}
          </ul>
        </nav>
      )}

      {count === 0 && (
        <div className="mt-10 rounded-3xl border border-line bg-card p-8 text-center shadow-soft">
          <BookOpen className="mx-auto size-8 text-brand-ink" aria-hidden />
          <p className="mt-3 text-lg">{t('help.noResults', { q: query.trim() })}</p>
          <Link href="/contact" className="mt-5 inline-block"><Button>{t('help.contactCta')}</Button></Link>
        </div>
      )}

      {filtered.map(({ id, icon: Icon, items }) => (
        <section key={id} id={`h-${id}`} aria-labelledby={`h-${id}-t`} className="mt-10 scroll-mt-24">
          <h2 id={`h-${id}-t`} className="mb-4 flex items-center gap-3 text-2xl font-bold"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-soft text-brand-ink"><Icon className="size-5" aria-hidden /></span>{t(`help.sections.${id}`)}</h2>
          <div className="space-y-3">
            {items.map((i) => (
              <AccordionItem key={i.q} question={i.q} open={!!q && items.length <= 3}>{i.a}</AccordionItem>
            ))}
          </div>
        </section>
      ))}

      <nav aria-labelledby="resources" className="mt-14">
        <h2 id="resources" className="text-sm font-semibold text-muted">{t('help.resources.title')}</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-3">
          {([['/how-it-works', 'how'], ['/pricing', 'pricing'], ['/legal/community', 'community']] as const).map(([href, k]) => (
            <li key={href}><Link href={href} className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm font-semibold shadow-soft transition hover:border-brand-ink hover:text-brand-ink">{t(`help.resources.${k}`)}<ArrowRight className="size-4 shrink-0" aria-hidden /></Link></li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby="more" className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-linear-to-br from-brand-strong to-brand-strong-2 p-7 text-white shadow-pop">
          <h2 id="more" className="text-xl font-extrabold">{t('help.moreTitle')}</h2>
          <p className="mt-2 text-white/90">{t('help.more')}</p>
          <Link href="/contact" className="mt-5 inline-block"><Button className="bg-white text-[#c2185b] hover:bg-white/90" variant="ghost">{t('help.contactCta')}</Button></Link>
        </div>
        <div className="rounded-3xl bg-gold/15 p-7">
          <h2 className="flex items-center gap-2 text-xl font-extrabold"><ShieldCheck className="size-5 text-gold-ink" aria-hidden />{t('help.urgentTitle')}</h2>
          <p className="mt-2 text-muted">{t('help.urgent')}</p>
          <Link href="/legal/community" className="mt-4 inline-block font-semibold text-brand-ink underline">{t('help.communityCta')}</Link>
        </div>
      </section>
    </div>
  );
}
