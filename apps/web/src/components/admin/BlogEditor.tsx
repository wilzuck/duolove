'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, Field, Input, Select, Spinner, Switch, Tabs, Textarea } from '@duomatch/ui';
import { refreshBlogCache } from '@/app/actions/blog';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Markdown } from '@/components/marketing/Markdown';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { api, del, patch, post, upload } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { AdminBlogPost, AdminBlogRow } from '@/lib/types';

interface Uploaded { key: string; url: string; thumbUrl: string }
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** ISO (UTC) → valeur d'un champ « date et heure » dans le fuseau du navigateur ; vide si absente. */
const toLocal = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso); const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** Éditeur d'article : création (post absent) ou modification. Publier exige image de couverture + texte alternatif (contrôlé aussi côté API). */
export function BlogEditor({ post }: { post?: AdminBlogPost }) {
  const t = useTranslations();
  const err = useApiError();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const [f, setF] = useState(() => ({
    locale: post?.locale ?? 'fr', title: post?.title ?? '', slug: post?.slug ?? '', excerpt: post?.excerpt ?? '', body: post?.body ?? '',
    coverKey: post?.coverKey ?? null as string | null, coverUrl: post?.coverUrl ?? null as string | null, coverAlt: post?.coverAlt ?? '', status: post?.status ?? 'DRAFT' as 'DRAFT' | 'PUBLISHED', featured: post?.featured ?? false,
    createdAt: toLocal(post?.createdAt), publishedAt: toLocal(post?.publishedAt), translationOf: post?.translation?.id ?? '',
  }));
  const initial = { createdAt: toLocal(post?.createdAt), publishedAt: toLocal(post?.publishedAt) };
  const [slugTouched, setSlugTouched] = useState(!!post);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  // Articles de l'autre langue, pour lier la traduction (la liste admin est déjà en cache la plupart du temps).
  const all = useQuery({ queryKey: ['admin', 'blog'], queryFn: () => api<{ items: AdminBlogRow[] }>('/admin/blog') });
  const otherLocale = f.locale === 'fr' ? 'en' : 'fr';
  const candidates = (all.data?.items ?? []).filter((p) => p.locale === otherLocale && (!p.translation || p.translation.id === post?.id));

  const send = useMutation({
    mutationFn: (status: 'DRAFT' | 'PUBLISHED') => {
      // Les dates ne sont envoyées que si elles ont changé (ou, à la création, si elles sont remplies) : le serveur refuse une date dans le futur.
      const dates = {
        ...(f.createdAt && f.createdAt !== initial.createdAt ? { createdAt: new Date(f.createdAt).toISOString() } : {}),
        ...(f.publishedAt && f.publishedAt !== initial.publishedAt ? { publishedAt: new Date(f.publishedAt).toISOString() } : {}),
      };
      const linkChanged = f.translationOf !== (post?.translation?.id ?? '');
      const common = { slug: f.slug, title: f.title, excerpt: f.excerpt, body: f.body, coverKey: f.coverKey, coverAlt: f.coverAlt, status, featured: status === 'PUBLISHED' && f.featured, ...dates, ...(linkChanged ? { translationOf: f.translationOf || null } : {}) };
      return post ? patch<AdminBlogPost>(`/admin/blog/${post.id}`, common) : post_<AdminBlogPost>({ ...common, locale: f.locale });
    },
    onSuccess: async (saved, status) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'blog'] });
      await refreshBlogCache();
      toast('success', t(status === 'PUBLISHED' ? (post?.status === 'PUBLISHED' ? 'admin.blog.saved' : 'admin.blog.publishedOk') : post?.status === 'PUBLISHED' ? 'admin.blog.unpublishedOk' : 'admin.blog.saved'));
      if (!post) router.replace(`/admin/blog/${saved.id}`);
      else { set('status', saved.status); set('featured', !!saved.featured); }
    },
    onError: (e) => toast('error', err(e)),
  });
  const cover = useMutation({
    mutationFn: (file: File) => upload<Uploaded>('/admin/blog/images', file, file.name),
    onSuccess: (r) => {
      // Remplacement avant enregistrement : l'image téléversée juste avant n'est référencée par rien, on la supprime tout de suite.
      // (L'ancienne image déjà enregistrée est supprimée par le serveur à la sauvegarde.)
      if (f.coverKey && f.coverKey !== post?.coverKey) void del(`/admin/blog/images?key=${encodeURIComponent(f.coverKey)}`).catch(() => undefined);
      setF((s) => ({ ...s, coverKey: r.key, coverUrl: r.url })); toast('success', t('admin.blog.coverUploaded'));
    },
    onError: (e) => toast('error', err(e)),
  });
  const inline = useMutation({
    mutationFn: (file: File) => upload<Uploaded>('/admin/blog/images', file, file.name),
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
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <Badge tone={published ? 'success' : 'neutral'}>{t(`admin.blog.${f.status}`)}</Badge>
          {post && <Badge tone="neutral">{t('admin.blog.views')} : {post.views ?? 0}</Badge>}
          {post && published && <Link href={`/blog/${post.slug}`} target="_blank" className="text-sm font-semibold text-brand-ink underline">{t('admin.blog.view')}</Link>}
        </div>
      </div>
      <h2 className="text-lg font-bold">{t(post ? 'admin.blog.editTitle' : 'admin.blog.createTitle')}</h2>

      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); send.mutate(f.status); }}>
        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <Field label={t('admin.blog.locale')}>{(p) => <Select {...p} disabled={!!post} value={f.locale} onChange={(e) => set('locale', e.target.value)}><option value="fr">{t('admin.blog.localeFr')}</option><option value="en">{t('admin.blog.localeEn')}</option></Select>}</Field>
          <Field label={t('admin.blog.slug')} hint={t('admin.blog.slugHint')}>{(p) => <Input {...p} required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={f.slug} onChange={(e) => { setSlugTouched(true); set('slug', e.target.value); }} />}</Field>
          <Field label={t('admin.blog.createdAt')} hint={t('admin.blog.createdAtHint')}>{(p) => <Input {...p} type="datetime-local" max={toLocal(new Date().toISOString())} value={f.createdAt} onChange={(e) => set('createdAt', e.target.value)} />}</Field>
          <Field label={t('admin.blog.publishedAt')} hint={t('admin.blog.publishedAtHint')}>{(p) => <Input {...p} type="datetime-local" max={toLocal(new Date().toISOString())} value={f.publishedAt} onChange={(e) => set('publishedAt', e.target.value)} />}</Field>
          <div className="sm:col-span-2"><Field label={t('admin.blog.fieldTitle')}>{(p) => <Input {...p} required minLength={3} maxLength={140} value={f.title} onChange={(e) => { set('title', e.target.value); if (!slugTouched) set('slug', slugify(e.target.value)); }} />}</Field></div>
          <div className="sm:col-span-2"><Field label={t('admin.blog.translation')} hint={t('admin.blog.translationHint')}>{(p) => (
            <Select {...p} value={f.translationOf} onChange={(e) => set('translationOf', e.target.value)}>
              <option value="">{t('admin.blog.translationNone')}</option>
              {post?.translation && !candidates.some((c) => c.id === post.translation!.id) && <option value={post.translation.id}>{post.translation.title}</option>}
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.title}{c.status === 'DRAFT' ? ` (${t('admin.blog.DRAFT')})` : ''}</option>)}
            </Select>
          )}</Field></div>
          <div className="sm:col-span-2"><Field label={t('admin.blog.excerpt')}>{(p) => <Textarea {...p} required minLength={10} maxLength={300} className="min-h-20" value={f.excerpt} onChange={(e) => set('excerpt', e.target.value)} />}</Field></div>
        </Card>

        <Card className="space-y-4 p-5">
          <h3 className="font-semibold">{t('admin.blog.cover')}</h3>
          <p className="text-sm text-muted">{t('admin.blog.coverHint')}</p>
          {f.coverUrl
            ? <img src={f.coverUrl} alt={f.coverAlt || ''} className="aspect-video w-full max-w-xl rounded-2xl object-cover" />
            : <div className="grid aspect-video w-full max-w-xl place-items-center rounded-2xl border-2 border-dashed border-line text-sm text-muted">{t('admin.blog.coverNone')}</div>}
          <label className="inline-flex">
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={cover.isPending} className="sr-only" aria-label={t(f.coverUrl ? 'admin.blog.coverReplace' : 'admin.blog.coverUpload')} onChange={(e) => { const file = e.target.files?.[0]; if (file) cover.mutate(file); e.target.value = ''; }} />
            <span className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-5 text-sm font-semibold hover:bg-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand">{cover.isPending ? <Spinner size="sm" label={t('common.loading')} /> : <ImagePlus className="size-4" aria-hidden />}{cover.isPending ? t('admin.blog.uploading') : t(f.coverUrl ? 'admin.blog.coverReplace' : 'admin.blog.coverUpload')}</span>
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
              <RichTextEditor value={f.body} onChange={(md) => set('body', md)} busy={inline.isPending} uploadImage={async (file) => (await inline.mutateAsync(file)).url} />
              <p className="text-xs text-muted">{t('admin.blog.bodyHint')}</p>
            </div>
          ) : (
            <div role="tabpanel" className="rounded-2xl border border-line p-5">{f.body.trim() ? <Markdown source={f.body} /> : <p className="text-muted">{t('admin.blog.previewEmpty')}</p>}</div>
          )}
        </Card>

        <Card className="flex items-center justify-between gap-4 p-5">
          <div><h3 className="font-semibold">{t('admin.blog.featured')}</h3><p className="text-sm text-muted">{t(published ? 'admin.blog.featuredHint' : 'admin.blog.featuredDraft')}</p></div>
          <Switch checked={f.featured && published} disabled={!published} onChange={(v) => set('featured', v)} label={t('admin.blog.featured')} />
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
