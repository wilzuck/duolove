'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input } from '@duomatch/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

interface Status { enabled: boolean; pending: boolean; recoveryLeft: number; hasPassword: boolean }
type Mode = 'idle' | 'setup' | 'codes' | 'recovery' | 'disable';

/**
 * Double authentification par application (Google Authenticator, Microsoft Authenticator, Authy…). Facultative.
 * Activation : clé → ajout dans l'application → premier code (confirme que ça marche) → 10 codes de secours montrés UNE SEULE FOIS.
 * Désactivation : mot de passe (si le compte en a un) ET code. Les comptes Google n'ont pas de mot de passe : le code suffit.
 */
export function TwoFactorCard() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const st = useQuery({ queryKey: ['2fa'], queryFn: () => api<Status>('/auth/2fa') });
  const [mode, setMode] = useState<Mode>('idle');
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const reset = () => { setCode(''); setPassword(''); setError(null); };
  const refresh = () => qc.invalidateQueries({ queryKey: ['2fa'] });
  const fail = (e: unknown) => setError(err(e));

  const start = useMutation({ mutationFn: () => post<{ secret: string; uri: string }>('/auth/2fa/setup'), onSuccess: (r) => { setSetup(r); setMode('setup'); reset(); }, onError: (e) => toast('error', err(e)) });
  const enable = useMutation({ mutationFn: () => post<{ recoveryCodes: string[] }>('/auth/2fa/enable', { code: code.trim() }), onSuccess: (r) => { setCodes(r.recoveryCodes); setMode('codes'); setSetup(null); reset(); void refresh(); }, onError: fail });
  const regen = useMutation({ mutationFn: () => post<{ recoveryCodes: string[] }>('/auth/2fa/recovery', { code: code.trim() }), onSuccess: (r) => { setCodes(r.recoveryCodes); setMode('codes'); reset(); void refresh(); }, onError: fail });
  const disable = useMutation({ mutationFn: () => post('/auth/2fa/disable', { code: code.trim(), ...(st.data?.hasPassword ? { password } : {}) }), onSuccess: () => { setMode('idle'); reset(); toast('success', t('twoFactor.disabled')); void refresh(); }, onError: fail });

  const codeField = <Field label={t('twoFactor.codeLabel')} hint={t('twoFactor.codeHint')}>{(p) => <Input {...p} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={12} className="font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} />}</Field>;
  const form = (onSubmit: () => void, pending: boolean, label: string, children: React.ReactNode) => (
    <form onSubmit={(e) => { e.preventDefault(); setError(null); onSubmit(); }} className="mt-4 space-y-4" noValidate>
      {error && <Alert>{error}</Alert>}
      {children}
      <div className="flex gap-2"><Button type="submit" loading={pending} disabled={code.trim().length < 6}>{label}</Button><Button type="button" variant="ghost" onClick={() => { setMode('idle'); setSetup(null); reset(); }}>{t('common.cancel')}</Button></div>
    </form>
  );

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 font-bold">{st.data?.enabled ? <ShieldCheck className="size-5 text-success-ink" aria-hidden /> : <ShieldOff className="size-5 text-muted" aria-hidden />}{t('twoFactor.title')}</h3><p className="mt-1 max-w-prose text-sm text-muted">{t('twoFactor.text')}</p></div>
        {st.data && <Badge tone={st.data.enabled ? 'success' : 'neutral'}>{st.data.enabled ? t('twoFactor.on') : t('twoFactor.off')}</Badge>}
      </div>

      {st.data && !st.data.enabled && mode === 'idle' && <div className="mt-4"><Button onClick={() => start.mutate()} loading={start.isPending}>{t('twoFactor.enable')}</Button></div>}

      {mode === 'setup' && setup && (
        <div className="mt-4 space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>{t('twoFactor.step1')}</li>
            <li>{t('twoFactor.step2')}
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-soft p-3">
                <code className="font-mono text-base font-semibold tracking-wider break-all">{setup.secret}</code>
                <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard?.writeText(setup.secret.replace(/ /g, '')); toast('success', t('twoFactor.copied')); }}><Copy className="size-4" aria-hidden />{t('twoFactor.copy')}</Button>
                <a href={setup.uri} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-ink underline"><Smartphone className="size-4" aria-hidden />{t('twoFactor.openApp')}</a>
              </div>
            </li>
            <li>{t('twoFactor.step3')}</li>
          </ol>
          {form(() => enable.mutate(), enable.isPending, t('twoFactor.confirm'), codeField)}
        </div>
      )}

      {mode === 'codes' && (
        <div className="mt-4 space-y-3" role="status">
          <Alert tone="success">{t('twoFactor.codesTitle')}</Alert>
          <p className="text-sm text-muted">{t('twoFactor.codesText')}</p>
          <ul className="grid grid-cols-2 gap-2 rounded-2xl bg-soft p-4 font-mono text-base font-semibold sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="flex gap-2"><Button variant="outline" onClick={() => { void navigator.clipboard?.writeText(codes.join('\n')); toast('success', t('twoFactor.copied')); }}><Copy className="size-4" aria-hidden />{t('twoFactor.copyAll')}</Button><Button onClick={() => { setMode('idle'); setCodes([]); }}>{t('twoFactor.saved')}</Button></div>
        </div>
      )}

      {st.data?.enabled && mode === 'idle' && (
        <div className="mt-4 space-y-3">
          <p className="text-sm">{t('twoFactor.recoveryLeft', { n: st.data.recoveryLeft })}{st.data.recoveryLeft <= 2 && <span className="ml-1 font-semibold text-danger-ink">{t('twoFactor.recoveryLow')}</span>}</p>
          <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setMode('recovery'); reset(); }}>{t('twoFactor.newCodes')}</Button><Button variant="outline" onClick={() => { setMode('disable'); reset(); }}>{t('twoFactor.disable')}</Button></div>
        </div>
      )}
      {mode === 'recovery' && form(() => regen.mutate(), regen.isPending, t('twoFactor.newCodes'), codeField)}
      {mode === 'disable' && form(() => disable.mutate(), disable.isPending, t('twoFactor.disable'), <>
        {st.data?.hasPassword && <Field label={t('settings.security.current')}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>}
        {codeField}
      </>)}
    </Card>
  );
}
