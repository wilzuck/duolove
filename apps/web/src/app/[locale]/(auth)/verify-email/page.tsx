'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button, Spinner } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { Link } from '@/i18n/navigation';
import { post } from '@/lib/api';

function Verify() {
  const t = useTranslations();
  const qc = useQueryClient();
  const token = useSearchParams().get('token');
  const q = useQuery({
    queryKey: ['verify', token], enabled: !!token, retry: false, staleTime: Infinity,
    queryFn: async () => { await post('/auth/verify-email', { token }); await qc.invalidateQueries({ queryKey: ['me'] }); return true; },
  });
  const ok = q.isSuccess;
  const bad = q.isError || !token;
  return (
    <AuthShell title={t('auth.verifyTitle')}>
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        {q.isLoading && <Spinner size="lg" label={t('common.loading')} />}
        {ok && <><CheckCircle2 className="size-12 text-success-ink" aria-hidden /><p>{t('auth.verifyOk')}</p><Link href="/discover"><Button>{t('auth.continue')}</Button></Link></>}
        {bad && <><XCircle className="size-12 text-danger-ink" aria-hidden /><p>{t('auth.verifyBad')}</p><Link href="/login"><Button variant="outline">{t('nav.login')}</Button></Link></>}
      </div>
    </AuthShell>
  );
}
export default function VerifyPage() { return <Suspense><Verify /></Suspense>; }
