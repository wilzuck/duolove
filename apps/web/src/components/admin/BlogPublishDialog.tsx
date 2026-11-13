'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Badge, Button, Checkbox, Dialog, Field, Input } from '@duomatch/ui';
import { refreshBlogCache } from '@/app/actions/blog';
import { CoverDrop } from '@/components/admin/CoverDrop';
import { useApiError } from '@/hooks/useApiError';
import { del, patch, upload } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { AdminBlogRow } from '@/lib/types';

type Target = 'PUBLISHED' | 'DRAFT';
interface Draft { row: AdminBlogRow; selected: boolean; coverKey: string | null; coverUrl: string | null; coverAlt: string }

/** Ce qu'il manque à un article pour être publié (le serveur exige une image et sa description). */
export const missingForPublish = (p: { coverKey: string | null; coverAlt?: string | null }) => !p.coverKey || !(p.coverAlt ?? '').trim();

const draftOf = (row: AdminBlogRow, selected: boolean): Draft => ({ row, selected, coverKey: row.coverKey, coverUrl: row.coverUrl ?? null, coverAlt: row.coverAlt ?? '' });

/** Publier ou dépublier un article et, s'il existe, sa version dans l'autre langue : on choisit les versions concernées
 *  et on complète ce qui manque pour publier (image, description de l'image) sans ouvrir l'éditeur. */
export function BlogPublishDialog({ onClose, row, other, target }: { onClose: () => void; row: AdminBlogRow; other: AdminBlogRow | null; target: Target }) {
  const t = useTranslations();
  const err = useApiError();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  // Monté à l'ouverture (le parent le démonte à la fermeture) : l'état part toujours des articles reçus. Version française d'abord.
  const [items, setItems] = useState<Draft[]>(() => [draftOf(row, true), ...(other ? [draftOf(other, other.status !== target)] : [])]
    .sort((a, b) => (a.row.locale === 'fr' ? -1 : b.row.locale === 'fr' ? 1 : 0)));
  const [uploading, setUploading] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);

  const edit = (id: string, change: Partial<Draft>) => setItems((s) => s.map((d) => (d.row.id === id ? { ...d, ...change } : d)));
  const discardUploads = (keep: string[] = []) => uploaded.filter((k) => !keep.includes(k)).forEach((k) => void del(`/admin/blog/images?key=${encodeURIComponent(k)}`).catch(() => undefined));
  const close = () => { discardUploads(); onClose(); };

  const send = async (file: File, id: string) => {
    setUploading(id);
    try {
      const r = await upload<{ key: string; url: string }>('/admin/blog/images', file, file.name);
      setUploaded((s) => [...s, r.key]);
      edit(id, { coverKey: r.key, coverUrl: r.url });
    } catch (e) { toast('error', err(e)); } finally { setUploading(null); }
  };

  const chosen = items.filter((d) => d.selected && d.row.status !== target);
  const incomplete = target === 'PUBLISHED' && chosen.some(missingForPublish);

  const save = useMutation({
    mutationFn: async () => {
      // Une version après l'autre : si la seconde échoue, la première reste enregistrée et l'erreur est affichée.
      for (const d of chosen) {
        const body = target === 'PUBLISHED'
          ? { status: target, ...(d.coverKey !== d.row.coverKey ? { coverKey: d.coverKey } : {}), ...(d.coverAlt !== (d.row.coverAlt ?? '') ? { coverAlt: d.coverAlt } : {}) }
          : { status: target };
        await patch(`/admin/blog/${d.row.id}`, body);
      }
    },
    onSuccess: async () => {
      discardUploads(chosen.map((d) => d.coverKey ?? ''));
      void qc.invalidateQueries({ queryKey: ['admin', 'blog'] });
      await refreshBlogCache();
      toast('success', t(target === 'PUBLISHED' ? 'admin.blog.publishDialog.donePublished' : 'admin.blog.publishDialog.doneUnpublished', { n: chosen.length }));
      onClose();
    },
    onError: (e) => { void qc.invalidateQueries({ queryKey: ['admin', 'blog'] }); toast('error', err(e)); },
  });

  const publishing = target === 'PUBLISHED';
  return (
    <Dialog open onClose={close} dismissible={!save.isPending} closeLabel={t('common.close')}
      title={t(publishing ? 'admin.blog.publishDialog.titlePublish' : 'admin.blog.publishDialog.titleUnpublish')}>
      <p className="text-sm text-muted">{t(items.length > 1 ? 'admin.blog.publishDialog.textBoth' : 'admin.blog.publishDialog.textOne')}</p>
      <div className="mt-4 space-y-4">
        {items.map((d) => {
          const done = d.row.status === target;
          const peer = items.find((x) => x.row.id !== d.row.id);
          const peerCover = peer?.coverKey && peer.coverUrl ? peer : null;
          const sharing = !!peerCover && d.coverKey === peerCover.coverKey;
          const needs = publishing && d.selected && !done;
          return (
            <section key={d.row.id} className="space-y-3 rounded-2xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <Checkbox
                  checked={d.selected && !done} disabled={done || save.isPending}
                  onChange={(e) => edit(d.row.id, { selected: e.target.checked })}
                  label={<><span className="mr-2 font-bold">{d.row.locale.toUpperCase()}</span>{d.row.title}</>}
                  hint={done ? t(publishing ? 'admin.blog.publishDialog.alreadyPublished' : 'admin.blog.publishDialog.alreadyDraft') : undefined}
                />
                <Badge tone={d.row.status === 'PUBLISHED' ? 'success' : 'neutral'}>{t(`admin.blog.${d.row.status}`)}</Badge>
              </div>
              {needs && (missingForPublish(d.row) || d.coverKey !== d.row.coverKey || d.coverAlt !== (d.row.coverAlt ?? '')
                ? (
                  <div className="space-y-3">
                    {(!d.row.coverKey || d.coverKey !== d.row.coverKey) && (
                      <>
                        <CoverDrop className="max-w-sm" url={d.coverUrl} alt={d.coverAlt} locked={sharing} pending={uploading === d.row.id} onFile={(file) => void send(file, d.row.id)} />
                        {peerCover && (
                          <Checkbox
                            checked={sharing}
                            onChange={(e) => edit(d.row.id, e.target.checked ? { coverKey: peerCover.coverKey, coverUrl: peerCover.coverUrl } : { coverKey: d.row.coverKey, coverUrl: d.row.coverUrl ?? null })}
                            label={t(peerCover.row.locale === 'fr' ? 'admin.blog.coverUseFr' : 'admin.blog.coverUseEn')}
                          />
                        )}
                      </>
                    )}
                    <Field label={t('admin.blog.coverAlt')}>{(p) => <Input {...p} maxLength={200} value={d.coverAlt} onChange={(e) => edit(d.row.id, { coverAlt: e.target.value })} />}</Field>
                    {missingForPublish(d) && <p className="text-sm text-muted">{t('admin.blog.publishDialog.missing')}</p>}
                  </div>
                )
                : <p className="flex items-center gap-2 text-sm text-success-ink"><CheckCircle2 className="size-4" aria-hidden />{t('admin.blog.publishDialog.ready')}</p>)}
            </section>
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={save.isPending} onClick={close}>{t('admin.blog.cancel')}</Button>
        <Button loading={save.isPending} disabled={!chosen.length || incomplete || !!uploading} onClick={() => save.mutate()}>
          {t(publishing ? 'admin.blog.publishDialog.confirmPublish' : 'admin.blog.publishDialog.confirmUnpublish', { n: chosen.length })}
        </Button>
      </div>
    </Dialog>
  );
}
