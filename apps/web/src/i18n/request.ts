import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

type Messages = Record<string, unknown>;

/** Fusion récursive : la langue demandée gagne, le français comble les trous (ajout progressif d'une langue). */
function withFallback(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const cur = out[k];
    const isObj = (x: unknown) => !!x && typeof x === 'object' && !Array.isArray(x); // les tableaux sont des valeurs, pas des branches
    out[k] = isObj(v) && isObj(cur) ? withFallback(cur as Messages, v as Messages) : v;
  }
  return out;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const fr = (await import('../../messages/fr.json')).default as Messages;
  const messages = locale === 'fr' ? fr : withFallback(fr, (await import(`../../messages/${locale}.json`)).default as Messages);
  return { locale, messages };
});
