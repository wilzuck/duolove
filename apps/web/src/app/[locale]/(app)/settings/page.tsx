'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, LogOut, MapPin, Monitor, Receipt, ShieldCheck, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Alert, Badge, Button, Card, cn, Dialog, EmptyState, Field, Input, Skeleton, Switch, Textarea } from '@duomatch/ui';
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

const TABS = ['account', 'notifications', 'privacy', 'security', 'blocked', 'subscription', 'payments'] as const;
type Tab = (typeof TABS)[number];
const NOTIF = [['inAppLikes', 'likes'], ['inAppMatches', 'matches'], ['inAppMessages', 'messages'], ['emailLikes', 'likes'], ['emailMatches', 'matches'], ['emailMessages', 'messages']] as const;

function Row({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><p className="font-semibold">{title}</p>{text && <p className="text-sm text-muted">{text}</p>}</div>{children}</div>;
}

function NotificationsTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notif-prefs'], queryFn: () => api<Record<string, boolean>>('/notifications/preferences') });
  const m = useMutation({ mutationFn: (b: Record<string, boolean>) => put<Record<string, boolean>>('/notifications/preferences', b), onSuccess: (d) => qc.setQueryData(['notif-prefs'], d) });
  if (!q.data) return <Skeleton className="h-64" />;
  return (
    <div className="space-y-8">
    <Card className="divide-y divide-line px-5">
      {NOTIF.map(([k, kind]) => <Row key={k} title={t(`settings.notif.${kind}`)} text={t(k.startsWith('email') ? 'settings.notif.byEmail' : 'settings.notif.inApp')}><Switch checked={!!q.data[k]} onChange={(v) => m.mutate({ [k]: v })} label={`${t(`settings.notif.${kind}`)} — ${t(k.startsWith('email') ? 'settings.notif.byEmail' : 'settings.notif.inApp')}`} /></Row>)}
      <Row title={t('settings.notif.push')} text={t('settings.notif.pushText')}><Badge tone="neutral">{t('common.soon')}</Badge></Row>
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
          <Field label={t('auth.password')}>{(pr) => <Input {...pr} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
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
      <Card className="p-5"><h3 className="mb-4 font-bold">{t('settings.security.password')}</h3>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
          <Field label={t('settings.security.current')}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required />}</Field>
          <Field label={t('auth.newPassword')} hint={t('auth.passwordHint')}>{(p) => <Input {...p} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />}</Field>
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
  const qc = useQueryClient();
  const q = useQuery({ queryKey: keys.payments, queryFn: () => api<PaymentItem[]>('/payments') });
  const toastP = useUi((s) => s.toast);
  const errP = useApiError();
  const [refundFor, setRefundFor] = useState<PaymentItem | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const askRefund = useMutation({
    mutationFn: () => post(`/payments/${refundFor!.id}/refund-request`, { reason: refundReason }),
    onSuccess: () => { toastP('success', t('settings.pay.refundSent')); setRefundFor(null); setRefundReason(''); void qc.invalidateQueries({ queryKey: keys.payments }); },
    onError: (e) => toastP('error', errP(e)),
  });
  const [invoice, setInvoice] = useState<{ number: string; issuedAt: string; customer: { name: string; email: string }; description: string; amountXof: number; currency: string } | null>(null);
  const open = useMutation({ mutationFn: (id: string) => api<NonNullable<typeof invoice>>(`/payments/${id}/invoice`), onSuccess: setInvoice });
  void qc;
  return (
    <div className="space-y-4">
      {status === 'success' && <p role="status" className="rounded-2xl bg-success/15 p-4 text-sm font-medium">{t('settings.pay.success')}</p>}
      {status === 'fail' && <Alert className="font-medium">{t('settings.pay.failed')}</Alert>}
      {!q.data ? <Skeleton className="h-40" /> : q.data.length === 0 ? <EmptyState icon={<Receipt className="size-8" aria-hidden />} title={t('settings.pay.empty')} /> : (
        <Card className="divide-y divide-line px-5">{q.data.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 py-4"><div><p className="font-semibold">{p.kind === 'PRODUCT' ? p.product : p.plan ? `${t(`plans.${p.plan}.name`)} · ${t('plans.months', { n: p.months })}` : '—'} · {formatXof(p.amountXof, locale)}</p><p className="text-xs text-muted">{formatDate(p.createdAt, locale)} · {p.provider}</p></div>
            <div className="flex items-center gap-2"><Badge tone={p.status === 'SUCCEEDED' ? 'success' : p.status === 'FAILED' ? 'danger' : 'neutral'}>{t(`settings.pay.status.${p.status}`)}</Badge>{p.refund && <Badge tone={p.refund === 'COMPLETED' ? 'success' : 'gold'}>{t(`settings.pay.refund.${p.refund}`)}</Badge>}{p.invoiceNumber && <Button variant="outline" size="sm" onClick={() => open.mutate(p.id)}>{t('settings.pay.invoice')}</Button>}{p.refundable && <Button variant="ghost" size="sm" onClick={() => setRefundFor(p)}>{t('settings.pay.askRefund')}</Button>}</div></div>
        ))}</Card>
      )}
      <Dialog open={!!refundFor} onClose={() => setRefundFor(null)} title={t('settings.pay.askRefund')} closeLabel={t('common.close')}>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); askRefund.mutate(); }}>
          <p className="text-sm text-muted">{t('settings.pay.refundText')}</p>
          <Field label={t('settings.pay.refundReason')}>{(pr) => <Textarea {...pr} required minLength={5} maxLength={500} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />}</Field>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setRefundFor(null)}>{t('common.cancel')}</Button><Button type="submit" loading={askRefund.isPending}>{t('settings.pay.refundSend')}</Button></div>
        </form>
      </Dialog>
      <Dialog open={!!invoice} onClose={() => setInvoice(null)} title={invoice ? t('settings.pay.invoiceTitle', { n: invoice.number }) : ''} closeLabel={t('common.close')}>
        {invoice && <div className="space-y-3 text-sm" id="invoice"><p>{formatDate(invoice.issuedAt, locale)}</p><p className="font-semibold">{invoice.customer.name} — {invoice.customer.email}</p><p>{invoice.description}</p><p className="text-lg font-extrabold">{formatXof(invoice.amountXof, locale)}</p><Button variant="outline" size="sm" onClick={() => window.print()}>{t('settings.pay.print')}</Button></div>}
      </Dialog>
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
          </Card>
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
