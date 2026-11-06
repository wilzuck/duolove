'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Select, Skeleton } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { api, patch } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useUi } from '@/lib/store';

type Status = 'NEW' | 'READ' | 'ANSWERED' | 'ARCHIVED';
const STATUSES: Status[] = ['NEW', 'READ', 'ANSWERED', 'ARCHIVED'];
interface Msg { id: string; name: string; email: string; topic: string; message: string; locale: string; status: Status; createdAt: string }

export default function AdminContact() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [status, setStatus] = useState<Status>('NEW');
  const list = useAdminList<Msg>(['contact', status], `/admin/contact-messages?status=${status}`);
  const counts = useQuery({ queryKey: ['admin', 'contact-counts', status], queryFn: () => api<{ counts: Record<Status, number> }>('/admin/contact-messages?limit=1&status=' + status) });
  const move = useMutation({ mutationFn: ({ id, s }: { id: string; s: Status }) => patch(`/admin/contact-messages/${id}`, { status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  const c = counts.data?.counts;
  return (
    <div className="space-y-4">
      <Select aria-label={t('admin.status')} value={status} onChange={(e) => setStatus(e.target.value as Status)} className="w-60">
        {STATUSES.map((s) => <option key={s} value={s}>{t(`admin.contactBox.statuses.${s}`)}{c ? ` (${c[s]})` : ''}</option>)}
      </Select>
      {list.isLoading && <Skeleton className="h-40" />}
      {!list.isLoading && list.items.length === 0 && <EmptyState icon={<Inbox className="size-8" aria-hidden />} title={t('admin.contactBox.empty')} />}
      <ul className="space-y-3">{list.items.map((m) => (
        <li key={m.id}><Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{t(`contact.topics.${m.topic}.h` as never)}</Badge>
            <span className="text-sm text-muted">{timeAgo(m.createdAt, locale)} · {t('admin.contactBox.from', { name: m.name })} · {m.email}</span>
          </div>
          <p className="whitespace-pre-wrap rounded-2xl bg-soft p-3 text-sm">{m.message}</p>
          <div className="flex flex-wrap gap-2">
            <a href={`mailto:${m.email}?subject=${encodeURIComponent('Re: DuoMatch')}`} onClick={() => m.status === 'NEW' && move.mutate({ id: m.id, s: 'READ' })}><Button size="sm">{t('admin.contactBox.reply')}</Button></a>
            {m.status === 'NEW' && <Button size="sm" variant="outline" onClick={() => move.mutate({ id: m.id, s: 'READ' })}>{t('admin.contactBox.markRead')}</Button>}
            {m.status !== 'ANSWERED' && m.status !== 'ARCHIVED' && <Button size="sm" variant="outline" onClick={() => move.mutate({ id: m.id, s: 'ANSWERED' })}>{t('admin.contactBox.answered')}</Button>}
            {m.status !== 'ARCHIVED' ? <Button size="sm" variant="ghost" onClick={() => move.mutate({ id: m.id, s: 'ARCHIVED' })}>{t('admin.contactBox.archive')}</Button>
              : <Button size="sm" variant="ghost" onClick={() => move.mutate({ id: m.id, s: 'NEW' })}>{t('admin.contactBox.restore')}</Button>}
          </div>
        </Card></li>
      ))}</ul>
      {list.hasNextPage && <div className="text-center"><Button variant="outline" onClick={() => list.fetchNextPage()}>{t('admin.more')}</Button></div>}
    </div>
  );
}
