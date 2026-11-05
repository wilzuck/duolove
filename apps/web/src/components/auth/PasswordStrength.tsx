'use client';
import { Check, Circle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { cn } from '@duomatch/ui';

const RULES = [
  ['length', (v: string) => v.length >= 10], ['upper', (v: string) => /[A-Z]/.test(v)], ['lower', (v: string) => /[a-z]/.test(v)], ['digit', (v: string) => /\d/.test(v)],
] as const;

/** Aide à choisir un mot de passe solide : mêmes règles que le serveur, affichées en positif et jamais bloquantes avant l'envoi. */
export function PasswordStrength({ value }: { value: string }) {
  const t = useTranslations();
  if (!value) return null;
  const ok = RULES.map(([k, test]) => [k, test(value)] as const);
  const score = ok.filter(([, v]) => v).length;
  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1.5" aria-hidden>{RULES.map(([k], i) => <span key={k} className={cn('h-1.5 flex-1 rounded-full', i < score ? (score === 4 ? 'bg-success' : 'bg-brand-strong') : 'bg-line')} />)}</div>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {ok.map(([k, v]) => <li key={k} className={cn('flex items-center gap-1.5', v ? 'text-success-ink' : 'text-muted')}>{v ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3.5" aria-hidden />}<span>{t(`auth.rule.${k}`)}<span className="sr-only"> — {t(v ? 'auth.ruleOk' : 'auth.ruleTodo')}</span></span></li>)}
      </ul>
      <p role="status" className="sr-only">{score === 4 ? t('auth.strengthDone') : ''}</p>
    </div>
  );
}
