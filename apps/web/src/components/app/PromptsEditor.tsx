'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, IconButton, Select, Skeleton, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { useEngagementConfig } from '@/hooks/useQueries';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { PromptAnswer, PromptDef } from '@/lib/types';

interface Row { promptId: string; answer: string }
interface Mine { items: PromptAnswer[]; rules: { min: number; max: number; answerMax: number } }

/** Questions de personnalité : choisir, répondre, réordonner, modifier à tout moment. Les bornes viennent des réglages de l'administration. */
export function PromptsEditor() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: cfg } = useEngagementConfig();
  const enabled = !!cfg?.flags.profile_prompts;
  const catalog = useQuery({ queryKey: ['engagement', 'prompts'], queryFn: () => api<{ items: PromptDef[] }>('/engagement/prompts'), enabled });
  const mine = useQuery({ queryKey: ['engagement', 'me', 'prompts'], queryFn: () => api<Mine>('/engagement/me/prompts'), enabled });
  const [edited, setEdited] = useState<Row[] | null>(null);
  const rows: Row[] = edited ?? mine.data?.items.map((a) => ({ promptId: a.promptId, answer: a.answer })) ?? [];
  const rules = mine.data?.rules ?? { min: 3, max: 5, answerMax: 300 };
  const label = (id: string) => { const p = catalog.data?.items.find((x) => x.id === id); return p ? (locale === 'en' ? p.textEn : p.textFr) : ''; };
  const save = useMutation({
    mutationFn: () => put<Mine>('/engagement/me/prompts', { items: rows.map((r) => ({ promptId: r.promptId, answer: r.answer.trim() })) }),
    onSuccess: (r) => { qc.setQueryData(['engagement', 'me', 'prompts'], r); setEdited(null); toast('success', t('engagement.prompts.saved')); },
    onError: (e) => toast('error', err(e)),
  });
  if (!enabled) return null;
  const move = (i: number, d: number) => { const n = [...rows]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; setEdited(n); };
  const free = (catalog.data?.items ?? []).filter((p) => !rows.some((r) => r.promptId === p.id));
  const countBad = rows.length > 0 && rows.length < rules.min;
  const valid = !countBad && rows.every((r) => r.answer.trim().length >= 3);
  return (
    <Card className="space-y-4 p-5" id="prompts">
      <div><h2 className="font-bold">{t('engagement.prompts.title')}</h2><p className="text-sm text-muted">{t('engagement.prompts.subtitle', { min: rules.min, max: rules.max })}</p></div>
      {(mine.isLoading || catalog.isLoading) && <Skeleton className="h-24" />}
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.promptId} className="space-y-2 rounded-2xl border border-line p-4">
            <div className="flex items-start justify-between gap-2">
              <label htmlFor={`pa-${r.promptId}`} className="font-semibold text-brand-ink">{label(r.promptId)}</label>
              <span className="flex shrink-0 gap-1">
                <IconButton label={t('engagement.prompts.up')} tone="plain" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" /></IconButton>
                <IconButton label={t('engagement.prompts.down')} tone="plain" disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" /></IconButton>
                <IconButton label={t('engagement.prompts.remove')} tone="plain" onClick={() => setEdited(rows.filter((x) => x.promptId !== r.promptId))}><Trash2 className="size-4" /></IconButton>
              </span>
            </div>
            <Textarea id={`pa-${r.promptId}`} className="min-h-20" maxLength={rules.answerMax} value={r.answer} onChange={(e) => setEdited(rows.map((x) => (x.promptId === r.promptId ? { ...x, answer: e.target.value } : x)))} />
            <p className="text-right text-xs text-muted">{t('engagement.prompts.answerHint', { n: r.answer.length, max: rules.answerMax })}</p>
          </li>
        ))}
      </ul>
      {rows.length === 0 && !mine.isLoading && <p className="text-sm text-muted">{t('engagement.prompts.empty')}</p>}
      {rows.length < rules.max && free.length > 0 && (
        <Select aria-label={t('engagement.prompts.pick')} value="" onChange={(e) => { if (e.target.value) setEdited([...rows, { promptId: e.target.value, answer: '' }]); }}>
          <option value="">{t('engagement.prompts.pickPlaceholder')}</option>
          {free.map((p) => <option key={p.id} value={p.id}>{locale === 'en' ? p.textEn : p.textFr}</option>)}
        </Select>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className={countBad ? 'text-sm font-medium text-danger-ink' : 'text-sm text-muted'} role={countBad ? 'alert' : undefined}>{countBad ? t('engagement.prompts.needMin', { min: rules.min }) : t('engagement.prompts.count', { n: rows.length, max: rules.max })}</p>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!valid || edited === null}>{t('engagement.prompts.save')}</Button>
      </div>
    </Card>
  );
}
