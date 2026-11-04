'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Input, Select, Tabs, Textarea } from '@duomatch/ui';
import { refreshBlogCache } from '@/app/actions/blog';
import { Markdown } from '@/components/marketing/Markdown';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { del, patch, post, upload } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { AdminBlogPost } from '@/lib/types';

interface Uploaded { key: string; url: string; thumbUrl: string }
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Éditeur d'article : création (post absent) ou modification. Publier exige image de couverture + texte alternatif (contrôlé aussi côté API). */
export function BlogEditor({ post }: { post?: AdminBlogPost }) {
  const t = useTranslations();
  const err = useApiError();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [f, setF] = useState(() => ({
    locale: post?.locale ?? 'fr', title: post?.title ?? '', slug: post?.slug ?? '', excerpt: post?.excerpt ?? '', body: post?.body ?? '',
    coverKey: post?.coverKey ?? null as string | null, coverUrl: post?.coverUrl ?? null as string | null, coverAlt: post?.coverAlt ?? '', status: post?.status ?? 'DRAFT' as 'DRAFT' | 'PUBLISHED',
  }));
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const send = useMutation({
    mutationFn: (status: 'DRAFT' | 'PUBLISHED') => {
      const common = { slug: f.slug, title: f.title, excerpt: f.excerpt, body: f.body, coverKey: f.coverKey, coverAlt: f.coverAlt, status };
      return post ? patch<AdminBlogPost>(`/admin/blog/${post.id}`, common) : post_<AdminBlogPost>({ ...common, locale: f.locale });
    },
    onSuccess: async (saved, status) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'blog'] });
      await refreshBlogCache();
      toast('success', t(status === 'PUBLISHED' ? (post?.status === 'PUBLISHED' ? 'admin.blog.saved' : 'admin.blog.publishedOk') : post?.status === 'PUBLISHED' ? 'admin.blog.unpublishedOk' : 'admin.blog.saved'));
      if (!post) router.replace(`/admin/blog/${saved.id}`);
      else set('status', saved.status);
    },
    onError: (e) => toast('error', err(e)),
  });
  const cover = useMutation({
    mutationFn: (file: File) => upload<Uploaded>('/admin/blog/images', file, file.name),
    onSuccess: (r) => { setF((s) => ({ ...s, coverKey: r.key, coverUrl: r.url })); toast('success', t('admin.blog.coverUploaded')); },
    onError: (e) => toast('error', err(e)),
  });
  const inline = useMutation({
    mutationFn: (file: File) => upload<Uploaded>('/admin/blog/images', file, file.name),
    onSuccess: (r) => {
      const ta = bodyRef.current;
      const at = ta?.selectionStart ?? f.body.length;
      const md = `\n\n![${t('admin.blog.insertedAlt')}](${r.url})\n\n`;
      setF((s) => ({ ...s, body: s.body.slice(0, at) + md + s.body.slice(at) }));
      toast('success', t('admin.blog.coverUploaded'));
    },
    onError: (e) => toast('error', err(e)),
  });
  const remove = useMutation({
    mutationFn: () => del(`/admin/blog/${post!.id}`),
    onSuccess: async () => { void qc.invalidateQueries({ queryKey: ['admin', 'blog'] }); await refreshBlogCache(); toast('success', t('admin.blog.deleted')); router.replace('/admin/blog'); },
    onError: (e) => toast('error', err(e)),
  });
  const published = f.status === 'PUBLISHED';
  const canSubmit = f.title.trim().length >= 3 && f.slug.length >= 3 && f.excerpt.trim().length >= 10 && f.body.trim().length >= 20;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/blog" className="text-sm font-semibold text-brand-ink">← {t('admin.blog.back')}</Link>
        <div className="flex items-center gap-2">
          <Badge tone={published ? 'success' : 'neutral'}>{t(`admin.blog.${f.status}`)}</Badge>
          {post && published && <Link href={`/blog/${post.slug}`} target="_blank" className="text-sm font-semibold text-brand-ink underline">{t('admin.blog.view')}</Link>}
        </div>
      </div>
      <h2 className="text-lg font-bold">{t(post ? 'admin.blog.editTitle' : 'admin.blog.createTitle')}</h2>

      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); send.mutate(f.status); }}>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={t('admin.blog.locale')}>{(p) => <Select {...p} disabled={!!post} value={f.locale} onChange={(e) => set('locale', e.target.value)}><option value="fr">{t('admin.blog.localeFr')}</option><option value="en">{t('admin.blog.localeEn')}</option></Select>}</Field>
          <Field label={t('admin.blog.slug')} hint={t('admin.blog.slugHint')}>{(p) => <Input {...p} required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }} />}</Field>
          <div className="sm:col-span-2"><Field label={t('admin.blog.fieldTitle')}>{(p) => <Input {...p} required minLength={3} maxLength={140} value={f.title} onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />}</Field></div>
          <div className="sm:col-span-2"><Field label={t('admin.blog.excerpt')}>{(p) => <Textarea {...p} required minLength={10} maxLength={300} className="min-h-20" value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} />}</Field></div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="font-semibold">{t('admin.blog.cover')}</h3>
          <p className="text-sm text-muted">{t('admin.blog.coverHint')}</p>
          {f.coverUrl
            ? <img src={f.coverUrl} alt={f.coverAlt || ''} className="aspect-video w-full max-w-xl rounded-2xl object-cover" />
            : <div className="grid aspect-video w-full max-w-xl place-items-center rounded-2xl border-2 border-dashed border-line text-sm text-muted">{t('admin.blog.coverNone')}</div>}
          <label className="inline-flex">
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t(f.coverUrl ? 'admin.blog.coverReplace' : 'admin.blog.coverUpload')} onChange={(e) => { const file = e.target.files?.[0]; if (file) cover.mutate(file); e.target.value = ''; }} />
            <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-5 text-sm font-semibold hover:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand"><ImagePlus className="size-4" aria-hidden />{cover.isPending ? t('admin.blog.uploading') : t(f.coverUrl ? 'admin.blog.coverReplace' : 'admin.blog.coverUpload')}</span>
          </label>
          <div className="max-w-xl"><Field label={t('admin.blog.coverAlt')}>{(p) => <Input {...p} maxLength={200} value={f.coverAlt} onChange={(e) => set('coverAlt', e.target.value)} />}</Field></div>
        </Card>

        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold">{t('admin.blog.body')}</h3>
            <Tabs label={t('admin.blog.body')} value={tab} onChange={setTab} tabs={[{ key: 'write', label: t('admin.blog.tabWrite') }, { key: 'preview', label: t('admin.blog.tabPreview') }]} />
          </div>
          {tab === 'write' ? (
            <div role="tabpanel" className="space-y-3">
              <Textarea ref={bodyRef} aria-label={t('admin.blog.body')} required minLength={20} maxLength={40000} className="min-h-96 font-mono text-sm" value={f.body} onChange={(e) => set('body', e.target.value)} />
              <p className="text-xs text-muted">{t('admin.blog.bodyHint')}</p>
              <label className="inline-flex">
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label={t('admin.blog.insertImage')} onChange={(e) => { const file = e.target.files?.[0]; if (file) inline.mutate(file); e.target.value = ''; }} />
                <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand"><ImagePlus className="size-4" aria-hidden />{inline.isPending ? t('admin.blog.uploading') : t('admin.blog.insertImage')}</span>
              </label>
            </div>
          ) : (
            <div role="tabpanel" className="rounded-2xl border border-line p-5">{f.body.trim() ? <Markdown source={f.body} /> : <p className="text-muted">{t('admin.blog.previewEmpty')}</p>}</div>
          )}
        </Card>

        {!published && !f.coverUrl && <p className="text-sm text-muted">{t('errors.COVER_REQUIRED')}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            {published ? (
              <>
                <Button type="submit" loading={send.isPending} disabled={!canSubmit}>{t('admin.blog.saveChanges')}</Button>
                <Button type="button" variant="outline" disabled={send.isPending || !canSubmit} onClick={() => send.mutate('DRAFT')}>{t('admin.blog.unpublish')}</Button>
              </>
            ) : (
              <>
                <Button type="submit" variant="outline" loading={send.isPending} disabled={!canSubmit}>{t('admin.blog.saveDraft')}</Button>
                <Button type="button" disabled={send.isPending || !canSubmit} onClick={() => send.mutate('PUBLISHED')}>{t('admin.blog.publish')}</Button>
              </>
            )}
          </div>
          {post && <Button type="button" variant="ghost" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4" aria-hidden />{t('admin.blog.delete')}</Button>}
        </div>
      </form>

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('admin.blog.deleteTitle')} closeLabel={t('common.close')}>
        <p className="text-muted">{t('admin.blog.deleteText')}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setConfirmDelete(false)}>{t('admin.blog.cancel')}</Button>
          <Button loading={remove.isPending} onClick={() => remove.mutate()}>{t('admin.blog.delete')}</Button>
        </div>
      </Dialog>
    </div>
  );
}

function post_<T>(body: unknown) { return post<T>('/admin/blog', body); }
