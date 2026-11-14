'use client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@duomatch/ui';
import type { Card } from '@/lib/types';

/**
 * Photos d'un profil, toutes visibles sans défiler ni faire glisser :
 * - une grande photo (la principale), puis les autres en vignettes dessous, sans jamais répéter la grande ;
 * - `mosaic` (téléphone, colonne étroite) : trois vignettes au plus ; `stage` (ordinateur) : six au plus ; « + N » sur la dernière s'il en reste.
 * Un clic sur n'importe quelle photo, grande ou vignette, l'ouvre en grand (visionneuse : flèches, ← →, Échap).
 */
export function ProfileGallery({ card, variant, className }: { card: Card; variant: 'mosaic' | 'stage'; className?: string }) {
  const t = useTranslations();
  const photos = card.photos;
  const [viewer, setViewer] = useState<number | null>(null);
  // Sous la grande photo : les AUTRES photos (3 sur téléphone, 6 sur ordinateur) ; « + N » sur la dernière s'il en reste.
  const rest = photos.slice(1, (variant === 'stage' ? 6 : 3) + 1);
  const hidden = photos.length - 1 - rest.length;
  const alt = (n: number) => `${card.displayName} (${n + 1}/${photos.length})`;
  const img = 'size-full object-cover transition hover:opacity-95';

  if (photos.length === 0) {
    return <div className={cn('flex aspect-[4/5] w-full items-center justify-center rounded-2xl bg-linear-to-br from-brand-2 to-brand-strong font-display text-8xl font-extrabold text-white/80', className)} aria-hidden>{card.displayName.slice(0, 1)}</div>;
  }
  const open = (n: number) => <button type="button" onClick={() => setViewer(n)} aria-label={t('gallery.open', { n: n + 1 })} className="block size-full overflow-hidden"><img src={photos[n]!.url} alt={alt(n)} draggable={false} className={img} /></button>;

  return (
    <div className={className}>
      <div className={variant === 'stage' ? 'space-y-3' : 'space-y-2'}>
        <div className="aspect-[4/5] overflow-hidden rounded-2xl bg-soft shadow-soft">{open(0)}</div>
        {rest.length > 0 && (
          <ul className={cn('grid gap-2', variant === 'mosaic' && 'grid-cols-3')} style={variant === 'stage' ? { gridTemplateColumns: `repeat(${Math.max(rest.length, 2)}, minmax(0, 1fr))` } : undefined} aria-label={t('gallery.thumbs')}>
            {rest.map((p, k) => {
              const n = k + 1;  // la grande photo (n = 0) n'est jamais répétée dans la rangée
              const more = k === rest.length - 1 && hidden > 0;
              return (
                <li key={p.id} className={cn('relative overflow-hidden rounded-2xl bg-soft', variant === 'stage' ? 'aspect-square min-w-0' : 'aspect-[3/4]')}>
                  <button type="button" onClick={() => setViewer(n)} aria-label={more ? t('gallery.moreOpen', { n: hidden }) : t('gallery.open', { n: n + 1 })} className="block size-full">
                    <img src={p.thumbUrl} alt="" draggable={false} className="size-full object-cover transition hover:opacity-95" />
                    {more && <span aria-hidden className="absolute inset-0 flex items-center justify-center bg-black/55 text-base font-bold text-white">{t('gallery.more', { n: hidden })}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
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
