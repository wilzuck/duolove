'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Skeleton, Textarea } from '@duomatch/ui';
import { AppShell } from '@/components/app/AppShell';
import { MatchOverlay } from '@/components/app/MatchOverlay';
import { ServiceUnavailable } from '@/components/ServiceUnavailable';
import { useApiError } from '@/hooks/useApiError';
import { useMe, keys } from '@/hooks/useQueries';
import { useRealtime } from '@/hooks/useRealtime';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, post } from '@/lib/api';
import { MaintenanceScreen } from '@/components/MaintenanceScreen';

function Suspended({ moderation }: { moderation: NonNullable<ReturnType<typeof useMe>['data']>['moderation'] }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const [text, setText] = useState('');
  const m = useMutation({ mutationFn: () => post('/users/me/appeal', { text }), onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }) });
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-5 px-6 py-10">
      <AlertTriangle className="size-12 text-danger-ink" aria-hidden />
      <h1 className="text-3xl font-extrabold">{t('suspended.title')}</h1>
      {moderation && <p className="rounded-2xl bg-danger/10 p-4"><strong>{t('suspended.reason')}</strong> {moderation.reason}</p>}
      {moderation?.appealStatus === 'NONE' ? (
        <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-3">
          <label htmlFor="appeal" className="font-semibold">{t('suspended.appealLabel')}</label>
          <Textarea id="appeal" required minLength={10} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
          {m.isError && <Alert variant="text">{err(m.error)}</Alert>}
          <Button type="submit" loading={m.isPending}>{t('suspended.appealCta')}</Button>
        </form>
      ) : (
        <p role="status" className="rounded-2xl bg-soft p-4">{t(`suspended.appeal.${moderation?.appealStatus ?? 'PENDING'}`)}</p>
      )}
    </main>
  );
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { data: me, error, isLoading, refetch, isFetching } = useMe();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [error, path, router]);
  // Compte non confirmé : rien d'autre que la saisie du code reçu par e-mail (le serveur refuse aussi toute autre requête).
  useEffect(() => { if (me && me.status === 'ACTIVE' && !me.emailVerified) router.replace('/confirm-email'); }, [me, router]);
  useEffect(() => {
    // L'équipe de modération accède à /admin sans passer par l'onboarding de rencontre.
    const staffOnAdmin = me && me.role !== 'USER' && path.startsWith('/admin');
    if (me && me.status === 'ACTIVE' && me.emailVerified && me.profile && !me.profile.onboarded && path !== '/onboarding' && !staffOnAdmin) router.replace('/onboarding');
  }, [me, path, router]);
  useRealtime(!!me && me.status === 'ACTIVE');

  if (!me && error instanceof ApiError && error.code === 'MAINTENANCE') return <MaintenanceScreen onRetry={() => void refetch()} retrying={isFetching} />;
  // Serveur injoignable ou en erreur (pas une simple session expirée) : message et nouvelle tentative, jamais un chargement sans fin.
  if (!me && error && !(error instanceof ApiError && error.status < 500)) return <ServiceUnavailable onRetry={() => void refetch()} retrying={isFetching} />;
  if (isLoading || !me || (me.status === 'ACTIVE' && !me.emailVerified)) {
    return <div className="mx-auto max-w-md space-y-4 p-6"><Skeleton className="h-14" /><Skeleton className="h-96" /><Skeleton className="h-14" /></div>;
  }
  if (me.status === 'SUSPENDED') return <Suspended moderation={me.moderation} />;
  return (
    <AppShell me={me}>
      {children}
      <MatchOverlay />
    </AppShell>
  );
}
