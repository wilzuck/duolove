'use client';
import { Coins } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';
import { useDisplayCurrency } from '@/hooks/useCurrency';
import { BASE_CURRENCY, convertXof, currencyOptions, formatMoney } from '@/lib/currency';
import { formatDate } from '@/lib/format';

/** « ≈ 3,81 € » sous un prix en FCFA, dans la devise du visiteur. Rien si la devise affichée est le FCFA ou si le taux manque. */
export function ApproxPrice({ xof, className, suffix }: { xof: number; className?: string; /** Ex. « / mois », déjà traduit. */ suffix?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { currency, fx } = useDisplayCurrency();
  const v = convertXof(xof, currency, fx?.rates);
  if (v === null) return null;
  return (
    <span className={cn('block text-sm text-muted', className)}>
      <span aria-hidden>≈ </span><span className="sr-only">{t('fx.about')} </span>{formatMoney(v, currency, locale)}{suffix ? ` ${suffix}` : ''}
    </span>
  );
}

/** Choix de la devise d'affichage + mention : paiement en FCFA, conversion indicative, source des taux. */
export function CurrencyPicker({ className }: { className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { currency, fx, setCurrency } = useDisplayCurrency();
  if (!fx) return null;
  const options = currencyOptions(fx.rates, locale);
  if (options.length < 2) return null;
  return (
    <div className={cn('mx-auto flex max-w-xl flex-col items-center gap-1.5 text-center', className)}>
      <label className="relative inline-flex items-center gap-2 text-sm font-medium">
        <Coins className="size-4 text-muted" aria-hidden />
        <span>{t('fx.label')}</span>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}
          className="h-9 max-w-[14rem] cursor-pointer rounded-full border border-line bg-card px-3 text-sm font-medium">
          {options.map((o) => <option key={o.code} value={o.code}>{o.code === BASE_CURRENCY ? t('fx.base') : o.label}</option>)}
        </select>
      </label>
      {currency !== BASE_CURRENCY && (
        <p className="text-xs text-muted">
          {fx.source === 'fixed' || !fx.updatedAt ? t('fx.noteFixed') : t('fx.note', { date: formatDate(fx.updatedAt, locale, { day: 'numeric', month: 'long' }) })}
          {fx.source !== 'fixed' && <> <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">{t('fx.source')}</a></>}
        </p>
      )}
    </div>
  );
}
