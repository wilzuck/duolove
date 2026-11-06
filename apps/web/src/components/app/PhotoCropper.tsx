'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Alert, Button, Dialog } from '@duomatch/ui';

const W = 1000, H = 1250; // sortie 4:5

/** Recadrage : glisser pour cadrer, curseur pour zoomer ; export JPEG via canvas (les métadonnées EXIF disparaissent). */
export function PhotoCropper({ file, onCancel, onDone }: { file: File | null; onCancel: () => void; onDone: (blob: Blob) => void }) {
  const t = useTranslations();
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement | null>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const src = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const clamp = (x: number, y: number, z: number) => {
    const el = box.current, im = img.current;
    if (!el || !im) return { x, y };
    const base = Math.max(el.clientWidth / im.naturalWidth, el.clientHeight / im.naturalHeight);
    const w = im.naturalWidth * base * z, h = im.naturalHeight * base * z;
    const mx = Math.max(0, (w - el.clientWidth) / 2), my = Math.max(0, (h - el.clientHeight) / 2);
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) };
  };

  const exportCrop = () => {
    const el = box.current, im = img.current;
    if (!el || !im) return;
    const base = Math.max(el.clientWidth / im.naturalWidth, el.clientHeight / im.naturalHeight) * zoom;
    const sw = el.clientWidth / base, sh = el.clientHeight / base;
    const sx = im.naturalWidth / 2 - pos.x / base - sw / 2, sy = im.naturalHeight / 2 - pos.y / base - sh / 2;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    try {
      c.getContext('2d')!.drawImage(im, sx, sy, sw, sh, 0, 0, W, H);
      c.toBlob((b) => (b ? onDone(b) : setFailed(true)), 'image/jpeg', 0.9);
    } catch { setFailed(true); }
  };

  return (
    <Dialog open={!!file} onClose={onCancel} title={t('photos.cropTitle')} closeLabel={t('common.close')}>
      <div className="space-y-4">
        <div ref={box} className="relative mx-auto aspect-[4/5] w-full max-w-xs touch-none overflow-hidden rounded-2xl bg-line"
          onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; }}
          onPointerMove={(e) => { if (drag.current) setPos(clamp(drag.current.px + e.clientX - drag.current.x, drag.current.py + e.clientY - drag.current.y, zoom)); }}
          onPointerUp={() => { drag.current = null; }}>
          {src && <img ref={img} src={src} alt="" draggable={false} onLoad={() => { setPos({ x: 0, y: 0 }); setZoom(1); setFailed(false); }} onError={() => setFailed(true)} className="absolute top-1/2 left-1/2 max-w-none select-none"
            style={{ transform: `translate(-50%, -50%) translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, minWidth: '100%', minHeight: '100%', objectFit: 'cover', width: '100%', height: '100%' }} />}
        </div>
        {failed && <Alert variant="text">{t('photos.cropError')}</Alert>}
        <label className="flex items-center gap-3 text-sm font-medium">{t('photos.zoom')}
          <input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(e) => { const z = Number(e.target.value); setZoom(z); setPos((p) => clamp(p.x, p.y, z)); }} className="flex-1 accent-brand-strong" />
        </label>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button><Button onClick={exportCrop} disabled={failed}>{t('photos.cropDone')}</Button></div>
      </div>
    </Dialog>
  );
}
