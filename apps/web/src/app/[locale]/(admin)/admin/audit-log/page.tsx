'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Button, DataTable } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { formatDate } from '@/lib/format';

interface Log { id: string; actor: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string }

export default function AdminAudit() {
  const t = useTranslations();
  const locale = useLocale();
  const logs = useAdminList<Log>(['logs'], '/admin/audit-logs');
  return (
    <div className="space-y-6">
      <section aria-labelledby="al"><h2 id="al" className="mb-3 text-lg font-bold">{t('admin.audit')}</h2>
        <DataTable
          rows={logs.items} rowKey={(l) => l.id} empty={t('admin.empty')}
          columns={[
            { key: 'date', header: t('admin.cols.date'), cellClassName: 'text-muted', cell: (l) => formatDate(l.createdAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { key: 'actor', header: t('admin.cols.actor'), cell: (l) => l.actor ?? '—' },
            { key: 'action', header: t('admin.cols.action'), cell: (l) => <code>{l.action}</code> },
            { key: 'target', header: t('admin.cols.target'), cellClassName: 'text-muted', cell: (l) => `${l.targetType} ${l.targetId?.slice(0, 8) ?? ''}` },
          ]}
        />
        {logs.hasNextPage && <div className="mt-3 text-center"><Button variant="outline" onClick={() => logs.fetchNextPage()}>{t('admin.more')}</Button></div>}
      </section>
    </div>
  );
}
