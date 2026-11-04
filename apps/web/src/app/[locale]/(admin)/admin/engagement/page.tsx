'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Field, Input, Skeleton, Switch, Tabs } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, patch, post } from '@/lib/api';
import { useUi } from '@/lib/store';

type Weights = { intent: number; mutual: number; interests: number; location: number; other: number };
interface SettingsData { values: Record<string, number | Weights> & { 'matching.weights': Weights }; defaults: Record<string, number | Weights> & { 'matching.weights': Weights }; limits: Record<string, { min: number; max: number }> }
interface PromptRow { id: string; slug: string; textFr: string; textEn: string; active: boolean; sortOrder: number; answers: number }
interface Metrics {
  profilesCompleted: number; profilesWithPrompts: number; profilesWithPromptsRate: number | null; likes: number; likesWithComment: number; likesWithCommentRate: number | null;
  matches: number; matchRate: number | null; conversations: number; firstResponseRate: number | null; reciprocalConversations: number; reports: number; reportsOpen: number;
  retention: { d7: { cohort: number; rate: number | null }; d30: { cohort: number; rate: number | null }; definition: string }; premiumConversionRate: number | null;
  dailyPicks: { last30Days: number; actedRate: number | null }; unavailable: string[];
}
const WEIGHT_KEYS = ['intent', 'mutual', 'interests', 'location', 'other'] as const;
const INT_KEYS = [['daily.count_free', 'dailyFree'], ['daily.count_premium', 'dailyPremium'], ['daily.cooldown_days', 'cooldown'], ['daily.retention_days', 'retention'], ['prompts.min', 'promptsMin'], ['prompts.max', 'promptsMax'], ['likes.comment_max', 'commentMax']] as const;
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
  const [f, setF] = useState({ slug: '', textFr: '', textEn: '', sortOrder: 50 });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['admin', 'prompts'] }); void qc.invalidateQueries({ queryKey: ['engagement'] }); };
  const create = useMutation({ mutationFn: () => post('/admin/prompts', f), onSuccess: () => { toast('success', t('admin.eng.created')); setF({ slug: '', textFr: '', textEn: '', sortOrder: 50 }); refresh(); }, onError: (e) => toast('error', err(e)) });
  const update = useMutation({ mutationFn: ({ id, ...b }: { id: string } & Partial<PromptRow>) => patch(`/admin/prompts/${id}`, b), onSuccess: () => { toast('success', t('admin.eng.updated')); refresh(); }, onError: (e) => toast('error', err(e)) });
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t('admin.eng.promptsHelp')}</p>
      <Card className="p-5">
        <h3 className="mb-3 font-bold">{t('admin.eng.newPrompt')}</h3>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label={t('admin.eng.slug')}>{(p) => <Input {...p} required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={2} maxLength={40} value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} />}</Field>
          <Field label={t('admin.eng.order')}>{(p) => <Input {...p} type="number" min={0} max={1000} value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: num(e.target.value) })} />}</Field>
          <Field label={t('admin.eng.textFr')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textFr} onChange={(e) => setF({ ...f, textFr: e.target.value })} />}</Field>
          <Field label={t('admin.eng.textEn')}>{(p) => <Input {...p} required minLength={5} maxLength={120} value={f.textEn} onChange={(e) => setF({ ...f, textEn: e.target.value })} />}</Field>
          <div className="sm:col-span-2"><Button type="submit" loading={create.isPending}>{t('admin.eng.create')}</Button></div>
        </form>
      </Card>
      {q.isLoading && <Skeleton className="h-40" />}
      <ul className="space-y-3">{q.data?.items.map((p) => <PromptItem key={`${p.id}-${p.textFr}-${p.textEn}-${p.sortOrder}`} p={p} onSave={(b) => update.mutate({ id: p.id, ...b })} />)}</ul>
    </div>
  );
}

function PromptItem({ p, onSave }: { p: PromptRow; onSave: (b: Partial<PromptRow>) => void }) {
  const t = useTranslations();
  const [d, setD] = useState({ textFr: p.textFr, textEn: p.textEn, sortOrder: p.sortOrder });
  return (
    <li><Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2"><code className="text-xs">{p.slug}</code><Badge tone={p.active ? 'success' : 'neutral'}>{t(p.active ? 'admin.eng.active' : 'admin.eng.inactive')}</Badge><span className="text-xs text-muted">{t('admin.eng.answers')} : {p.answers}</span></span>
        <label className="flex items-center gap-2 text-sm">{t(p.active ? 'admin.eng.disable' : 'admin.eng.enable')}<Switch checked={p.active} onChange={(v) => onSave({ active: v })} label={t(p.active ? 'admin.eng.disable' : 'admin.eng.enable')} /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_6rem_auto] sm:items-end">
        <Field label={t('admin.eng.textFr')}>{(x) => <Input {...x} maxLength={120} value={d.textFr} onChange={(e) => setD({ ...d, textFr: e.target.value })} />}</Field>
        <Field label={t('admin.eng.textEn')}>{(x) => <Input {...x} maxLength={120} value={d.textEn} onChange={(e) => setD({ ...d, textEn: e.target.value })} />}</Field>
        <Field label={t('admin.eng.order')}>{(x) => <Input {...x} type="number" min={0} max={1000} value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: num(e.target.value) })} />}</Field>
        <Button variant="outline" onClick={() => onSave(d)}>{t('admin.eng.save1')}</Button>
      </div>
    </Card></li>
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
    [t('admin.eng.m.premiumConversionRate'), pct(m.premiumConversionRate)], [t('admin.eng.m.dailyPicks'), `${m.dailyPicks.last30Days} (${pct(m.dailyPicks.actedRate)})`],
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t('admin.eng.metricsHelp')}</p>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{cards.map(([label, value]) => <Card key={label} className="p-4"><dt className="text-sm text-muted">{label}</dt><dd className="mt-1 font-display text-2xl font-extrabold">{value}</dd></Card>)}</dl>
      <p className="text-xs text-muted">{m.retention.definition}</p>
      <Card className="space-y-2 p-4"><h3 className="font-bold">{t('admin.eng.unavailableTitle')}</h3>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">{m.unavailable.map((k) => <li key={k}>{t(`admin.eng.unavailable.${k}` as never)}</li>)}</ul>
        <p className="text-xs text-muted">{t('admin.eng.unavailableNote')}</p></Card>
    </div>
  );
}

export default function AdminEngagement() {
  const t = useTranslations();
  const [tab, setTab] = useState<'settings' | 'prompts' | 'metrics'>('settings');
  const settings = useQuery({ queryKey: ['admin', 'settings'], queryFn: () => api<SettingsData>('/admin/settings') });
  return (
    <div className="space-y-6">
      <header><h2 className="text-lg font-bold">{t('admin.eng.title')}</h2><p className="max-w-2xl text-sm text-muted">{t('admin.eng.subtitle')}</p></header>
      <Tabs label={t('admin.eng.title')} value={tab} onChange={setTab} tabs={[{ key: 'settings', label: t('admin.eng.tabSettings') }, { key: 'prompts', label: t('admin.eng.tabPrompts') }, { key: 'metrics', label: t('admin.eng.tabMetrics') }]} />
      <div role="tabpanel">
        {tab === 'settings' && (settings.data ? <SettingsTab key={JSON.stringify(settings.data.values)} data={settings.data} /> : <Skeleton className="h-64" />)}
        {tab === 'prompts' && <PromptsTab />}
        {tab === 'metrics' && <MetricsTab />}
      </div>
    </div>
  );
}
