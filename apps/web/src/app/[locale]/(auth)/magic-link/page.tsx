'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { TwoFactorStep } from '@/components/auth/TwoFactorStep';
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
    queryFn: async () => {
      const r = await post<{ twoFactor?: boolean; challenge?: string }>('/auth/magic-link/verify', { token, remember });
      if (r.twoFactor && r.challenge) return { challenge: r.challenge };  // le lien prouve la boîte e-mail : le code de l'application est encore demandé
      await qc.invalidateQueries({ queryKey: ['me'] });
      return { challenge: null };
    },
  });
  const challenge = q.data?.challenge ?? null;
  const [finished, setFinished] = useState(false);
  useEffect(() => { if ((q.isSuccess && !challenge) || finished) router.replace('/discover'); }, [q.isSuccess, challenge, finished, router]);
  const bad = q.isError || !token;
  return (
    <AuthShell title={t('auth.magicTitle')}>
      <div role="status" className="flex flex-col items-center gap-4 text-center">
        {!bad && challenge && <div className="w-full text-left"><TwoFactorStep challenge={challenge} remember={remember} onDone={async () => { await qc.invalidateQueries(); setFinished(true); }} /></div>}
        {!bad && !challenge && <p>{q.isSuccess ? t('auth.magicOk') : t('auth.magicVerifying')}</p>}
        {bad && <><XCircle className="size-12 text-danger-ink" aria-hidden /><p>{t('auth.magicBad')}</p><Link href="/login"><Button variant="outline">{t('nav.login')}</Button></Link></>}
      </div>
    </AuthShell>
  );
}
export default function MagicLinkPage() { return <Suspense><MagicLink /></Suspense>; }
