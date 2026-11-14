/** Prix affichés aussi dans une autre devise, à titre indicatif (le paiement se fait toujours en FCFA). Fonctions pures, testées. */

export const BASE_CURRENCY = 'XOF';
/** Devises proposées en tête de liste : zone FCFA, diaspora (Europe, Amérique du Nord), voisins anglophones et Maghreb. */
export const COMMON_CURRENCIES = ['XOF', 'XAF', 'EUR', 'USD', 'CAD', 'GBP', 'CHF', 'NGN', 'GHS', 'MAD'] as const;
export const CURRENCY_STORAGE_KEY = 'crushduo.currency';

export interface FxRates { rates: Record<string, number>; updatedAt: string | null; source: 'exchangerate-api' | 'fixed'; country: string | null; detected: string | null }

const isCode = (v: unknown): v is string => typeof v === 'string' && /^[A-Z]{3}$/.test(v);

/** Devise à afficher : choix du visiteur s'il existe un taux pour elle, sinon devise de son pays, sinon FCFA seul. */
export function pickCurrency(fx: Pick<FxRates, 'rates' | 'detected'> | undefined, chosen: string | null): string {
  if (!fx) return BASE_CURRENCY;
  if (isCode(chosen) && fx.rates[chosen]) return chosen;
  if (isCode(fx.detected) && fx.rates[fx.detected]) return fx.detected;
  return BASE_CURRENCY;
}

/** Montant converti, ou null quand il n'y a rien à ajouter (FCFA, taux inconnu, montant invalide). XAF = même valeur, autre billet : affiché. */
export function convertXof(xof: number, currency: string, rates: Record<string, number> | undefined): number | null {
  const rate = rates?.[currency];
  if (currency === BASE_CURRENCY || !rate || !Number.isFinite(xof) || xof < 0) return null;
  return xof * rate;
}

const intl = (locale: string) => (locale === 'en' ? 'en-US' : 'fr-FR');

/** 3,81 € · $4.21 · 5 626 NGN : décimales seulement pour les petits montants (au-delà de 100, l'arrondi à l'unité suffit pour un ordre de grandeur). */
export function formatMoney(amount: number, currency: string, locale: string): string {
  const big = Math.abs(amount) >= 100;
  try {
    return new Intl.NumberFormat(intl(locale), { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...(big ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}) }).format(amount);
  } catch {
    return `${new Intl.NumberFormat(intl(locale), { maximumFractionDigits: big ? 0 : 2 }).format(amount)} ${currency}`;
  }
}

/** « Euro (EUR) », « Franc CFA (BCEAO) (XOF) »… ; le code seul si le navigateur ne connaît pas le nom. */
export function currencyLabel(code: string, locale: string): string {
  try {
    const name = new Intl.DisplayNames([intl(locale)], { type: 'currency' }).of(code);
    return name && name !== code ? `${name[0]!.toUpperCase()}${name.slice(1)} (${code})` : code;
  } catch {
    return code;
  }
}

/** Liste du sélecteur : devises courantes d'abord, puis toutes les autres par ordre alphabétique du nom. */
export function currencyOptions(rates: Record<string, number>, locale: string): { code: string; label: string }[] {
  const common = COMMON_CURRENCIES.filter((c) => rates[c]);
  const rest = Object.keys(rates).filter((c) => isCode(c) && (rates[c] ?? 0) > 0 && !common.includes(c as never)).map((code) => ({ code, label: currencyLabel(code, locale) }))
    .sort((a, b) => a.label.localeCompare(b.label, intl(locale)));
  return [...common.map((code) => ({ code, label: currencyLabel(code, locale) })), ...rest];
}
