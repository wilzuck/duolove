'use client';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Field, Input } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';

function Form() {
  const t = useTranslations();
  const err = useApiError();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const m = useMutation({ mutationFn: () => post('/auth/reset-password', { token, password }), onSuccess: () => router.replace('/login') });
  return (
    <AuthShell title={t('auth.resetTitle')} footer={<Link href="/login" className="font-semibold text-brand-ink underline">{t('auth.backToLogin')}</Link>}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-5">
        {m.isError && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger-ink">{err(m.error)}</p>}
        <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>{(p) => <Input {...p} type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Button type="submit" size="lg" className="w-full" loading={m.isPending} disabled={!token}>{t('auth.resetCta')}</Button>
      </form>
    </AuthShell>
  );
}
export default function ResetPage() { return <Suspense><Form /></Suspense>; }
