'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { Button } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { Link, useRouter } from '@/i18n/navigation';
import { post } from '@/lib/api';

/** Valide le lien reçu par e-mail (usage unique) puis ouvre la session. */
function MagicLink() {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const token = params.get('token');
  const remember = params.get('remember') !== '0';
  const q = useQuery({
    queryKey: ['magic-link', token], enabled: !!token, retry: false, staleTime: Infinity,
    queryFn: async () => { await post('/auth/magic-link/verify', { token, remember }); await qc.invalidateQueries({ queryKey: ['me'] }); return true; },
  });
  useEffect(() => { if (q.isSuccess) router.replace('/discover'); }, [q.isSuccess, router]);
  const bad = q.isError || !token;
  return (
    <AuthShell title={t('auth.magicTitle')}>
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        {!bad && <p>{q.isSuccess ? t('auth.magicOk') : t('auth.magicVerifying')}</p>}
        {bad && <><XCircle className="size-12 text-danger-ink" aria-hidden /><p>{t('auth.magicBad')}</p><Link href="/login"><Button variant="outline">{t('nav.login')}</Button></Link></>}
      </div>
    </AuthShell>
  );
}
export default function MagicLinkPage() { return <Suspense><MagicLink /></Suspense>; }
