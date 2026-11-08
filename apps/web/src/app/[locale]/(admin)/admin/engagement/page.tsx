'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { INTENTS, INTEREST_SLUGS } from '@duomatch/types';
import { Badge, Button, Card, CrudTable, Field, Input, Select, Skeleton, Switch, Tabs } from '@duomatch/ui';
import { PageLoader } from '@/components/PageLoader';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { Link } from '@/i18n/navigation';
import { api, del, patch, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { AdminDailyQuestion } from '@/lib/types';

type Weights = { intent: number; mutual: number; interests: number; location: number; other: number };
interface SettingsData { values: Record<string, number | Weights> & { 'matching.weights': Weights }; defaults: Record<string, number | Weights> & { 'matching.weights': Weights }; limits: Record<string, { min: number; max: number }> }
interface PromptRow { id: string; slug: string; textFr: string; textEn: string; active: boolean; sortOrder: number; answers: number }
interface IceRow { id: string; slug: string; kind: 'INTEREST' | 'INTENT' | 'GENERIC'; key: string | null; textFr: string; textEn: string; active: boolean; sortOrder: number }
interface Metrics {
  profilesCompleted: number; profilesWithPrompts: number; profilesWithPromptsRate: number | null; likes: number; likesWithComment: number; likesWithCommentRate: number | null;
  matches: number; matchRate: number | null; conversations: number; firstResponseRate: number | null; reciprocalConversations: number; reports: number; reportsOpen: number;
  retention: { d7: { cohort: number; rate: number | null }; d30: { cohort: number; rate: number | null }; definition: string }; premiumConversionRate: number | null;
  dailyPicks: { last30Days: number; actedRate: number | null }; unavailable: string[];
  rhythm: { pausedNow: number; quietHoursUsers: number };
  calls: { started: number; answered: number; answerRate: number; missed: number; averageMinutes: number; windowDays: number };
  dailyQuestion: { todayAnswers: number; totalAnswers: number };
  speed: { events: number; registrations: number; pairs: number; mutualInterests: number; mutualRate: number };
  signup: { unverifiedPending: number; unverifiedPurgedTotal: number };
  dates: { proposed: number; accepted: number; declined: number; canceled: number; completed: number; acceptRate: number | null; feedbackCount: number; feedbackAverage: number | null };
}
const WEIGHT_KEYS = ['intent', 'mutual', 'interests', 'location', 'other'] as const;
const INT_KEYS = [['daily.cooldown_days', 'cooldown'], ['daily.retention_days', 'retention'], ['prompts.min', 'promptsMin'], ['prompts.max', 'promptsMax'], ['likes.comment_max', 'commentMax'], ['icebreakers.count', 'icebreakersCount'], ['dates.min_notice_hours', 'dateMinNotice'], ['dates.max_days_ahead', 'dateMaxDays'], ['dates.max_open', 'dateMaxOpen'], ['dates.max_per_day', 'dateMaxPerDay'], ['dates.share_hours_after', 'dateShareHours'], ['pause.max_days', 'pauseMaxDays'], ['signup.code_ttl_minutes', 'codeTtl'], ['signup.unverified_ttl_hours', 'unverifiedTtl'], ['notifications.max_emails_per_day', 'emailCap'], ['live.search_hours', 'liveHours'], ['speed.reminder_minutes', 'speedReminder'], ['calls.ring_seconds', 'callRing'], ['calls.max_minutes', 'callMax'], ['calls.max_per_day', 'callPerDay']] as const;
const num = (v: string, fb = 0) => (v === '' || Number.isNaN(Number(v)) ? fb : Math.round(Number(v)));

function SettingsTab({ data }: { data: SettingsData }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [v, setV] = useState(() => ({ ...data.values }));
  const w = v['matching.weights'];
  const total = WEIGHT_KEYS.reduce((n, k) => n + w[k], 0);
  const save = useMutation({
    mutationFn: () => patch('/admin/settings', { values: v }),
    onSuccess: () => { toast('success', t('admin.eng.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'settings'] }); void qc.invalidateQueries({ queryKey: ['engagement', 'config'] }); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Card className="space-y-4 p-5">
        <div><h3 className="font-bold">{t('admin.eng.weightsTitle')}</h3><p className="text-sm text-muted">{t('admin.eng.weightsHelp')}</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {WEIGHT_KEYS.map((k) => <Field key={k} label={t(`admin.eng.w.${k}`)}>{(p) => <Input {...p} type="number" min={0} max={100} value={w[k]} onChange={(e) => setV({ ...v, 'matching.weights': { ...w, [k]: num(e.target.value) } })} />}</Field>)}
        </div>
        <p role="status" className={total === 100 ? 'text-sm font-semibold text-success-ink' : 'text-sm font-semibold text-danger-ink'}>{t('admin.eng.total', { n: total })}{total !== 100 && ` — ${t('admin.eng.totalBad')}`}</p>
      </Card>
      <Card className="space-y-4 p-5">
        <h3 className="font-bold">{t('admin.eng.quotasTitle')}</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {INT_KEYS.map(([key, label]) => <Field key={key} label={t(`admin.eng.${label}`)} hint={`${data.limits[key]!.min} – ${data.limits[key]!.max}`}>{(p) => <Input {...p} type="number" min={data.limits[key]!.min} max={data.limits[key]!.max} value={v[key] as number} onChange={(e) => setV({ ...v, [key]: num(e.target.value, data.defaults[key] as number) })} />}</Field>)}
        </div>
        <p className="text-xs text-muted">{t('admin.eng.flagsNote')}</p>
        <p className="text-xs text-muted">{t('admin.eng.dailyPlansNote')} <Link href="/admin/plans" className="font-semibold text-brand-ink underline">{t('admin.nav.plans')}</Link></p>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={save.isPending} disabled={total !== 100}>{t('admin.eng.save')}</Button>
        <Button type="button" variant="outline" onClick={() => setV({ ...data.defaults })}>{t('admin.eng.defaults')}</Button>
      </div>
    </form>
  );
}

function PromptsTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'prompts'], queryFn: () => api<{ items: PromptRow[] }>('/admin/prompts') });
  const blank = { slug: '', textFr: '', textEn: '', sortOrder: 50 };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'prompts'] }); void qc.invalidateQueries({ queryKey: ['engagement'] }); };
  const create = useMutation({ mutationFn: () => post('/admin/prompts', f), onSuccess: () => { toast('success', t('admin.eng.created')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Partial<PromptRow>) => patch(`/admin/prompts/${id}`, b), onSuccess: () => { toast('success', t('admin.eng.updated')); refresh(); }, onError: (e) => toast('error', err(e)) });
  return (
    <CrudTable
      title={t('admin.eng.tabPrompts')} description={t('admin.eng.promptsHelp')}
      addLabel={t('admin.eng.newPrompt')} editLabel={t('admin.eng.edit')}
      dialogTitle={editId ? t('admin.eng.edit') : t('admin.eng.newPrompt')} submitLabel={editId ? t('admin.eng.save1') : t('admin.eng.create')}
      exportName="questions-profil" tableLabels={useTableLabels()} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} submitting={create.isPending || update.isPending}
      onOpen={(r) => { setEditId(r?.id ?? null); setF(r ? { slug: r.slug, textFr: r.textFr, textEn: r.textEn, sortOrder: r.sortOrder } : blank); }}
      onSubmit={(r) => (r ? update.mutateAsync({ id: r.id, textFr: f.textFr, textEn: f.textEn, sortOrder: f.sortOrder }) : create.mutateAsync())}
      rows={q.data?.items} rowKey={(p) => p.id} loading={<PageLoader inline />} minWidth="44rem"
      columns={[
        { key: 'slug', header: t('admin.eng.slug'), value: (p) => p.slug, filter: 'text', cell: (p) => <code className="text-xs">{p.slug}</code> },
        { key: 'text', header: t('admin.eng.textFr'), value: (p) => `${p.textFr} ${p.textEn}`, cell: (p) => <><span className="block">{p.textFr}</span><span className="block text-xs text-muted">{p.textEn}</span></> },
        { key: 'order', mobileHidden: true, header: t('admin.eng.order'), value: (p) => p.sortOrder, cell: (p) => p.sortOrder },
        { key: 'answers', mobileHidden: true, header: t('admin.eng.answers'), value: (p) => p.answers, cell: (p) => p.answers },
        { key: 'active', header: t('admin.status'), value: (p) => (p.active ? 'active' : 'inactive'), filter: { options: [{ value: 'active', label: t('admin.eng.active') }, { value: 'inactive', label: t('admin.eng.inactive') }] }, cell: (p) => <Switch checked={p.active} onChange={(v) => update.mutate({ id: p.id, active: v })} label={`${t(p.active ? 'admin.eng.disable' : 'admin.eng.enable')} ${p.slug}`} /> },
      ]}
    >
      <Field label={t('admin.eng.slug')}>{(p) => <Input {...p} required disabled={!!editId} pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={40} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />}</Field>
      <Field label={t('admin.eng.order')}>{(p) => <Input {...p} type="number" min={0} max={1000} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: num(e.target.value) })} />}</Field>
      <Field label={t('admin.eng.textFr')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textFr} onChange={(e) => setF({ ...f, textFr: e.target.value })} />}</Field>
      <Field label={t('admin.eng.textEn')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textEn} onChange={(e) => setF({ ...f, textEn: e.target.value })} />}</Field>
    </CrudTable>
  );
}

function IcebreakersTab() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'icebreakers'], queryFn: () => api<{ items: IceRow[] }>('/admin/icebreakers') });
  const blank = { slug: '', kind: 'INTEREST' as IceRow['kind'], key: INTEREST_SLUGS[0] as string, textFr: '', textEn: '', sortOrder: 100 };
  const [f, setF] = useState(blank);
  const [editId, setEditId] = useState<string | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'icebreakers'] }); void qc.invalidateQueries({ queryKey: ['icebreakers'] }); };
  const create = useMutation({ mutationFn: () => post('/admin/icebreakers', { ...f, key: f.kind === 'GENERIC' ? null : f.key }), onSuccess: () => { toast('success', t('admin.eng.created')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Partial<IceRow>) => patch(`/admin/icebreakers/${id}`, b), onSuccess: () => { toast('success', t('admin.eng.updated')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const keyLabel = (r: { kind: IceRow['kind']; key: string | null }) => (r.kind === 'INTEREST' && r.key ? t(`interest.${r.key}` as never) : r.kind === 'INTENT' && r.key ? t(`intent.${r.key}` as never) : t('admin.eng.ice.noKey'));
  return (
    <CrudTable
      title={t('admin.eng.tabIcebreakers')} description={t('admin.eng.ice.help')}
      addLabel={t('admin.eng.ice.new')} editLabel={t('admin.eng.edit')}
      dialogTitle={editId ? t('admin.eng.edit') : t('admin.eng.ice.new')} submitLabel={editId ? t('admin.eng.save1') : t('admin.eng.create')}
      exportName="brise-glaces" tableLabels={useTableLabels()} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} submitting={create.isPending || update.isPending}
      onOpen={(r) => { setEditId(r?.id ?? null); setF(r ? { slug: r.slug, kind: r.kind, key: r.key ?? '', textFr: r.textFr, textEn: r.textEn, sortOrder: r.sortOrder } : blank); }}
      onSubmit={(r) => (r ? update.mutateAsync({ id: r.id, textFr: f.textFr, textEn: f.textEn, sortOrder: f.sortOrder }) : create.mutateAsync())}
      rows={q.data?.items} rowKey={(r) => r.id} loading={<PageLoader inline />} minWidth="46rem"
      columns={[
        { key: 'slug', header: t('admin.eng.slug'), value: (r) => r.slug, filter: 'text', cell: (r) => <code className="text-xs">{r.slug}</code> },
        { key: 'kind', header: t('admin.eng.ice.kind'), value: (r) => r.kind, filter: { options: (['INTEREST', 'INTENT', 'GENERIC'] as const).map((k) => ({ value: k, label: t(`admin.eng.ice.kind${k}`) })) }, cell: (r) => <Badge tone="neutral">{`${t(`admin.eng.ice.kind${r.kind}`)} · ${keyLabel(r)}`}</Badge> },
        { key: 'text', header: t('admin.eng.textFr'), value: (r) => `${r.textFr} ${r.textEn}`, cell: (r) => <><span className="block">{r.textFr}</span><span className="block text-xs text-muted">{r.textEn}</span></> },
        { key: 'order', mobileHidden: true, header: t('admin.eng.order'), value: (r) => r.sortOrder, cell: (r) => r.sortOrder },
        { key: 'active', header: t('admin.status'), value: (r) => (r.active ? 'active' : 'inactive'), filter: { options: [{ value: 'active', label: t('admin.eng.active') }, { value: 'inactive', label: t('admin.eng.inactive') }] }, cell: (r) => <Switch checked={r.active} onChange={(v) => update.mutate({ id: r.id, active: v })} label={`${t(r.active ? 'admin.eng.disable' : 'admin.eng.enable')} ${r.slug}`} /> },
      ]}
    >
      <Field label={t('admin.eng.slug')}>{(p) => <Input {...p} required disabled={!!editId} pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={60} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />}</Field>
      <Field label={t('admin.eng.ice.kind')}>{(p) => <Select {...p} disabled={!!editId} value={f.kind} onChange={(e) => { const kind = e.target.value as IceRow['kind']; setF({ ...f, kind, key: kind === 'INTENT' ? INTENTS[0] : INTEREST_SLUGS[0] }); }}>{(['INTEREST', 'INTENT', 'GENERIC'] as const).map((k) => <option key={k} value={k}>{t(`admin.eng.ice.kind${k}`)}</option>)}</Select>}</Field>
      {f.kind !== 'GENERIC' && <Field label={t('admin.eng.ice.key')}>{(p) => <Select {...p} disabled={!!editId} value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })}>{(f.kind === 'INTENT' ? INTENTS : INTEREST_SLUGS).map((k) => <option key={k} value={k}>{keyLabel({ kind: f.kind, key: k })}</option>)}</Select>}</Field>}
      <Field label={t('admin.eng.order')}>{(p) => <Input {...p} type="number" min={0} max={1000} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: num(e.target.value) })} />}</Field>
      <Field label={t('admin.eng.textFr')}>{(p) => <Input {...p} required minLength={10} maxLength={220} value={f.textFr} onChange={(e) => setF({ ...f, textFr: e.target.value })} />}</Field>
      <Field label={t('admin.eng.textEn')}>{(p) => <Input {...p} required minLength={10} maxLength={220} value={f.textEn} onChange={(e) => setF({ ...f, textEn: e.target.value })} />}</Field>
    </CrudTable>
  );
}

function DailyQuestionsTab() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: ['admin', 'daily-questions'], queryFn: () => api<{ items: AdminDailyQuestion[] }>('/admin/daily-questions') });
  const blank = { day: '', textFr: '', textEn: '', options: [{ fr: '', en: '' }, { fr: '', en: '' }] };
  const [f, setF] = useState(blank);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'daily-questions'] }); void qc.invalidateQueries({ queryKey: ['engagement', 'daily-question'] }); };
  const create = useMutation({ mutationFn: () => post('/admin/daily-questions', { day: f.day || null, textFr: f.textFr, textEn: f.textEn, options: f.options }), onSuccess: () => { toast('success', t('admin.eng.dq.created')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string; active: boolean }) => patch(`/admin/daily-questions/${id}`, b), onSuccess: () => { toast('success', t('admin.eng.dq.updated')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const remove = useMutation({ mutationFn: (id: string) => del(`/admin/daily-questions/${id}`), onSuccess: () => { toast('success', t('admin.eng.dq.deleted')); refresh(); }, onError: (e) => toast('error', err(e)) });
  const setOpt = (i: number, k: 'fr' | 'en', v: string) => setF({ ...f, options: f.options.map((o, j) => (j === i ? { ...o, [k]: v } : o)) });
  return (
    <CrudTable
      title={t('admin.eng.dq.tab')} description={t('admin.eng.dq.help')}
      addLabel={t('admin.eng.dq.new')} dialogTitle={t('admin.eng.dq.new')} submitLabel={t('admin.eng.dq.create')}
      exportName="question-du-jour" tableLabels={useTableLabels()} cancelLabel={t('common.cancel')} closeLabel={t('common.close')} submitting={create.isPending}
      onOpen={() => setF(blank)} onSubmit={() => create.mutateAsync()}
      rows={q.data?.items} rowKey={(r) => r.id} loading={<PageLoader inline />} empty={t('admin.eng.dq.empty')} minWidth="46rem"
      rowActions={(r) => [
        { label: r.active ? t('admin.eng.dq.disable') : t('admin.eng.dq.enable'), icon: r.active ? <PowerOff className="size-4" aria-hidden /> : <Power className="size-4" aria-hidden />, onSelect: () => update.mutate({ id: r.id, active: !r.active }) },
        { label: t('admin.eng.dq.delete'), icon: <Trash2 className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => remove.mutate(r.id) },
      ]}
      columns={[
        { key: 'q', header: t('admin.eng.dq.textFr'), value: (r) => `${r.text.fr} ${r.text.en}`, filter: 'text', cell: (r) => <><span className="block font-semibold">{locale === 'en' ? r.text.en : r.text.fr}</span><span className="block text-xs text-muted">{r.options.map((o) => `${locale === 'en' ? o.en : o.fr} · ${r.perOption[o.key] ?? 0}`).join('  ·  ')}</span></> },
        { key: 'day', header: t('admin.eng.dq.day'), value: (r) => r.day ?? '', cell: (r) => <span className="flex flex-wrap gap-1.5">{r.isToday && <Badge tone="success">{t('admin.eng.dq.today')}</Badge>}<Badge tone="neutral">{r.day ?? t('admin.eng.dq.pool')}</Badge></span> },
        { key: 'status', header: t('admin.status'), value: (r) => (r.active ? 'active' : 'inactive'), filter: { options: [{ value: 'active', label: t('admin.eng.dq.active') }, { value: 'inactive', label: t('admin.eng.dq.inactive') }] }, cell: (r) => <Badge tone={r.active ? 'brand' : 'neutral'}>{r.active ? t('admin.eng.dq.active') : t('admin.eng.dq.inactive')}</Badge> },
        { key: 'answers', mobileHidden: true, header: t('admin.eng.dq.colAnswers'), value: (r) => r.answers, cell: (r) => r.answers },
      ]}
    >
      <Field label={t('admin.eng.dq.textFr')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textFr} onChange={(e) => setF({ ...f, textFr: e.target.value })} />}</Field>
      <Field label={t('admin.eng.dq.textEn')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textEn} onChange={(e) => setF({ ...f, textEn: e.target.value })} />}</Field>
      {f.options.map((o, i) => (
        <div key={i} className="contents">
          <Field label={t('admin.eng.dq.optFr', { n: i + 1 })}>{(p) => <Input {...p} required maxLength={60} value={o.fr} onChange={(e) => setOpt(i, 'fr', e.target.value)} />}</Field>
          <Field label={t('admin.eng.dq.optEn', { n: i + 1 })}>{(p) => <Input {...p} required maxLength={60} value={o.en} onChange={(e) => setOpt(i, 'en', e.target.value)} />}</Field>
        </div>
      ))}
      <Field label={t('admin.eng.dq.day')}>{(p) => <Input {...p} type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} />}</Field>
      <div className="flex items-end">{f.options.length < 4 && <Button type="button" variant="outline" onClick={() => setF({ ...f, options: [...f.options, { fr: '', en: '' }] })}>{t('admin.eng.dq.addOption')}</Button>}</div>
    </CrudTable>
  );
}

function MetricsTab() {
  const t = useTranslations();
  const q = useQuery({ queryKey: ['admin', 'engagement', 'metrics'], queryFn: () => api<Metrics>('/admin/engagement/metrics') });
  if (!q.data) return <Skeleton className="h-64" />;
  const m = q.data;
  const pct = (n: number | null) => (n == null ? t('admin.eng.m.none') : `${n} %`);
  const cards: [string, string | number, string?][] = [
    [t('admin.eng.m.profilesCompleted'), m.profilesCompleted], [t('admin.eng.m.profilesWithPrompts'), `${m.profilesWithPrompts} (${pct(m.profilesWithPromptsRate)})`],
    [t('admin.eng.m.likes'), m.likes], [t('admin.eng.m.likesWithComment'), `${m.likesWithComment} (${pct(m.likesWithCommentRate)})`],
    [t('admin.eng.m.matches'), m.matches], [t('admin.eng.m.matchRate'), pct(m.matchRate)],
    [t('admin.eng.m.conversations'), m.conversations], [t('admin.eng.m.firstResponseRate'), pct(m.firstResponseRate)], [t('admin.eng.m.reciprocalConversations'), m.reciprocalConversations],
    [t('admin.eng.m.reports', { open: m.reportsOpen }), m.reports],
    [t('admin.eng.m.retentionD7', { n: m.retention.d7.cohort }), pct(m.retention.d7.rate)], [t('admin.eng.m.retentionD30', { n: m.retention.d30.cohort }), pct(m.retention.d30.rate)],
    [t('admin.eng.m.datesProposed'), m.dates.proposed], [t('admin.eng.m.datesAccepted'), m.dates.accepted], [t('admin.eng.m.datesAcceptRate'), pct(m.dates.acceptRate)], [t('admin.eng.m.datesCompleted'), m.dates.completed],
    [t('admin.eng.m.datesFeedback', { n: m.dates.feedbackCount }), m.dates.feedbackAverage == null ? t('admin.eng.m.none') : `${m.dates.feedbackAverage} / 5`],
    [t('admin.eng.m.unverifiedPending'), m.signup.unverifiedPending], [t('admin.eng.m.unverifiedPurged'), m.signup.unverifiedPurgedTotal],
    [t('admin.eng.m.pausedNow'), m.rhythm.pausedNow], [t('admin.eng.m.quietUsers'), m.rhythm.quietHoursUsers],
    [t('admin.eng.m.callsStarted', { n: m.calls.windowDays }), m.calls.started], [t('admin.eng.m.callsAnswered'), `${m.calls.answered} (${pct(Math.round(m.calls.answerRate * 100))})`], [t('admin.eng.m.callsMissed'), m.calls.missed], [t('admin.eng.m.callsAverage'), `${m.calls.averageMinutes} min`],
    [t('admin.eng.m.speedEvents'), m.speed.events], [t('admin.eng.m.speedRegistrations'), m.speed.registrations], [t('admin.eng.m.speedMutual'), `${m.speed.mutualInterests} / ${m.speed.pairs} (${pct(Math.round(m.speed.mutualRate * 100))})`],
    [t('admin.eng.m.dqToday'), m.dailyQuestion.todayAnswers], [t('admin.eng.m.dqTotal'), m.dailyQuestion.totalAnswers],
    [t('admin.eng.m.premiumConversionRate'), pct(m.premiumConversionRate)], [t('admin.eng.m.dailyPicks'), `${m.dailyPicks.last30Days} (${pct(m.dailyPicks.actedRate)})`],
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t('admin.eng.metricsHelp')}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <Card key={label} className="p-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-2xl font-extrabold">{value}</dd></Card>)}</dl>
      <p className="text-xs text-muted">{m.retention.definition}</p>
      <p className="text-xs text-muted">{t('admin.eng.m.datesNote')}</p>
      {m.unavailable.length > 0 && <Card className="space-y-2 p-4"><h3 className="font-bold">{t('admin.eng.unavailableTitle')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{m.unavailable.map((k) => <li key={k}>{t(`admin.eng.unavailable.${k}` as never)}</li>)}</ul>
        <p className="text-xs text-muted">{t('admin.eng.unavailableNote')}</p></Card>}
    </div>
  );
}

export default function AdminEngagement() {
  const t = useTranslations();
  const [tab, setTab] = useState<'settings' | 'prompts' | 'icebreakers' | 'dq' | 'metrics'>('settings');
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<SettingsData>('/admin/settings') });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.eng.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.eng.subtitle')}</p></header>
      <Tabs label={t('admin.eng.title')} value={tab} onChange={setTab} tabs={[{ key: 'settings', label: t('admin.eng.tabSettings') }, { key: 'prompts', label: t('admin.eng.tabPrompts') }, { key: 'icebreakers', label: t('admin.eng.tabIcebreakers') }, { key: 'dq', label: t('admin.eng.dq.tab') }, { key: 'metrics', label: t('admin.eng.tabMetrics') }]} />
      <div role="tabpanel">
        {tab === 'settings' && (settings.data ? <SettingsTab key={JSON.stringify(settings.data.values)} data={settings.data} /> : <Skeleton className="h-64" />)}
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'icebreakers' && <IcebreakersTab />}
        {tab === 'dq' && <DailyQuestionsTab />}
        {tab === 'metrics' && <MetricsTab />}
      </div>
    </div>
  );
}
