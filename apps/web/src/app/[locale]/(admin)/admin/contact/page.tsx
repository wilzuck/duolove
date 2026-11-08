'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, CheckCheck, Mail, MailOpen } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, DataTableView, Skeleton } from '@duomatch/ui';
import { PageHeader, StatusTabs, countOf, useAdminSummary } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { patch } from '@/lib/api';
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
  const tableLabels = useTableLabels();
  const [status, setStatus] = useState<Status>('NEW');
  const list = useAdminList<Msg>(['contact', status], `/admin/contact-messages?status=${status}`);
  const move = useMutation({ mutationFn: ({ id, s }: { id: string; s: Status }) => patch(`/admin/contact-messages/${id}`, { status: s }), onSuccess: () => qc.invalidateQueries({ queryKey: ['admin'] }), onError: (e) => toast('error', err(e)) });
  const c = useAdminSummary().data?.contact as Record<Status, number> | undefined;
  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.nav.contact')} description={t('admin.pageDesc.contact')} />
      <StatusTabs label={t('admin.status')} value={status} onChange={setStatus} options={STATUSES.map((s) => ({ key: s, label: t(`admin.contactBox.statuses.${s}`), count: countOf(c, s) }))} />
      {list.isLoading ? <Skeleton className="h-40" /> : (
        <DataTableView
          minWidth="48rem" rows={list.items} rowKey={(m) => m.id} empty={t('admin.contactBox.empty')} labels={tableLabels} exportName="messages-contact"
          hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          rowActions={(m) => [
            { label: t('admin.contactBox.reply'), icon: <Mail className="size-4" aria-hidden />, href: `mailto:${m.email}?subject=${encodeURIComponent('Re: CrushDuo')}`, onSelect: () => { if (m.status === 'NEW') move.mutate({ id: m.id, s: 'READ' }); } },
            ...(m.status === 'NEW' ? [{ label: t('admin.contactBox.markRead'), icon: <MailOpen className="size-4" aria-hidden />, onSelect: () => move.mutate({ id: m.id, s: 'READ' }) }] : []),
            ...(m.status !== 'ANSWERED' && m.status !== 'ARCHIVED' ? [{ label: t('admin.contactBox.answered'), icon: <CheckCheck className="size-4" aria-hidden />, onSelect: () => move.mutate({ id: m.id, s: 'ANSWERED' }) }] : []),
            m.status !== 'ARCHIVED' ? { label: t('admin.contactBox.archive'), icon: <Archive className="size-4" aria-hidden />, onSelect: () => move.mutate({ id: m.id, s: 'ARCHIVED' }) } : { label: t('admin.contactBox.restore'), icon: <ArchiveRestore className="size-4" aria-hidden />, onSelect: () => move.mutate({ id: m.id, s: 'NEW' }) },
          ]}
          columns={[
            { key: 'topic', header: t('admin.cols.topic'), value: (m) => m.topic, filter: { options: ['account', 'billing', 'safety', 'privacy', 'idea', 'other'].map((x) => ({ value: x, label: t(`contact.topics.${x}.h` as never) })) }, cell: (m) => <Badge>{t(`contact.topics.${m.topic}.h` as never)}</Badge> },
            { key: 'from', header: t('admin.cols.from'), value: (m) => `${m.name} ${m.email}`, cell: (m) => <>{m.name}<span className="block text-xs text-muted">{m.email}</span></> },
            { key: 'message', header: t('admin.cols.message'), value: (m) => m.message, cellClassName: 'max-w-md whitespace-pre-wrap', cell: (m) => m.message },
            { key: 'date', mobileHidden: true, header: t('admin.cols.date'), value: (m) => m.createdAt, cellClassName: 'text-muted', cell: (m) => timeAgo(m.createdAt, locale) },
          ]}
        />
      )}
    </div>
  );
}
