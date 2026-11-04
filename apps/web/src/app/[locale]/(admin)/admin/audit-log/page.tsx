'use client';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@duomatch/ui';
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
        <div className="overflow-x-auto rounded-3xl border border-line bg-card"><table className="w-full min-w-[36rem] text-left text-sm"><thead className="border-b border-line text-muted"><tr>{['date', 'actor', 'action', 'target'].map((h) => <th key={h} scope="col" className="px-4 py-3">{t(`admin.cols.${h}`)}</th>)}</tr></thead>
          <tbody>{logs.items.map((l) => <tr key={l.id} className="border-b border-line last:border-0"><td className="px-4 py-3 text-muted">{formatDate(l.createdAt, locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td className="px-4 py-3">{l.actor ?? '—'}</td><td className="px-4 py-3"><code>{l.action}</code></td><td className="px-4 py-3 text-muted">{l.targetType} {l.targetId?.slice(0, 8)}</td></tr>)}</tbody></table>{logs.items.length === 0 && <p className="p-6 text-center text-muted">{t('admin.empty')}</p>}</div>
        {logs.hasNextPage && <div className="mt-3 text-center"><Button variant="outline" onClick={() => logs.fetchNextPage()}>{t('admin.more')}</Button></div>}
      </section>
    </div>
  );
}
