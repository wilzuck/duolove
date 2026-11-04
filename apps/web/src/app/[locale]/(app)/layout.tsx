'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MailWarning } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Skeleton, Textarea } from '@duomatch/ui';
import { AppShell } from '@/components/app/AppShell';
import { MatchOverlay } from '@/components/app/MatchOverlay';
import { useApiError } from '@/hooks/useApiError';
import { useMe, keys } from '@/hooks/useQueries';
import { useRealtime } from '@/hooks/useRealtime';
import { usePathname, useRouter } from '@/i18n/navigation';
import { ApiError, api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

function VerifyBanner({ email }: { email: string }) {
  const t = useTranslations();
  const toast = useUi((s) => s.toast);
  const err = useApiError();
  const send = useMutation({ mutationFn: () => post('/auth/resend-verification'), onSuccess: () => toast('success', t('app.verifySent')), onError: (e) => toast('error', err(e)) });
  // Aide de développement : ouvre le dernier e-mail capturé (n'existe pas en production, l'endpoint répond 404).
  const dev = useMutation({
    mutationFn: async () => {
      const box = await api<{ to: string; text: string }[]>('/dev/outbox');
      const link = [...box].reverse().map((m) => /(\S*verify-email\?token=\S+)/.exec(m.text)?.[1]).find(Boolean);
      if (link) window.location.href = link;
    },
  });
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-3 bg-gold/20 px-4 py-2.5 text-sm">
      <MailWarning className="size-4 shrink-0" aria-hidden /><span>{t('app.verifyBanner', { email })}</span>
      <button className="font-semibold underline" onClick={() => send.mutate()} disabled={send.isPending}>{t('app.verifyResend')}</button>
      {process.env.NODE_ENV !== 'production' && <button className="text-xs text-muted underline" onClick={() => dev.mutate()}>{t('app.verifyDev')}</button>}
    </div>
  );
}

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
  const { data: me, error, isLoading } = useMe();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [error, path, router]);
  useEffect(() => {
    // L'équipe de modération accède à /admin sans passer par l'onboarding de rencontre.
    const staffOnAdmin = me && me.role !== 'USER' && path.startsWith('/admin');
    if (me && me.status === 'ACTIVE' && me.profile && !me.profile.onboarded && path !== '/onboarding' && !staffOnAdmin) router.replace('/onboarding');
  }, [me, path, router]);
  useRealtime(!!me && me.status === 'ACTIVE');

  if (isLoading || !me) {
    return <div className="mx-auto max-w-md space-y-4 p-6"><Skeleton className="h-14" /><Skeleton className="h-96" /><Skeleton className="h-14" /></div>;
  }
  if (me.status === 'SUSPENDED') return <Suspended moderation={me.moderation} />;
  return (
    <AppShell me={me} banner={!me.emailVerified ? <VerifyBanner email={me.email} /> : undefined}>
      {children}
      <MatchOverlay />
    </AppShell>
  );
}
