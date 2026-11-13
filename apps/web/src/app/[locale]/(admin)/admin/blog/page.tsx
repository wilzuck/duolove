'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Plus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Button, Card, DataTableView, Skeleton, Switch } from '@duomatch/ui';
import { refreshBlogCache } from '@/app/actions/blog';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { Link } from '@/i18n/navigation';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';
import { formatDate } from '@/lib/format';
import type { AdminBlogRow } from '@/lib/types';

export default function AdminBlog() {
  const t = useTranslations();
  const locale = useLocale();
  const tableLabels = useTableLabels();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const settings = useQuery({ queryKey: ['admin', 'blog', 'settings'], queryFn: () => api<{ showViews: boolean }>('/admin/blog/settings') });
  const toggleViews = useMutation({
    mutationFn: (showViews: boolean) => put<{ showViews: boolean }>('/admin/blog/settings', { showViews }),
    onSuccess: async (r) => { qc.setQueryData(['admin', 'blog', 'settings'], r); await refreshBlogCache(); toast('success', t('admin.blog.saved')); },
    onError: (e) => toast('error', err(e)),
  });
  const q = useQuery({ queryKey: ['admin', 'blog'], queryFn: () => api<{ items: AdminBlogRow[] }>('/admin/blog') });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-lg font-bold">{t('admin.blog.title')}</h2><p className="max-w-xl text-sm text-muted">{t('admin.blog.subtitle')}</p></div>
        <Link href="/admin/blog/new"><Button><Plus className="size-4" aria-hidden />{t('admin.blog.new')}</Button></Link>
      </header>
      <Card className="flex items-center justify-between gap-4 p-5">
        <div className="flex items-start gap-3"><Eye className="mt-0.5 size-5 text-muted" aria-hidden /><div><h3 className="font-semibold">{t('admin.blog.viewsPublic')}</h3><p className="text-sm text-muted">{t('admin.blog.viewsPublicHint')}</p></div></div>
        <Switch checked={!!settings.data?.showViews} disabled={!settings.data || toggleViews.isPending} onChange={(v) => toggleViews.mutate(v)} label={t('admin.blog.viewsPublic')} />
      </Card>
      {q.isLoading && <Skeleton className="h-40" />}
      {q.data && q.data.items.length === 0 && <p className="text-center text-muted">{t('admin.blog.empty')}</p>}
      {!!q.data?.items.length && (
        <DataTableView
          rows={q.data.items} rowKey={(p) => p.id} minWidth="42rem" labels={tableLabels} exportName="blog"
          columns={[
            { key: 'cover', header: t('admin.blog.cover'), srOnlyHeader: true, cell: (p) => (p.coverThumbUrl ? <img src={p.coverThumbUrl} alt="" className="h-12 w-20 rounded-lg object-cover" /> : <span className="grid h-12 w-20 place-items-center rounded-lg bg-soft text-xs text-muted">—</span>) },
            { key: 'title', header: t('admin.blog.colTitle'), value: (p) => p.title, cell: (p) => <Link href={`/admin/blog/${p.id}`} className="font-semibold hover:underline">{p.title}</Link> },
            { key: 'locale', header: t('admin.blog.colLang'), value: (p) => p.locale, filter: { options: [{ value: 'fr', label: 'FR' }, { value: 'en', label: 'EN' }] }, cell: (p) => p.locale.toUpperCase() },
            { key: 'translation', mobileHidden: true, header: t('admin.blog.colTranslation'), value: (p) => p.translation?.locale ?? '', cell: (p) => (p.translation ? <Link href={`/admin/blog/${p.translation.id}`} className="text-sm font-semibold text-brand-ink hover:underline">{p.translation.locale.toUpperCase()}</Link> : <span className="text-muted">—</span>) },
            { key: 'status', header: t('admin.blog.colStatus'), value: (p) => p.status, filter: { options: ['PUBLISHED', 'DRAFT'].map((x) => ({ value: x, label: t(`admin.blog.${x}`) })) }, cell: (p) => <span className="inline-flex flex-wrap gap-1"><Badge tone={p.status === 'PUBLISHED' ? 'success' : 'neutral'}>{t(`admin.blog.${p.status}`)}</Badge>{p.featured && <Badge tone="brand">{t('admin.blog.featured')}</Badge>}</span> },
            { key: 'views', header: t('admin.blog.views'), value: (p) => p.views ?? 0, cell: (p) => <span className="tabular-nums">{p.views ?? 0}</span> },
            { key: 'updated', mobileHidden: true, header: t('admin.blog.colUpdated'), value: (p) => p.updatedAt, cell: (p) => formatDate(p.updatedAt, locale) },
            { key: 'edit', header: t('admin.blog.edit'), srOnlyHeader: true, cell: (p) => <Link href={`/admin/blog/${p.id}`} className="text-sm font-semibold text-brand-ink">{t('admin.blog.edit')}</Link> },
          ]}
        />
      )}
    </div>
  );
}
