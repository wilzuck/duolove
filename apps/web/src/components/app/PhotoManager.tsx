'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Plus, Star, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge, cn, Spinner } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { keys } from '@/hooks/useQueries';
import { del, isAbort, put, upload } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { MyProfile } from '@/lib/types';
import { PhotoCropper } from './PhotoCropper';

const MAX = 6;

export function PhotoManager({ photos }: { photos: MyProfile['photos'] }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const abort = useRef<AbortController | null>(null);
  const done = (p: MyProfile) => qc.setQueryData(keys.profile, p);
  const fail = (e: unknown) => toast('error', err(e));

  const add = useMutation({
    mutationFn: (b: Blob) => { abort.current = new AbortController(); return upload<MyProfile>('/profiles/me/photos', b, 'photo.jpg', { signal: abort.current.signal }); },
    onSuccess: (p) => { done(p); setFile(null); void qc.invalidateQueries({ queryKey: keys.me }); },
    onError: (e) => { setFile(null); if (!isAbort(e)) fail(e); }, // interruption voulue : on ferme sans message
  });
  const remove = useMutation({ mutationFn: (id: string) => del<MyProfile>(`/profiles/me/photos/${id}`), onSuccess: done, onError: fail });
  const order = useMutation({ mutationFn: (ids: string[]) => put<MyProfile>('/profiles/me/photos/order', { ids }), onSuccess: done, onError: fail });
  const move = (i: number, d: number) => {
    const ids = photos.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d]!, ids[i]!];
    order.mutate(ids);
  };
  const makeMain = (i: number) => { const ids = photos.map((p) => p.id); const [m] = ids.splice(i, 1); order.mutate([m!, ...ids]); };
  const btn = 'flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-black/75 disabled:opacity-30';

  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {photos.map((p, i) => (
          <li key={p.id} className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-soft">
            <img src={p.thumbUrl} alt={t('photos.alt', { n: i + 1 })} className="size-full object-cover" />
            {i === 0 && <Badge className="absolute top-2 left-2 bg-brand-strong text-white">{t('photos.main')}</Badge>}
            <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
              <div className="flex gap-1.5">
                <button type="button" className={btn} disabled={i === 0 || order.isPending} onClick={() => move(i, -1)} aria-label={t('photos.moveLeft')}><ArrowLeft className="size-4" /></button>
                <button type="button" className={btn} disabled={i === photos.length - 1 || order.isPending} onClick={() => move(i, 1)} aria-label={t('photos.moveRight')}><ArrowRight className="size-4" /></button>
                {i > 0 && <button type="button" className={btn} onClick={() => makeMain(i)} aria-label={t('photos.makeMain')}><Star className="size-4" /></button>}
              </div>
              <button type="button" className={cn(btn, 'bg-danger-strong/90 hover:bg-danger-strong')} onClick={() => remove.mutate(p.id)} aria-label={t('photos.remove')}><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
        {photos.length < MAX && (
          <li>
            <button type="button" onClick={() => input.current?.click()} disabled={add.isPending}
              className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-brand/40 bg-soft/60 text-brand-ink transition hover:bg-soft disabled:opacity-60">
              {add.isPending ? <Spinner label={t('photos.uploading')} /> : <><Plus className="size-8" aria-hidden /><span className="text-sm font-semibold">{t('photos.add')}</span></>}
            </button>
          </li>
        )}
      </ul>
      <p className="mt-3 text-sm text-muted">{t('photos.hint', { max: MAX })}</p>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-hidden className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = ''; }} />
      <PhotoCropper file={file} busy={add.isPending} onInterrupt={() => abort.current?.abort()} onCancel={() => setFile(null)} onDone={(b) => add.mutate(b)} />
    </div>
  );
}
