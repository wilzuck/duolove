'use client';
import { useLocale, useTranslations } from 'next-intl';
import { DataTableView } from '@duomatch/ui';
import { useAdminList } from '@/hooks/useAdmin';
import { useTableLabels } from '@/hooks/useTableLabels';
import { formatDate } from '@/lib/format';

interface Log { id: string; actor: string | null; action: string; targetType: string | null; targetId: string | null; createdAt: string }

export default function AdminAudit() {
  const t = useTranslations();
  const locale = useLocale();
  const tableLabels = useTableLabels();
  const logs = useAdminList<Log>(['logs'], '/admin/audit-logs');
  return (
    <div className="space-y-6">
      <section aria-labelledby="al"><h2 id="al" className="mb-3 text-lg font-bold">{t('admin.audit')}</h2>
        <DataTableView
          rows={logs.items} rowKey={(l) => l.id} empty={t('admin.empty')} labels={tableLabels} exportName="journal-audit"
          hasMore={logs.hasNextPage} onLoadMore={() => void logs.fetchNextPage()} loadingMore={logs.isFetchingNextPage}
          columns={[
            { key: 'date', header: t('admin.cols.date'), value: (l) => l.createdAt, cellClassName: 'text-muted', cell: (l) => formatDate(l.createdAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { key: 'actor', header: t('admin.cols.actor'), value: (l) => l.actor ?? '', cell: (l) => l.actor ?? '—' },
            { key: 'action', header: t('admin.cols.action'), value: (l) => l.action, cell: (l) => <code>{l.action}</code> },
            { key: 'target', mobileHidden: true, header: t('admin.cols.target'), value: (l) => `${l.targetType ?? ''} ${l.targetId ?? ''}`, cellClassName: 'text-muted', cell: (l) => `${l.targetType} ${l.targetId?.slice(0, 8) ?? ''}` },
          ]}
        />
      </section>
    </div>
  );
}
