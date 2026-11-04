'use client';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, DataTable, Skeleton } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { AdminBlogRow } from '@/lib/types';

export default function AdminBlog() {
  const t = useTranslations();
  const locale = useLocale();
  const q = useQuery({ queryKey: ['admin', 'blog'], queryFn: () => api<{ items: AdminBlogRow[] }>('/admin/blog') });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">{t('admin.blog.title')}</h2><p className="max-w-xl text-sm text-muted">{t('admin.blog.subtitle')}</p></div>
        <Link href="/admin/blog/new"><Button><Plus className="size-4" aria-hidden />{t('admin.blog.new')}</Button></Link>
      </header>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data && q.data.items.length === 0 && <p className="text-center text-muted">{t('admin.blog.empty')}</p>}
      {!!q.data?.items.length && (
        <DataTable
          rows={q.data.items} rowKey={(p) => p.id} minWidth="42rem"
          columns={[
            { key: 'cover', header: t('admin.blog.cover'), srOnlyHeader: true, cell: (p) => (p.coverThumbUrl ? <img src={p.coverThumbUrl} alt="" className="h-12 w-20 rounded-lg object-cover" /> : <span className="grid h-12 w-20 place-items-center rounded-lg bg-soft text-xs text-muted">—</span>) },
            { key: 'title', header: t('admin.blog.colTitle'), cell: (p) => <Link href={`/admin/blog/${p.id}`} className="font-semibold hover:underline">{p.title}</Link> },
            { key: 'locale', header: t('admin.blog.colLang'), cell: (p) => p.locale.toUpperCase() },
            { key: 'status', header: t('admin.blog.colStatus'), cell: (p) => <Badge tone={p.status === 'PUBLISHED' ? 'success' : 'neutral'}>{t(`admin.blog.${p.status}`)}</Badge> },
            { key: 'updated', header: t('admin.blog.colUpdated'), cell: (p) => formatDate(p.updatedAt, locale) },
            { key: 'edit', header: t('admin.blog.edit'), srOnlyHeader: true, cell: (p) => <Link href={`/admin/blog/${p.id}`} className="text-sm font-semibold text-brand-ink">{t('admin.blog.edit')}</Link> },
          ]}
        />
      )}
    </div>
  );
}
