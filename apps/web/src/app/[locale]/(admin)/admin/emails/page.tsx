'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, MailCheck, MailWarning, Percent, Send, ShieldOff, Unlock, UserPlus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, DataTableView, Field, Input, Skeleton, Switch, cn } from '@duomatch/ui';
import { KpiCard, type SeriesPoint } from '@/components/admin/DashboardParts';
import { PeriodPicker, periodQuery, type Period } from '@/components/admin/PeriodPicker';
import { PageHeader, StatusTabs } from '@/components/admin/PageParts';
import { LineChart } from '@/components/admin/StatsCharts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, del, post, put } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';

const KINDS = ['verification', 'password_reset', 'magic_link', 'notification', 'new_profiles', 'newsletter', 'newsletter_confirm', 'newsletter_test', 'other'] as const;
interface Row { id: string; to: string; subject: string; kind: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; provider: string; error: string | null; createdAt: string }
interface Stats {
  days: number; provider: 'brevo' | 'zeptomail' | 'smtp' | 'dev'; sent: number; failed: number; successRate: number | null; byKind: { kind: string; sent: number; failed: number }[];
  series: { sent: SeriesPoint[]; failed: SeriesPoint[] }; lastFailure: Row | null;
}
interface Blocked { id: string; email: string; reason: 'BOUNCE' | 'COMPLAINT'; detail: string | null; createdAt: string }
interface BlockedList { items: Blocked[]; totals: { BOUNCE: number; COMPLAINT: number } }
const PERIODS = [7, 30, 90] as const;


function Banner({ tone, title, children, onClose, closeLabel }: { tone: 'warning' | 'danger'; title: string; children?: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('relative rounded-2xl border px-4 py-3 text-sm', tone === 'danger' ? 'border-danger/30 bg-danger/10 text-danger-ink' : 'border-gold/40 bg-gold/10 text-gold-ink')}>
      {onClose && <button type="button" onClick={onClose} aria-label={closeLabel} title={closeLabel} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full hover:bg-black/10 focus-visible:outline focus-visible:outline-2"><X className="size-4" aria-hidden /></button>}
      <p className={cn('flex items-center gap-2 font-bold', onClose && 'pr-8')}><AlertTriangle className="size-4 shrink-0" aria-hidden />{title}</p>
      {children && <div className="mt-1">{children}</div>}
    </div>
  );
}

interface ProviderView { choice: 'auto' | 'brevo' | 'zeptomail' | 'smtp'; active: 'brevo' | 'zeptomail' | 'smtp' | 'dev'; configured: { brevo: boolean; zeptomail: boolean; smtp: boolean }; essentialOnly?: boolean }

/** Choix du fournisseur d'envoi. Les identifiants restent dans les variables du serveur ; ici on ne choisit que celui qui est actif. */
function ProviderCard() {
  const t = useTranslations();
  const err = useApiError();
  const toast = useUi((u) => u.toast);
  const qc = useQueryClient();
  const view = useQuery({ queryKey: ['admin', 'emails', 'provider'], queryFn: () => api<ProviderView>('/admin/emails/provider') });
  const [pick, setPick] = useState<ProviderView['choice'] | null>(null);
  const v = view.data;
  const value = pick ?? v?.choice ?? 'auto';
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'emails'] }); };
  const save = useMutation({ mutationFn: () => put<ProviderView>('/admin/emails/provider', { provider: value }), onSuccess: () => { setPick(null); toast('success', t('admin.em.provider.saved')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const test = useMutation({ mutationFn: () => post<{ ok: boolean; to: string }>('/admin/emails/provider/test'), onSuccess: (r) => { toast(r.ok ? 'success' : 'error', t(r.ok ? 'admin.em.provider.testOk' : 'admin.em.provider.testFail', { to: r.to })); refresh(); }, onError: (e) => toast('error', err(e)) });
  const essential = useMutation({ mutationFn: (enabled: boolean) => put<ProviderView>('/admin/emails/essential-only', { enabled }), onSuccess: (r) => { toast('success', t(r.essentialOnly ? 'admin.em.essential.on' : 'admin.em.essential.off')); refresh(); }, onError: (e) => toast('error', err(e)) });
  if (!v) return <Skeleton className="h-40" />;
  const options = [
    { key: 'auto' as const, label: t('admin.em.provider.auto'), ok: true },
    { key: 'brevo' as const, label: t('admin.em.provider.brevo'), ok: v.configured.brevo },
    { key: 'zeptomail' as const, label: t('admin.em.provider.zeptomail'), ok: !!v.configured.zeptomail },
    { key: 'smtp' as const, label: t('admin.em.provider.smtp'), ok: v.configured.smtp },
  ];
  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-bold">{t('admin.em.provider.title')}</h2>
        <p className="mt-1 text-sm text-muted">{t('admin.em.provider.text')}</p>
      </div>
      <div role="radiogroup" aria-label={t('admin.em.provider.title')} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((o) => (
          <label key={o.key} className={cn('flex cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-sm', value === o.key ? 'border-brand-strong bg-soft' : 'border-line', !o.ok && 'cursor-not-allowed opacity-60')}>
            <span className="flex items-center gap-2 font-semibold"><input type="radio" name="provider" className="accent-brand-strong" checked={value === o.key} disabled={!o.ok} onChange={() => setPick(o.key)} />{o.label}</span>
            {o.key !== 'auto' && <Badge tone={o.ok ? 'success' : 'neutral'}>{o.ok ? t('admin.em.provider.configured') : t('admin.em.provider.notConfigured')}</Badge>}
          </label>
        ))}
      </div>
      <p className="text-sm">{t('admin.em.provider.active', { name: v.active === 'brevo' ? 'Brevo' : v.active === 'zeptomail' ? 'ZeptoMail' : v.active === 'smtp' ? t('admin.em.provider.smtpShort') : t('admin.em.devProvider') })}</p>
      {v.choice !== 'auto' && v.choice !== v.active && <Banner tone="warning" title={t('admin.em.provider.fallback')} />}
      {value === 'smtp' && <p className="text-xs text-muted">{t('admin.em.provider.sesNote')}</p>}
      {value === 'zeptomail' && <p className="text-xs text-muted">{t('admin.em.provider.zeptoNote')}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={save.isPending} disabled={pick === null || pick === v.choice} onClick={() => save.mutate()}>{t('admin.em.provider.save')}</Button>
        <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}><Send className="size-4" aria-hidden />{t('admin.em.provider.test')}</Button>
        <span className="text-xs text-muted">{t('admin.em.provider.superOnly')}</span>
      </div>
      <div className={cn('flex items-start justify-between gap-4 rounded-2xl border p-4', v.essentialOnly ? 'border-gold bg-gold/10' : 'border-line')}>
        <div>
          <h3 className="font-semibold">{t('admin.em.essential.title')}</h3>
          <p className="mt-1 text-sm text-muted">{t('admin.em.essential.text')}</p>
          {v.essentialOnly && <p className="mt-2 text-sm font-semibold">{t('admin.em.essential.active')}</p>}
        </div>
        <Switch checked={!!v.essentialOnly} disabled={essential.isPending} onChange={(on) => essential.mutate(on)} label={t('admin.em.essential.title')} />
      </div>
    </Card>
  );
}

type NpUnit = 'day' | 'days' | 'months';
interface NpSetting { enabled: boolean; unit: NpUnit; every: number }
interface NpView { frequency: NpSetting; default: NpSetting; limits: Record<'days' | 'months', { min: number; max: number }>; subscribed: number; sent30d: number; minProfiles: number; maxProfiles: number }

/** E-mail automatique « De nouveaux profils pour vous » : désactivé par défaut, fréquence globale (une semaine par défaut). */
function NewProfilesCard() {
  const t = useTranslations();
  const locale = useLocale();
  const err = useApiError();
  const toast = useUi((u) => u.toast);
  const qc = useQueryClient();
  const view = useQuery({ queryKey: ['admin', 'emails', 'new-profiles'], queryFn: () => api<NpView>('/admin/emails/new-profiles') });
  const [draft, setDraft] = useState<NpSetting | null>(null);
  const save = useMutation({
    mutationFn: (b: NpSetting) => put<NpView>('/admin/emails/new-profiles', b),
    onSuccess: (r) => { setDraft(null); qc.setQueryData(['admin', 'emails', 'new-profiles'], r); toast('success', t(r.frequency.enabled ? 'admin.em.np.savedOn' : 'admin.em.np.savedOff')); },
    onError: (e) => toast('error', err(e)),
  });
  const v = view.data;
  if (!v) return <Skeleton className="h-40" />;
  const cur = draft ?? v.frequency;
  const lim = cur.unit === 'day' ? null : v.limits[cur.unit];
  const valid = !lim || (Number.isInteger(cur.every) && cur.every >= lim.min && cur.every <= lim.max);
  const dirty = !!draft && (draft.unit !== v.frequency.unit || draft.every !== v.frequency.every);
  const setUnit = (unit: NpUnit) => setDraft({ ...cur, unit, every: unit === 'day' ? 1 : unit === 'months' ? Math.min(Math.max(cur.every, 1), 12) : Math.min(Math.max(cur.every, 2), 30) });
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR');
  const units: { key: NpUnit; label: string }[] = [
    { key: 'day', label: t('admin.em.np.daily') }, { key: 'days', label: t('admin.em.np.everyDays') }, { key: 'months', label: t('admin.em.np.everyMonths') },
  ];
  return (
    <Card className="space-y-4 p-5">
      <div className={cn('flex items-start justify-between gap-4 rounded-2xl border p-4', v.frequency.enabled ? 'border-brand-strong bg-soft' : 'border-line')}>
        <div>
          <h2 className="flex items-center gap-2 font-bold"><UserPlus className="size-5" aria-hidden />{t('admin.em.np.title')}</h2>
          <p className="mt-1 text-sm text-muted">{t('admin.em.np.text', { min: v.minProfiles, max: v.maxProfiles })}</p>
          <p className="mt-2 text-sm font-semibold">{v.frequency.enabled ? t('admin.em.np.active') : t('admin.em.np.inactive')}</p>
          <p className="mt-1 text-xs text-muted">{t('admin.em.np.stats', { subscribed: nf.format(v.subscribed), sent: nf.format(v.sent30d) })}</p>
        </div>
        <Switch checked={v.frequency.enabled} disabled={save.isPending || !valid} onChange={(on) => save.mutate({ ...cur, enabled: on })} label={t('admin.em.np.enable')} />
      </div>
      <div>
        <h3 className="font-semibold">{t('admin.em.np.frequency')}</h3>
        <div role="radiogroup" aria-label={t('admin.em.np.frequency')} className="mt-2 grid gap-2 sm:grid-cols-3">
          {units.map((o) => (
            <label key={o.key} className={cn('flex cursor-pointer items-center gap-2 rounded-2xl border p-3 text-sm font-semibold', cur.unit === o.key ? 'border-brand-strong bg-soft' : 'border-line')}>
              <input type="radio" name="np-unit" className="accent-brand-strong" checked={cur.unit === o.key} onChange={() => setUnit(o.key)} />{o.label}
            </label>
          ))}
        </div>
        {lim && (
          <div className="mt-3 max-w-xs">
            <Field label={t(cur.unit === 'days' ? 'admin.em.np.daysLabel' : 'admin.em.np.monthsLabel')} hint={`${lim.min} – ${lim.max}`} error={valid ? undefined : t('admin.em.np.range', { min: lim.min, max: lim.max })}>
              {(p) => <Input {...p} type="number" min={lim.min} max={lim.max} value={Number.isNaN(cur.every) ? '' : cur.every} onChange={(e) => setDraft({ ...cur, every: e.target.value === '' ? Number.NaN : Number(e.target.value) })} />}
            </Field>
          </div>
        )}
      </div>
      {cur.unit === 'day' && <Banner tone="warning" title={t('admin.em.np.dailyWarnTitle')}>{t('admin.em.np.dailyWarn')}</Banner>}
      <p className="text-xs text-muted">{t('admin.em.np.rules')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" loading={save.isPending} disabled={!dirty || !valid} onClick={() => save.mutate(cur)}>{t('admin.em.np.save')}</Button>
        {dirty && <Button size="sm" variant="secondary" onClick={() => setDraft(null)}>{t('admin.em.np.cancel')}</Button>}
      </div>
    </Card>
  );
}

export default function AdminEmails() {
  const t = useTranslations();
  const locale = useLocale();
  const labels = useTableLabels();
  const [period, setPeriod] = useState<Period>({ days: 30 });
  const err = useApiError();
  const toast = useUi((u) => u.toast);
  const qc = useQueryClient();
  const [hiddenFail, setHiddenFail] = useState<string | null>(null);
  const [status, setStatus] = useState<'ALL' | 'SENT' | 'FAILED' | 'SKIPPED'>('ALL');
  const blocked = useQuery({ queryKey: ['admin', 'emails', 'suppressions'], queryFn: () => api<BlockedList>('/admin/emails/suppressions') });
  const unblock = useMutation({ mutationFn: (id: string) => del(`/admin/emails/suppressions/${id}`), onSuccess: () => { toast('success', t('admin.em.unblocked')); void qc.invalidateQueries({ queryKey: ['admin', 'emails'] }); }, onError: (e) => toast('error', err(e)) });
  const stats = useQuery({ queryKey: ['admin', 'emails', 'stats', period], queryFn: () => api<Stats>(`/admin/emails/stats?${periodQuery(period)}`), placeholderData: keepPreviousData, refetchInterval: 60_000 });
  const list = useAdminList<Row>(['emails', status], `/admin/emails${status === 'ALL' ? '' : `?status=${status}`}`);
  const s = stats.data;
  const nf = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR');
  const providerName = (p: string) => (p === 'brevo' ? 'Brevo' : p === 'zeptomail' ? 'ZeptoMail' : p === 'ses' ? 'Amazon SES' : p === 'smtp' ? 'SMTP' : t('admin.em.devProvider'));
  const kindName = (k: string) => t(`admin.em.kinds.${(KINDS as readonly string[]).includes(k) ? k : 'other'}` as never);
  return (
    <div className="space-y-6">
      <PageHeader title={t('admin.nav.emails')} description={t('admin.pageDesc.emails')}>
        <PeriodPicker presets={PERIODS} label={(p) => t(`admin.dash.p${p}`)} value={period} onChange={setPeriod} />
      </PageHeader>
      <ProviderCard />
      <NewProfilesCard />
      {s?.provider === 'dev' && <Banner tone="warning" title={t('admin.em.noProviderTitle')}>{t('admin.em.noProvider')}</Banner>}
      {!s ? <Skeleton className="h-32" /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <KpiCard label={t('admin.em.sent')} value={nf.format(s.sent)} icon={<MailCheck className="size-5" />} series={s.series.sent} hint={t('admin.em.providerHint', { name: s.provider === 'brevo' ? 'Brevo' : s.provider === 'zeptomail' ? 'ZeptoMail' : s.provider === 'smtp' ? 'SMTP' : t('admin.em.devProvider') })} />
            <KpiCard label={t('admin.em.failed')} value={nf.format(s.failed)} icon={<MailWarning className="size-5" />} series={s.series.failed} hint={t('admin.em.failedHint')} />
            <KpiCard label={t('admin.em.rate')} value={s.successRate == null ? t('admin.eng.m.none') : `${nf.format(s.successRate)} %`} icon={<Percent className="size-5" />} hint={t('admin.em.rateHint')} />
          </section>
          {s.lastFailure && s.lastFailure.id !== hiddenFail && (
            <Banner tone="danger" closeLabel={t('admin.em.dismiss')} onClose={() => setHiddenFail(s.lastFailure?.id ?? null)} title={t('admin.em.lastFailure', { when: timeAgo(s.lastFailure.createdAt, locale) })}>
              <span className="block"><span className="font-semibold">{kindName(s.lastFailure.kind)}</span> · {s.lastFailure.to}</span>
              <span className="mt-1 block break-words font-mono text-xs">{s.lastFailure.error ?? t('admin.em.noError')}</span>
            </Banner>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <LineChart title={t('admin.em.chart')} locale={locale} format={(v) => nf.format(v)} lines={[{ key: 'sent', label: t('admin.em.sent'), points: s.series.sent, color: 'text-brand-strong' }, { key: 'failed', label: t('admin.em.failed'), points: s.series.failed, color: 'text-amber-500' }]} />
            <Card className="space-y-3 p-5">
              <h3 className="font-bold">{t('admin.em.byKind')}</h3>
              {s.byKind.length === 0 ? <p className="text-sm text-muted">{t('admin.dash.noData')}</p> : (
                <ul className="divide-y divide-line text-sm">
                  {s.byKind.map((k) => <li key={k.kind} className="flex items-center justify-between gap-3 py-2"><span>{kindName(k.kind)}</span><span className="text-muted"><span className="font-bold text-fg">{nf.format(k.sent)}</span> {t('admin.em.sentShort')}{k.failed > 0 && <span className="ml-2 font-semibold text-danger-ink">{t('admin.nl.failedN', { n: k.failed })}</span>}</span></li>)}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
      <section className="space-y-3">
        <StatusTabs label={t('admin.status')} value={status} onChange={setStatus} options={[{ key: 'ALL', label: t('admin.em.all') }, { key: 'SENT', label: t('admin.em.statuses.SENT') }, { key: 'FAILED', label: t('admin.em.statuses.FAILED') }, { key: 'SKIPPED', label: t('admin.em.statuses.SKIPPED') }]} />
        {list.isLoading ? <Skeleton className="h-40" /> : (
          <DataTableView
            minWidth="52rem" rows={list.items} rowKey={(r) => r.id} empty={t('admin.em.empty')} labels={labels} exportName="emails-envoyes" selectable
            hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
            columns={[
              { key: 'to', header: t('admin.em.to'), value: (r) => r.to, filter: 'text', cell: (r) => r.to },
              { key: 'subject', header: t('admin.em.subject'), value: (r) => r.subject, cellClassName: 'max-w-xs truncate', cell: (r) => r.subject },
              { key: 'kind', header: t('admin.em.kind'), value: (r) => r.kind, filter: { options: KINDS.map((k) => ({ value: k, label: kindName(k) })) }, cell: (r) => <Badge tone="neutral">{kindName(r.kind)}</Badge> },
              { key: 'provider', header: t('admin.em.providerCol'), value: (r) => r.provider, filter: { options: [{ value: 'brevo', label: 'Brevo' }, { value: 'zeptomail', label: 'ZeptoMail' }, { value: 'ses', label: 'Amazon SES' }, { value: 'smtp', label: 'SMTP' }, { value: 'dev', label: t('admin.em.devProvider') }] }, cell: (r) => <Badge tone={r.provider === 'brevo' ? 'brand' : 'neutral'}>{providerName(r.provider)}</Badge> },
              { key: 'status', header: t('admin.status'), value: (r) => r.status, cell: (r) => r.status === 'SENT' ? <Badge tone="success">{t('admin.em.statuses.SENT')}</Badge> : r.status === 'SKIPPED' ? <span><Badge tone="neutral"><ShieldOff className="size-3" aria-hidden />{t('admin.em.statuses.SKIPPED')}</Badge>{r.error && <span className="mt-1 block max-w-xs break-words text-xs text-muted">{r.error}</span>}</span> : <span><Badge tone="danger"><AlertTriangle className="size-3" aria-hidden />{t('admin.em.statuses.FAILED')}</Badge>{r.error && <span className="mt-1 block max-w-xs break-words text-xs text-muted">{r.error}</span>}</span> },
              { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (r) => r.createdAt, cellClassName: 'text-muted', cell: (r) => timeAgo(r.createdAt, locale) },
            ]}
          />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-bold"><ShieldOff className="size-5 text-muted" aria-hidden />{t('admin.em.blockedTitle')}</h2>
        <p className="text-sm text-muted">{t('admin.em.blockedText')}</p>
        {blocked.isLoading ? <Skeleton className="h-24" /> : (
          <Card className="p-0">
            <p className="border-b border-line px-5 py-3 text-sm"><span className="font-bold">{blocked.data?.totals.BOUNCE ?? 0}</span> {t('admin.em.bounces')} · <span className="font-bold">{blocked.data?.totals.COMPLAINT ?? 0}</span> {t('admin.em.complaints')}</p>
            {(blocked.data?.items.length ?? 0) === 0 ? <p className="px-5 py-6 text-sm text-muted">{t('admin.em.blockedEmpty')}</p> : (
              <ul className="divide-y divide-line text-sm">
                {blocked.data?.items.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <span className="min-w-0"><span className="block break-all font-semibold">{b.email}</span><span className="block text-xs text-muted">{b.detail ?? '—'} · {timeAgo(b.createdAt, locale)}</span></span>
                    <span className="flex items-center gap-2"><Badge tone={b.reason === 'BOUNCE' ? 'danger' : 'gold'}>{t(`admin.em.reasons.${b.reason}` as never)}</Badge>
                      <Button size="sm" variant="secondary" loading={unblock.isPending && unblock.variables === b.id} onClick={() => unblock.mutate(b.id)}><Unlock className="size-4" aria-hidden />{t('admin.em.unblock')}</Button></span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </section>
    </div>
  );
}
