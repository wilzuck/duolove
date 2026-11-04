'use client';
import { useMutation } from '@tanstack/react-query';
import { MailCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Alert, Button, Field, Input } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';

export default function ForgotPage() {
  const t = useTranslations();
  const err = useApiError();
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => post('/auth/forgot-password', { email }) });
  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')} footer={<Link href="/login" className="font-semibold text-brand-ink underline">{t('auth.backToLogin')}</Link>}>
      {m.isSuccess ? (
        <div role="status" className="flex flex-col items-center gap-3 text-center"><MailCheck className="size-10 text-success-ink" aria-hidden /><p>{t('auth.forgotSent')}</p></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-5">
          {m.isError && <Alert>{err(m.error)}</Alert>}
          <Field label={t('auth.email')}>{(p) => <Input {...p} type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>{t('auth.sendLink')}</Button>
        </form>
      )}
    </AuthShell>
  );
}
