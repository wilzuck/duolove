'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Input, Skeleton } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { useApiError } from '@/hooks/useApiError';
import { useMe } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import { ApiError, api, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';

interface State { verified: boolean; email: string; devCode: string | null; codeMinutes: number; resendIn: number; deleteAfterHours: number; deleteAt: string; maxAttempts: number }

/** Étape obligatoire après l'inscription : saisir le code à 6 chiffres reçu par e-mail. Tant qu'elle n'est pas faite, rien d'autre n'est accessible
 *  (garde appliquée par le serveur ET par l'application). Un compte jamais confirmé est supprimé automatiquement après la durée réglée par l'administration. */
export default function ConfirmEmailPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: me, error: meError } = useMe();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState<number | null>(null);
  const state = useQuery({ queryKey: ['verification'], queryFn: () => api<State>('/auth/verification'), enabled: !!me, retry: false, refetchOnWindowFocus: false });

  useEffect(() => { if (meError instanceof ApiError && meError.status === 401) router.replace('/login'); }, [meError, router]);
  useEffect(() => { if (me?.emailVerified) router.replace(me.profile?.onboarded ? '/discover' : '/onboarding'); }, [me, router]);
  const seconds = wait ?? state.data?.resendIn ?? 0;
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setWait(seconds - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const verify = useMutation({
    mutationFn: () => post('/auth/verify-code', { code }),
    onSuccess: async () => { await qc.invalidateQueries(); toast('success', t('auth.verifyOk')); },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'INVALID_CODE') setError(t('confirm.wrong', { n: (e.details as { remaining?: number } | undefined)?.remaining ?? 0 }));
      else setError(err(e));
      setCode('');
    },
  });
  const resend = useMutation({
    mutationFn: () => post<{ resendIn: number }>('/auth/resend-verification'),
    onSuccess: (r) => { setError(null); setCode(''); setWait(r.resendIn); toast('success', t('confirm.resent')); },
    onError: (e) => { if (e instanceof ApiError && e.code === 'RESEND_TOO_SOON') setWait((e.details as { retryAfter?: number } | undefined)?.retryAfter ?? 30); setError(err(e)); },
  });
  const logout = useMutation({ mutationFn: () => post('/auth/logout'), onSuccess: () => { qc.clear(); router.replace('/register'); } });

  if (!me || !state.data) return <AuthShell title={t('confirm.title')}><Skeleton className="h-48" /></AuthShell>;
  const s = state.data;
  return (
    <AuthShell title={t('confirm.title')} subtitle={t('confirm.subtitle', { email: s.email, minutes: s.codeMinutes })}>
      <form onSubmit={(e) => { e.preventDefault(); setError(null); if (/^\d{6}$/.test(code)) verify.mutate(); }} className="space-y-5" noValidate>
        <div className="flex justify-center"><span className="flex size-14 items-center justify-center rounded-full bg-soft text-brand-ink"><MailCheck className="size-7" aria-hidden /></span></div>
        {s.devCode && <Alert tone="success">{t('confirm.devHint', { code: s.devCode })}</Alert>}
        {error && <Alert>{error}</Alert>}
        <Field label={t('confirm.codeLabel')} hint={t('confirm.codeHint')}>
          {(p) => <Input {...p} inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center font-mono text-3xl tracking-[0.5em]" placeholder="••••••" />}
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={verify.isPending} disabled={code.length !== 6}>{t('confirm.submit')}</Button>
      </form>
      <div className="mt-6 space-y-3 text-center text-sm">
        <p className="text-muted">{t('confirm.notReceived')}</p>
        <Button type="button" variant="outline" onClick={() => resend.mutate()} loading={resend.isPending} disabled={seconds > 0}>{seconds > 0 ? t('confirm.resendIn', { n: seconds }) : t('confirm.resend')}</Button>
        <p className="rounded-2xl bg-soft p-3 text-left text-xs text-muted">{t('confirm.deleteNotice', { hours: s.deleteAfterHours, date: formatDate(s.deleteAt, locale, { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) })}</p>
        <button type="button" onClick={() => logout.mutate()} className="font-medium text-brand-ink underline">{t('confirm.wrongAddress')}</button>
      </div>
    </AuthShell>
  );
}
