'use client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@duomatch/ui';
import type { Card } from '@/lib/types';

type Photo = Card['photos'][number];

/**
 * Photos d'un profil, toutes visibles sans défiler ni faire glisser :
 * - `mosaic` (téléphone, colonne étroite) : une grande photo et deux petites, « +N » sur la dernière s'il y en a davantage ;
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
    return <div className={cn('flex aspect-[4/5] w-full items-center justify-center rounded-3xl bg-linear-to-br from-brand-2 to-brand-strong font-display text-8xl font-extrabold text-white/80', className)} aria-hidden>{card.displayName.slice(0, 1)}</div>;
  }
  const open = (n: number) => <button type="button" onClick={() => setViewer(n)} aria-label={t('gallery.open', { n: n + 1 })} className="block size-full overflow-hidden"><img src={photos[n]!.url} alt={alt(n)} draggable={false} className={img} /></button>;

  return (
    <div className={className}>
      {variant === 'stage' ? (
        <div className="space-y-3">
          <div className="aspect-[4/5] overflow-hidden rounded-3xl bg-soft shadow-soft">{open(Math.min(current, photos.length - 1))}</div>
          {photos.length > 1 && (
            <ul className="flex gap-2" aria-label={t('gallery.thumbs')}>
              {photos.slice(0, 6).map((p, n) => (
                <li key={p.id} className="relative aspect-square min-w-0 flex-1">
                  <button type="button" onClick={() => (n === 5 && photos.length > 6 ? setViewer(5) : setCurrent(n))} aria-label={t('gallery.show', { n: n + 1 })} aria-current={n === current}
                    className={cn('size-full overflow-hidden rounded-xl ring-2 transition', n === current ? 'ring-brand-strong' : 'ring-transparent hover:ring-line')}>
                    <img src={p.thumbUrl} alt="" draggable={false} className="size-full object-cover" />
                    {n === 5 && photos.length > 6 && <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-bold text-white">+{photos.length - 6}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className={cn('grid gap-1.5 overflow-hidden rounded-3xl', photos.length === 1 ? 'aspect-[4/5] grid-cols-1' : photos.length === 2 ? 'aspect-[4/3] grid-cols-2' : 'aspect-[4/3] grid-cols-[2fr_1fr] grid-rows-2')}>
          <div className={cn('min-h-0 overflow-hidden bg-soft', photos.length > 2 && 'row-span-2')}>{open(0)}</div>
          {photos.length > 1 && <div className="relative min-h-0 overflow-hidden bg-soft">{open(1)}</div>}
          {photos.length > 2 && (
            <div className="relative min-h-0 overflow-hidden bg-soft">{open(2)}
              {photos.length > 3 && <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/55 text-lg font-bold text-white">+{photos.length - 3}</span>}
            </div>
          )}
        </div>
      )}
      {viewer != null && <Viewer photos={photos} name={card.displayName} start={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** Visionneuse plein écran : arrière-plan flouté, flèches et touches ← → pour parcourir, Échap pour fermer. */
function Viewer({ photos, name, start, onClose }: { photos: Photo[]; name: string; start: number; onClose: () => void }) {
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
