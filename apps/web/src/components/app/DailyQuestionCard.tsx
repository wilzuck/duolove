'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageCircleQuestion } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button, Card, RadioChips } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { DailyQuestionState } from '@/lib/types';

export const dailyQuestionKey = ['engagement', 'daily-question'] as const;

/** La question du jour, la même pour tous : répondre débloque, sur les cartes, les réponses des autres membres de votre sélection. */
export function DailyQuestionCard() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const q = useQuery({ queryKey: dailyQuestionKey, queryFn: () => api<DailyQuestionState>('/engagement/daily-question'), retry: false });
  const [pick, setPick] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (optionKey: string) => post<DailyQuestionState>('/engagement/daily-question/answer', { optionKey }),
    onSuccess: (d) => { qc.setQueryData(dailyQuestionKey, d); void qc.invalidateQueries({ queryKey: ['daily'] }); toast('success', t('dailyQuestion.saved')); },
    onError: (e) => toast('error', err(e)),
  });
  const d = q.data;
  if (!d?.enabled || !d.question) return null;
  const chosen = pick ?? d.myAnswer ?? '';
  const options = d.question.options.map((o) => ({ value: o.key, label: locale === 'en' ? o.en : o.fr }));
  return (
    <Card className="space-y-3 p-5" data-testid="daily-question">
      <div className="flex items-start gap-3">
        <MessageCircleQuestion className="mt-0.5 size-6 shrink-0 text-brand" aria-hidden />
        <div>
          <p className="text-xs font-semibold text-muted">{t('dailyQuestion.label')}</p>
          <h2 className="font-display text-lg font-bold">{locale === 'en' ? d.question.text.en : d.question.text.fr}</h2>
        </div>
      </div>
      <RadioChips legend={t('dailyQuestion.legend')} options={options} value={chosen} onChange={(v) => setPick(v)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => chosen && save.mutate(chosen)} loading={save.isPending} disabled={!chosen || chosen === d.myAnswer}>{d.myAnswer ? t('dailyQuestion.change') : t('dailyQuestion.answer')}</Button>
        <p className="text-xs text-muted">{d.myAnswer ? t('dailyQuestion.unlocked') : t('dailyQuestion.hint')}</p>
      </div>
    </Card>
  );
}
