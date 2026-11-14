'use client';
import { Coins } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { cn } from '@duomatch/ui';
import { useDisplayCurrency } from '@/hooks/useCurrency';
import { BASE_CURRENCY, convertXof, currencyOptions, formatMoney } from '@/lib/currency';
import { formatXof } from '@/lib/format';

/** Formateur des prix dans la devise choisie (ou devinée d'après le pays) ; FCFA si c'est la devise affichée ou si le taux manque. */
export function usePrice() {
  const locale = useLocale();
  const { currency, fx } = useDisplayCurrency();
  return useCallback((xof: number) => {
    const v = convertXof(xof, currency, fx?.rates);
    return v === null ? formatXof(xof, locale) : formatMoney(v, currency, locale);
  }, [currency, fx, locale]);
}

/** Prix dans la devise affichée (utilisable depuis une page serveur). */
export function Price({ xof }: { xof: number }) {
  return <>{usePrice()(xof)}</>;
}

/** Message traduit contenant un prix `{price}` (ex. « soit {price} l'unité »), dans la devise affichée. */
export function PriceMessage({ k, xof }: { k: 'plans.perUnit'; xof: number }) {
  const t = useTranslations();
  return <>{t(k, { price: usePrice()(xof) })}</>;
}

/** Montant réellement payé, en FCFA, sous un prix affiché dans une autre devise. Rien quand le prix est déjà en FCFA. */
export function PaidInXof({ xof, className }: { xof: number; className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { currency, fx } = useDisplayCurrency();
  if (convertXof(xof, currency, fx?.rates) === null) return null;
  return <span className={cn('block text-xs text-muted', className)}>{t('fx.paid', { amount: formatXof(xof, locale) })}</span>;
}

/** Choix de la devise d'affichage : icône seule et liste des devises des pays ouverts. */
export function CurrencyPicker({ className }: { className?: string }) {
  const t = useTranslations();
  const locale = useLocale();
  const { currency, fx, setCurrency } = useDisplayCurrency();
  if (!fx) return null;
  const options = currencyOptions(fx.rates, locale);
  if (options.length < 2) return null;
  return (
    <div className={cn('flex justify-center', className)}>
      <label className="relative inline-flex items-center" title={t('fx.label')}>
        <Coins className="pointer-events-none absolute left-3 size-4 text-muted" aria-hidden />
        <span className="sr-only">{t('fx.label')}</span>
        <select value={currency} onChange={(e) => setCurrency(e.target.value)}
          className="h-9 max-w-[16rem] cursor-pointer appearance-none rounded-full border border-line bg-card pr-4 pl-9 text-sm font-medium">
          {options.map((o) => <option key={o.code} value={o.code}>{o.code === BASE_CURRENCY ? t('fx.base') : o.label}</option>)}
        </select>
      </label>
    </div>
  );
}
