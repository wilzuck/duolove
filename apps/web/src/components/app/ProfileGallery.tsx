'use client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@duomatch/ui';
import type { Card } from '@/lib/types';

/**
 * Photos d'un profil, toutes visibles sans défiler ni faire glisser :
 * - `mosaic` (téléphone, colonne étroite) : une grande photo, puis une rangée de trois vignettes (« + de N » sur la dernière s'il en reste) ; un clic ouvre la photo en grand ;
 * - `stage` (ordinateur) : une grande photo et la rangée de vignettes dessous (un clic change la photo).
 * Un clic sur une photo l'ouvre en grand (visionneuse : flèches, ← →, Échap).
 */
export function ProfileGallery({ card, variant, className }: { card: Card; variant: 'mosaic' | 'stage'; className?: string }) {
  const t = useTranslations();
  const photos = card.photos;
  const [current, setCurrent] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const alt = (n: number) => `${card.displayName} (${n + 1}/${photos.length})`;
  const img = 'size-full object-cover transition hover:opacity-95';

  if (photos.length === 0) {
    return <div className={cn('flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-linear-to-br from-brand-2 to-brand-strong font-display text-8xl font-extrabold text-white/80', className)} aria-hidden>{card.displayName.slice(0, 1)}</div>;
  }
  const open = (n: number) => <button type="button" onClick={() => setViewer(n)} aria-label={t('gallery.open', { n: n + 1 })} className="block size-full overflow-hidden"><img src={photos[n]!.url} alt={alt(n)} draggable={false} className={img} /></button>;

  return (
    <div className={className}>
      {variant === 'stage' ? (
        <div className="space-y-3">
          <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-soft shadow-soft">{open(Math.min(current, photos.length - 1))}</div>
          {photos.length > 1 && (
            <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(photos.length, 6)}, minmax(0, 1fr))` }} aria-label={t('gallery.thumbs')}>
              {photos.slice(0, 6).map((p, n) => (
                <li key={p.id} className="relative aspect-square min-w-0">
                  <button type="button" onClick={() => (n === 5 && photos.length > 6 ? setViewer(5) : setCurrent(n))} aria-label={t('gallery.show', { n: n + 1 })} aria-current={n === current}
                    className={cn('relative block size-full overflow-hidden rounded-2xl ring-2 ring-inset transition', n === current ? 'ring-brand-strong' : 'ring-transparent hover:ring-line')}>
                    <img src={p.thumbUrl} alt="" draggable={false} className="size-full object-cover" />
                    {n === 5 && photos.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">+{photos.length - 6}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-soft shadow-soft">{open(0)}</div>
          {photos.length > 1 && (
            <ul className="grid grid-cols-3 gap-2" aria-label={t('gallery.thumbs')}>
              {photos.slice(1, 4).map((p, k) => {
                const n = k + 1;
                const more = n === 3 && photos.length > 4;
                return (
                  <li key={p.id} className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-soft">
                    <button type="button" onClick={() => setViewer(n)} aria-label={more ? t('gallery.moreOpen', { n: photos.length - 4 }) : t('gallery.open', { n: n + 1 })} className="block size-full">
                      <img src={p.thumbUrl} alt="" draggable={false} className="size-full object-cover" />
                      {more && <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-bold text-white">{t('gallery.more', { n: photos.length - 4 })}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {viewer != null && <PhotoViewer photos={photos} name={card.displayName} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** Visionneuse plein écran : arrière-plan flouté, flèches et touches ← → pour parcourir, Échap pour fermer. */
export function PhotoViewer({ photos, name, start, onClose }: { photos: { url: string }[]; name: string; start: number; onClose: () => void }) {
  const t = useTranslations();
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const go = (d: number) => setI((n) => (n + d + photos.length) % photos.length);
  useEffect(() => { const d = ref.current; d?.showModal(); return () => d?.close(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') go(1); else if (e.key === 'ArrowLeft') go(-1); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const btn = 'absolute top-1/2 z-10 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70';
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => e.target === ref.current && onClose()} aria-label={name}
      className="m-0 size-full max-h-none max-w-none bg-transparent p-0 text-white backdrop:bg-black/70 backdrop:backdrop-blur-sm">
      <div className="relative flex size-full items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <img src={photos[i]!.url} alt={`${name} (${i + 1}/${photos.length})`} className="max-h-full max-w-full rounded-2xl object-contain shadow-pop" />
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute top-4 right-4 z-10 flex size-11 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur hover:bg-black/70"><X className="size-5" /></button>
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t('card.prevPhoto')} className={cn(btn, 'left-4')}><ChevronLeft className="size-6" /></button>
            <button type="button" onClick={() => go(1)} aria-label={t('card.nextPhoto')} className={cn(btn, 'right-4')}><ChevronRight className="size-6" /></button>
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm backdrop-blur" aria-live="polite">{i + 1} / {photos.length}</p>
          </>
        )}
      </div>
    </dialog>
  );
}
