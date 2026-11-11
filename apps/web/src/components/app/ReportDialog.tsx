'use client';
import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { REPORT_REASONS } from '@duomatch/types';
import { Button, Checkbox, Dialog, Field, Select, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';
import { useUi } from '@/lib/store';

/** `conversationId` : signalement fait depuis une conversation ; la personne peut alors joindre les derniers messages (preuves), avec son accord explicite. */
export function ReportDialog({ userId, open, onClose, conversationId }: { userId: string; open: boolean; onClose: () => void; conversationId?: string }) {
  const t = useTranslations();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [details, setDetails] = useState('');
  const [share, setShare] = useState(true);
  const m = useMutation({
    mutationFn: () => post('/reports', { targetId: userId, reason, details: details || undefined, ...(conversationId ? { conversationId, shareMessages: share } : {}) }),
    onSuccess: () => { toast('success', t('report.sent')); setDetails(''); onClose(); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('report.title')} closeLabel={t('common.close')}>
      <form onSubmit={(e) => { e.preventDefault(); m.mutate(); }} className="space-y-4">
        <p className="text-sm text-muted">{t('report.intro')}</p>
        <Field label={t('report.reason')}>{(p) => <Select {...p} value={reason} onChange={(e) => setReason(e.target.value)}>{REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`report.reasons.${r}`)}</option>)}</Select>}</Field>
        <Field label={t('report.details')}>{(p) => <Textarea {...p} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}</Field>
        {conversationId && <div className="space-y-1"><Checkbox label={t('report.shareMessages')} checked={share} onChange={(e) => setShare(e.target.checked)} /><p className="pl-7 text-sm text-muted">{t('report.shareHint')}</p></div>}
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button><Button type="submit" loading={m.isPending}>{t('report.send')}</Button></div>
      </form>
    </Dialog>
  );
}
