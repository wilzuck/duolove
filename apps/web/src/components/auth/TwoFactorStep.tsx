'use client';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';

/**
 * Deuxième étape de la connexion quand la double authentification est activée : le serveur a accepté le mot de passe (ou le lien, ou Google)
 * et renvoyé un défi ; le code de l'application d'authentification (6 chiffres) ou un code de secours le complète. Aucune session avant cela.
 */
export function TwoFactorStep({ challenge, remember, onDone, onCancel }: { challenge: string; remember: boolean; onDone: () => void | Promise<void>; onCancel?: () => void }) {
  const t = useTranslations();
  const err = useApiError();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const verify = useMutation({ mutationFn: () => post('/auth/2fa/login', { challenge, code: code.trim(), remember }), onSuccess: () => onDone(), onError: (e) => setError(err(e)) });
  return (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); verify.mutate(); }} className="space-y-5" noValidate>
      <p className="flex items-start gap-2 text-sm text-muted"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />{t('auth.twoFactor.hint')}</p>
      {error && <Alert>{error}</Alert>}
      <Field label={t('auth.twoFactor.label')} hint={t('auth.twoFactor.recoveryHint')}>
        {(p) => <Input {...p} autoFocus autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={12} className="text-center font-mono text-xl tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} />}
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={verify.isPending} disabled={code.trim().length < 6}>{t('auth.twoFactor.submit')}</Button>
      {onCancel && <button type="button" className="w-full text-center text-sm font-medium text-brand-ink underline" onClick={onCancel}>{t('auth.twoFactor.back')}</button>}
    </form>
  );
}
