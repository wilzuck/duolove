'use client';
import { usePush } from '@/hooks/usePush';
import { TwoFactorCard } from '@/components/app/TwoFactorCard';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileDown, LogOut, MapPin, Monitor, Receipt, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { usePay } from '@/hooks/usePay';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Badge, Button, buttonVariants, Card, cn, Dialog, EmptyState, Field, Skeleton, Switch } from '@duomatch/ui';
import { PasswordInput } from '@/components/PasswordInput';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useApiError } from '@/hooks/useApiError';
import { keys, useMe, useMyProfile, useSubscription } from '@/hooks/useQueries';
import { RhythmCard } from '@/components/app/RhythmCard';
import { Link, useRouter } from '@/i18n/navigation';
import { api, del, patch, post, put } from '@/lib/api';
import { formatDate, formatXof, timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { PaymentItem } from '@/lib/types';
import { resetTours } from '@/components/app/GuidedTour';

const TABS = ['account', 'notifications', 'privacy', 'security', 'blocked', 'subscription', 'payments'] as const;
type Tab = (typeof TABS)[number];
const NOTIF = [['inAppLikes', 'likes'], ['inAppMatches', 'matches'], ['inAppMessages', 'messages'], ['emailLikes', 'likes'], ['emailMatches', 'matches'], ['emailMessages', 'messages']] as const;

function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="font-semibold">{title}</p>{text && <p className="text-sm text-muted">{text}</p>}</div>{children}</div>;
}

/** Notifications push de cet appareil : interrupteur + essai ; explique clairement pourquoi c'est indisponible (navigateur, iPhone non installé, permission refusée, serveur pas prêt). */
function PushRow() {
  const t = useTranslations();
  const toast = useUi((s) => s.toast);
  const push = usePush();
  const on = push.state === 'on';
  const hint = push.state === 'unsupported' ? t('settings.notif.pushUnsupported') : push.state === 'ios-install' ? t('settings.notif.pushIos') : push.state === 'denied' ? t('settings.notif.pushDenied') : null;
  return (
    <Row title={t('settings.notif.push')} text={hint ?? t('settings.notif.pushText')}>
      {push.state === 'loading' ? <Skeleton className="h-6 w-11" /> : push.state === 'not-ready' ? <Badge tone="neutral">{t('common.soon')}</Badge> : (
        <div className="flex items-center gap-3">
          {on && <Button size="sm" variant="outline" loading={push.test.isPending} onClick={() => push.test.mutate(undefined, { onSuccess: (r) => toast(r.sent ? 'success' : 'error', t(r.sent ? 'settings.notif.pushTested' : 'settings.notif.pushTestFailed')) })}>{t('settings.notif.pushTest')}</Button>}
          <Switch checked={on} disabled={push.enable.isPending || push.disable.isPending || push.state === 'unsupported' || push.state === 'ios-install' || push.state === 'denied'} label={t('settings.notif.push')}
            onChange={(v) => (v ? push.enable.mutate(undefined, { onError: (e) => toast('error', e instanceof Error && e.message === 'denied' ? t('settings.notif.pushDenied') : t('settings.notif.pushError')) }) : push.disable.mutate())} />
        </div>
      )}
    </Row>
  );
}

function NotificationsTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notif-prefs'], queryFn: () => api<Record<string, boolean>>('/notifications/preferences') });
  const m = useMutation({ mutationFn: (b: Record<string, boolean>) => put<Record<string, boolean>>('/notifications/preferences', b), onSuccess: (d) => qc.setQueryData(['notif-prefs'], d) });
  const nl = useQuery({ queryKey: ['newsletter', 'me'], queryFn: () => api<{ subscribed: boolean }>('/newsletter/me') });
  const setNl = useMutation({ mutationFn: (subscribed: boolean) => put<{ subscribed: boolean }>('/newsletter/me', { subscribed }), onSuccess: (d) => qc.setQueryData(['newsletter', 'me'], d) });
  if (!q.data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-8">
    <Card className="divide-y divide-line px-5">
      {NOTIF.map(([k, kind]) => <Row key={k} title={t(`settings.notif.${kind}`)} text={t(k.startsWith('email') ? 'settings.notif.byEmail' : 'settings.notif.inApp')}><Switch checked={!!q.data[k]} onChange={(v) => m.mutate({ [k]: v })} label={`${t(`settings.notif.${kind}`)} — ${t(k.startsWith('email') ? 'settings.notif.byEmail' : 'settings.notif.inApp')}`} /></Row>)}
      <Row title={t('settings.notif.weekly')} text={t('settings.notif.weeklyText')}><Switch checked={q.data.emailWeekly !== false} onChange={(v) => m.mutate({ emailWeekly: v })} label={t('settings.notif.weekly')} /></Row>
      <Row title={t('settings.notif.newProfiles')} text={t('settings.notif.newProfilesText')}><Switch checked={q.data.emailNewProfiles !== false} onChange={(v) => m.mutate({ emailNewProfiles: v })} label={t('settings.notif.newProfiles')} /></Row>
      <Row title={t('settings.notif.newsletter')} text={t('settings.notif.newsletterText')}><Switch checked={!!nl.data?.subscribed} disabled={!nl.data || setNl.isPending} onChange={(v) => setNl.mutate(v)} label={t('settings.notif.newsletter')} /></Row>
      <PushRow />
    </Card>
    <section aria-labelledby="rhythm-t"><h2 id="rhythm-t" className="mb-3 text-xl font-extrabold">{t('rhythm.title')}</h2><RhythmCard /></section>
    </div>
  );
}

function PrivacyTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const router = useRouter();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: me } = useMe();
  const { data: p } = useMyProfile();
  const [confirm, setConfirm] = useState(false);
  const [pw, setPw] = useState('');
  const set = useMutation({ mutationFn: (b: Record<string, unknown>) => patch('/profiles/me/settings', b), onSuccess: () => qc.invalidateQueries({ queryKey: keys.profile }), onError: (e) => toast('error', err(e)) });
  const consent = useMutation({ mutationFn: (v: boolean) => post('/users/me/consents', { marketingConsent: v }), onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }) });
  const geo = useMutation({
    mutationFn: () => new Promise<void>((res, rej) => navigator.geolocation.getCurrentPosition((pos) => put('/profiles/me/location', { lat: pos.coords.latitude, lng: pos.coords.longitude }).then(() => res(), rej), rej)),
    onSuccess: () => toast('success', t('settings.privacy.locationSaved')), onError: () => toast('error', t('settings.privacy.locationDenied')),
  });
  const clearGeo = useMutation({ mutationFn: () => del('/profiles/me/location'), onSuccess: () => toast('info', t('settings.privacy.locationCleared')) });
  const exportData = async () => { const d = await api<unknown>('/users/me/export'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'crushduo-export.json'; a.click(); URL.revokeObjectURL(a.href); };
  const remove = useMutation({ mutationFn: () => del('/users/me', { confirm: 'DELETE', password: pw || undefined }), onSuccess: () => { qc.clear(); router.replace('/'); }, onError: (e) => toast('error', err(e)) });
  if (!p || !me) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-5">
      <Card className="divide-y divide-line px-5">
        <Row title={t('settings.privacy.visible')} text={t('settings.privacy.visibleText')}><Switch checked={p.visibility === 'VISIBLE'} onChange={(v) => set.mutate({ visibility: v ? 'VISIBLE' : 'HIDDEN' })} label={t('settings.privacy.visible')} /></Row>
        <Row title={t('settings.privacy.receipts')} text={p.readReceiptsLocked ? t('settings.privacy.receiptsLocked') : t('settings.privacy.receiptsText')}>
          <span className="flex items-center gap-3">{p.readReceiptsLocked && <Link href="/premium" className="text-sm font-semibold text-brand-ink underline">{t('settings.privacy.receiptsUpgrade')}</Link>}
            <Switch checked={p.readReceipts} disabled={p.readReceiptsLocked} onChange={(v) => set.mutate({ readReceipts: v })} label={t('settings.privacy.receipts')} /></span></Row>
        <Row title={t('settings.privacy.typing')} text={t('settings.privacy.typingText')}><Switch checked={p.typingIndicator} onChange={(v) => set.mutate({ typingIndicator: v })} label={t('settings.privacy.typing')} /></Row>
        <Row title={t('settings.privacy.activity')} text={t('settings.privacy.activityText')}><Switch checked={p.showActivity} onChange={(v) => set.mutate({ showActivity: v })} label={t('settings.privacy.activity')} /></Row>
        <Row title={t('settings.privacy.incognito')} text={me.entitlement.limits.incognito ? t('settings.privacy.incognitoText') : t('settings.privacy.incognitoLocked')}><Switch checked={p.incognito} disabled={!me.entitlement.limits.incognito} onChange={(v) => set.mutate({ incognito: v })} label={t('settings.privacy.incognito')} /></Row>
        <Row title={t('settings.privacy.marketing')} text={t('settings.privacy.marketingText')}><Switch checked={me.marketingConsent} onChange={(v) => consent.mutate(v)} label={t('settings.privacy.marketing')} /></Row>
      </Card>
      <Card className="space-y-3 p-5"><h3 className="flex items-center gap-2 font-bold"><MapPin className="size-5 text-brand" aria-hidden />{t('settings.privacy.location')}</h3><p className="text-sm text-muted">{t('settings.privacy.locationText')}</p>
        <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => geo.mutate()} loading={geo.isPending}>{t('settings.privacy.locationShare')}</Button><Button variant="ghost" size="sm" onClick={() => clearGeo.mutate()}>{t('settings.privacy.locationClear')}</Button></div>
      </Card>
      <Card className="space-y-3 p-5"><h3 className="flex items-center gap-2 font-bold"><Download className="size-5 text-brand" aria-hidden />{t('settings.privacy.export')}</h3><p className="text-sm text-muted">{t('settings.privacy.exportText')}</p><Button variant="outline" size="sm" onClick={exportData}>{t('settings.privacy.exportCta')}</Button></Card>
      <Card className="space-y-3 border-danger/40 p-5"><h3 className="flex items-center gap-2 font-bold text-danger-ink"><Trash2 className="size-5" aria-hidden />{t('settings.privacy.delete')}</h3><p className="text-sm text-muted">{t('settings.privacy.deleteText')}</p><Button variant="danger" size="sm" onClick={() => setConfirm(true)}>{t('settings.privacy.deleteCta')}</Button></Card>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('settings.privacy.deleteConfirmTitle')} closeLabel={t('common.close')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); remove.mutate(); }}>
          <p className="text-sm text-muted">{t('settings.privacy.deleteConfirmText')}</p>
          <Field label={t('auth.password')}>{(pr) => <PasswordInput {...pr} autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)}>{t('common.cancel')}</Button><Button type="submit" variant="danger" loading={remove.isPending}>{t('settings.privacy.deleteFinal')}</Button></div>
        </form>
      </Dialog>
    </div>
  );
}

function SecurityTab() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: () => api<{ id: string; userAgent: string | null; lastUsedAt: string; current: boolean }[]>('/auth/sessions') });
  const change = useMutation({ mutationFn: () => post('/auth/change-password', { current: cur, next }), onSuccess: () => { setCur(''); setNext(''); toast('success', t('settings.security.changed')); void qc.invalidateQueries({ queryKey: ['sessions'] }); }, onError: (e) => toast('error', err(e)) });
  const revoke = useMutation({ mutationFn: (id: string) => del(`/auth/sessions/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }) });
  const label = (ua: string | null) => (ua ? (/Mobile|Android|iPhone/i.test(ua) ? t('settings.security.mobile') : t('settings.security.computer')) + (/Chrome/.test(ua) ? ' · Chrome' : /Safari/.test(ua) ? ' · Safari' : /Firefox/.test(ua) ? ' · Firefox' : '') : t('settings.security.unknown'));
  return (
    <div className="space-y-5">
      <TwoFactorCard />
      <Card className="p-5"><h3 className="mb-4 font-bold">{t('settings.security.password')}</h3>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
          <Field label={t('settings.security.current')}>{(p) => <PasswordInput {...p} autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />}</Field>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>{(p) => <PasswordInput {...p} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />}</Field>
          <Button type="submit" loading={change.isPending}>{t('settings.security.update')}</Button>
        </form>
      </Card>
      <Card className="p-5"><h3 className="mb-1 font-bold">{t('settings.security.sessions')}</h3><p className="mb-3 text-sm text-muted">{t('settings.security.sessionsText')}</p>
        <ul className="divide-y divide-line">{sessions.data?.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3"><Monitor className="size-5 text-muted" aria-hidden /><div className="min-w-0 flex-1"><p className="font-medium">{label(s.userAgent)}{s.current && <Badge tone="success" className="ml-2">{t('settings.security.thisDevice')}</Badge>}</p><p className="text-xs text-muted">{t('settings.security.lastUsed', { when: timeAgo(s.lastUsedAt, locale) })}</p></div>
            {!s.current && <Button variant="outline" size="sm" onClick={() => revoke.mutate(s.id)}>{t('settings.security.revoke')}</Button>}</li>
        ))}</ul>
      </Card>
    </div>
  );
}

function BlockedTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['blocks'], queryFn: () => api<{ userId: string; displayName: string }[]>('/blocks') });
  const un = useMutation({ mutationFn: (id: string) => del(`/blocks/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }) });
  if (!q.data) return <Skeleton className="h-40" />;
  if (!q.data.length) return <EmptyState icon={<ShieldCheck className="size-8" aria-hidden />} title={t('settings.blocked.empty')} />;
  return <Card className="divide-y divide-line px-5">{q.data.map((b) => <Row key={b.userId} title={b.displayName}><Button variant="outline" size="sm" onClick={() => un.mutate(b.userId)}>{t('settings.blocked.unblock')}</Button></Row>)}</Card>;
}

function SubscriptionTab() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const { data } = useSubscription();
  const cancel = useMutation({ mutationFn: () => post('/subscriptions/cancel'), onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }) });
  const resume = useMutation({ mutationFn: () => post('/subscriptions/resume'), onSuccess: () => qc.invalidateQueries({ queryKey: ['subscription'] }) });
  if (!data) return <Skeleton className="h-40" />;
  const s = data.subscription;
  return (
    <Card className="space-y-4 p-5">
      <div className="flex items-center gap-3"><h3 className="text-xl font-bold">{t(`plans.${data.plan}.name`)}</h3><Badge tone={data.plan === 'FREE' ? 'neutral' : 'success'}>{s ? t(`settings.sub.status.${s.status}`) : t('settings.sub.status.FREE')}</Badge></div>
      {data.validUntil && <p className="text-muted">{s?.cancelAtPeriodEnd ? t('premium.endsOn', { date: formatDate(data.validUntil, locale) }) : t('premium.renewsOn', { date: formatDate(data.validUntil, locale) })}</p>}
      <div className="flex flex-wrap gap-2">
        <Link href="/premium"><Button>{data.plan === 'FREE' ? t('app.goPremium') : t('settings.sub.change')}</Button></Link>
        {s?.status === 'ACTIVE' && !s.cancelAtPeriodEnd && <Button variant="outline" onClick={() => cancel.mutate()} loading={cancel.isPending}>{t('settings.sub.cancel')}</Button>}
        {s?.cancelAtPeriodEnd && <Button variant="secondary" onClick={() => resume.mutate()} loading={resume.isPending}>{t('premium.resume')}</Button>}
      </div>
      <p className="text-sm text-muted">{t('settings.sub.cancelNote')}</p>
    </Card>
  );
}

function PaymentsTab() {
  const t = useTranslations();
  const locale = useLocale();
  const status = useSearchParams().get('status');
  const q = useQuery({ queryKey: keys.payments, queryFn: () => api<PaymentItem[]>('/payments') });
  const { pay, pending } = usePay();
  // « Relancer » : seulement sur le paiement le plus récent, s'il n'a pas abouti ; même formule ou même produit, montant recalculé par le serveur.
  const retryBody = (p: PaymentItem) => p.kind === 'PRODUCT' ? (p.productCode ? { type: 'product' as const, code: p.productCode } : null)
    : p.plan && p.plan !== 'FREE' ? { type: 'subscription' as const, plan: p.plan, months: p.months } : null;
  const last = q.data?.[0];
  const retry = last && (last.status === 'FAILED' || last.status === 'PENDING') ? retryBody(last) : null;
  return (
    <div className="space-y-4">
      {status === 'success' && <p role="status" className="rounded-2xl bg-success/15 p-4 text-sm font-medium">{t('settings.pay.success')}</p>}
      {status === 'fail' && <Alert className="font-medium">{t('settings.pay.failed')}</Alert>}
      {!q.data ? <Skeleton className="h-40" /> : q.data.length === 0 ? <EmptyState icon={<Receipt className="size-8" aria-hidden />} title={t('settings.pay.empty')} /> : (
        <Card className="divide-y divide-line px-5">{q.data.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 py-4"><div><p className="font-semibold">{p.kind === 'PRODUCT' ? p.product : p.plan ? `${t(`plans.${p.plan}.name`)} · ${p.months === 0 ? t('plans.week') : t('plans.months', { n: p.months })}` : '—'} · {formatXof(p.amountXof, locale)}</p><p className="text-xs text-muted">{formatDate(p.createdAt, locale)} · {p.provider}</p></div>
            <div className="flex flex-wrap items-center justify-end gap-2"><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{t(`settings.pay.status.${p.status}`)}</Badge>{retry && p.id === last?.id && <Button size="sm" onClick={() => pay({ key: `retry-${p.id}`, body: retry })} loading={pending}><RotateCcw className="size-4" aria-hidden />{t('settings.pay.retry')}</Button>}{p.invoiceNumber && <a href={`/api/payments/${p.id}/invoice.pdf`} download className={buttonVariants({ variant: 'outline', size: 'sm' })} aria-label={t('settings.pay.invoiceDownload', { n: p.invoiceNumber })}><FileDown className="size-4" aria-hidden />{t('settings.pay.invoice')}</a>}</div></div>
        ))}</Card>
      )}
    </div>
  );
}

function Content() {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'account';
  const { data: me } = useMe();
  const toast = useUi((s) => s.toast);
  const logout = useMutation({ mutationFn: () => post('/auth/logout'), onSuccess: () => { qc.clear(); router.replace('/'); } });
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-4">
      <h1 className="text-2xl font-extrabold">{t('app.nav.settings')}</h1>
      <nav aria-label={t('app.nav.settings')} className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((k) => <Link key={k} href={`/settings?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={cn('shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition', tab === k ? 'bg-brand-strong text-white' : 'bg-soft text-brand-ink hover:bg-brand/15')}>{t(`settings.tabs.${k}`)}</Link>)}
      </nav>
      {tab === 'account' && me && (
        <div className="space-y-5">
          <Card className="divide-y divide-line px-5">
            <Row title={t('auth.email')} text={me.email}>{me.emailVerified ? <Badge tone="success">{t('settings.account.verified')}</Badge> : <Badge tone="gold">{t('settings.account.unverified')}</Badge>}</Row>
            <Row title={t('common.language')}><LocaleSwitcher /></Row>
            <Row title={t('settings.account.theme')}><ThemeToggle className="rounded-full border border-line p-2.5 hover:bg-soft" /></Row>
            <Row title={t('tour.replay')} text={t('tour.replayText')}><Button variant="outline" size="sm" onClick={async () => { await resetTours(); await qc.invalidateQueries({ queryKey: keys.me }); toast('success', t('tour.replayDone')); }}>{t('tour.replayCta')}</Button></Row>
          </Card>
          {me.role !== 'USER' && (
            <Link href="/admin" className="flex items-center gap-3 rounded-3xl border border-line bg-card p-4 font-semibold shadow-soft transition hover:bg-soft">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white"><ShieldCheck className="size-5" aria-hidden /></span>
              <span className="min-w-0 flex-1">{t('app.nav.admin')}<span className="block text-sm font-normal text-muted">{t('settings.account.adminText')}</span></span>
            </Link>
          )}
          <Button variant="outline" onClick={() => logout.mutate()} loading={logout.isPending}><LogOut className="size-4" aria-hidden />{t('settings.account.logout')}</Button>
        </div>
      )}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'blocked' && <BlockedTab />}
      {tab === 'subscription' && <SubscriptionTab />}
      {tab === 'payments' && <PaymentsTab />}
    </div>
  );
}
export default function SettingsPage() { return <Suspense><Content /></Suspense>; }
