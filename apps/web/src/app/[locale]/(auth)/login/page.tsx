'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Button, Checkbox, Field, Input } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';

function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const err = useApiError();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [magic, setMagic] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = params.get('next');

  const done = async () => {
    await qc.invalidateQueries();
    router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/discover');
  };
  const login = useMutation({ mutationFn: () => post('/auth/login', { email, password, remember }), onSuccess: done, onError: (e) => setError(err(e)) });
  const sendLink = useMutation({ mutationFn: () => post('/auth/magic-link', { email, remember }), onSuccess: () => setMagicSent(true), onError: (e) => setError(err(e)) });
  const google = useMutation({
    mutationFn: (idToken: string) => post('/auth/google', { idToken }),
    onSuccess: done,
    onError: (e) => setError(e instanceof Error && 'code' in e && (e as { code: string }).code === 'PROFILE_DETAILS_REQUIRED' ? t('auth.googleNeedsSignup') : err(e)),
  });

  return (
    <AuthShell title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')} footer={<>{t('auth.noAccount')} <Link href="/register" className="font-semibold text-brand-ink underline">{t('nav.register')}</Link></>}>
      <GoogleButton onToken={(tok) => google.mutate(tok)} />
      <form onSubmit={(e) => { e.preventDefault(); setError(null); setMagicSent(false); if (magic) sendLink.mutate(); else login.mutate(); }} className="space-y-5" noValidate>
        {error && <Alert>{error}</Alert>}
        <Field label={t('auth.email')}>{(p) => <Input {...p} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        {magicSent && <Alert tone="success">{t('auth.magicSent')}</Alert>}
        {!magic && <Field label={t('auth.password')}>{(p) => <Input {...p} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>}
        <Checkbox label={t('auth.remember')} hint={t('auth.rememberHint')} checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        {!magic && <div className="text-center text-sm"><Link href="/forgot-password" className="font-medium text-brand-ink underline">{t('auth.forgot')}</Link></div>}
        <Button type="submit" size="lg" className="w-full" loading={login.isPending || sendLink.isPending}>{magic ? t('auth.magicSend') : t('nav.login')}</Button>
        <button type="button" className="w-full text-center text-sm font-medium text-brand-ink underline" onClick={() => { setMagic(!magic); setError(null); setMagicSent(false); }}>{magic ? t('auth.magicBack') : t('auth.magicLink')}</button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
