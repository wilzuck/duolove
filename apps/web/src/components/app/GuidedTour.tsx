'use client';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@duomatch/ui';
import { keys } from '@/hooks/useQueries';
import { usePathname } from '@/i18n/navigation';
import { del, post } from '@/lib/api';
import { tourFor, type Tour } from '@/lib/tours';

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;

/** Premier élément visible portant ce repère (le même repère existe pour le menu latéral et la barre du bas). */
function findTarget(id?: string): HTMLElement | null {
  if (!id) return null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return null;
}

/** Guide de découverte : projecteur sur l'élément expliqué, bulle adaptée à l'écran (à côté sur ordinateur, panneau en bas ou en haut sur mobile). */
export function GuidedTour({ seen }: { seen: string[] }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const path = usePathname();
  const [tour, setTour] = useState<Tour | null>(null);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  // Démarre le guide de la page au premier passage (petit délai : la page a le temps d'afficher ses éléments).
  useEffect(() => {
    const candidate = tourFor(path);
    if (!candidate || seen.includes(candidate.id)) return;
    const id = window.setTimeout(() => { setTour(candidate); setStep(0); }, 900);
    return () => window.clearTimeout(id);
  }, [path, seen]);

  const current = tour?.steps[step];
  const measure = useCallback(() => {
    setVw(window.innerWidth); setVh(window.innerHeight);
    const el = findTarget(current?.target);
    if (!el) { setRect(null); return; }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [current?.target]);

  useLayoutEffect(() => {
    if (!tour) return;
    const el = findTarget(current?.target);
    el?.scrollIntoView({ block: 'center', behavior: 'auto' });
    const raf = window.requestAnimationFrame(measure);  // mesure après le défilement
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.cancelAnimationFrame(raf); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [tour, step, current?.target, measure]);

  useEffect(() => { if (tour) box.current?.focus(); }, [tour, step]);

  const finish = useCallback(() => {
    if (!tour) return;
    const id = tour.id;
    setTour(null);
    qc.setQueryData(keys.me, (m: { toursSeen?: string[] } | undefined) => (m ? { ...m, toursSeen: [...(m.toursSeen ?? []), id] } : m));
    void post('/users/me/tours', { tour: id }).catch(() => undefined);
  }, [tour, qc]);

  useEffect(() => {
    if (!tour) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      else if (e.key === 'ArrowRight') setStep((s) => (s + 1 < tour.steps.length ? s + 1 : s));
      else if (e.key === 'ArrowLeft') setStep((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tour, finish]);

  if (!tour || !current) return null;
  const last = step === tour.steps.length - 1;
  const base = `tour.${tour.id}.${current.id}`;
  const mobile = vw > 0 && vw < 640;
  // Ordinateur : bulle sous l'élément (ou au-dessus s'il n'y a pas la place), jamais hors de l'écran. Mobile : panneau en bas, ou en haut si l'élément est en bas.
  let style: React.CSSProperties;
  if (!rect) style = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'min(92vw, 380px)' };
  else if (mobile) style = rect.top + rect.height / 2 > vh * 0.55 ? { top: 12, left: 12, right: 12 } : { bottom: 12, left: 12, right: 12 };
  else {
    const w = 360; const below = rect.top + rect.height + 12; const fitsBelow = below + 220 < vh;
    style = { width: w, left: Math.min(Math.max(12, rect.left + rect.width / 2 - w / 2), vw - w - 12), ...(fitsBelow ? { top: below } : { bottom: vh - rect.top + 12 }) };
  }

  return (
    <div className="fixed inset-0 z-[70]" aria-hidden={false}>
      {/* Voile et projecteur : l'élément expliqué reste net, le reste est assombri. Un clic sur le voile ne fait rien (le guide se ferme avec « Passer »). */}
      {rect
        ? <div aria-hidden className="pointer-events-none absolute rounded-2xl ring-2 ring-brand-strong transition-all duration-300 motion-reduce:transition-none" style={{ ...rect, boxShadow: '0 0 0 9999px rgb(15 10 20 / .62)' }} />
        : <div aria-hidden className="absolute inset-0" style={{ background: 'rgb(15 10 20 / .62)' }} />}
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-text"
        className="absolute rounded-3xl bg-card p-5 text-left shadow-pop outline-none motion-safe:animate-[fade-up_.3s_ease-out]" style={{ ...style, paddingBottom: mobile ? 'calc(1.25rem + env(safe-area-inset-bottom))' : undefined }}>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-muted">{t('tour.progress', { n: step + 1, total: tour.steps.length })}</span>
          <button type="button" onClick={finish} className="rounded-full p-1.5 text-muted hover:bg-soft hover:text-fg" aria-label={t('tour.skip')}><X className="size-4" aria-hidden /></button>
        </div>
        <h2 id="tour-title" className="text-lg font-extrabold">{t(`${base}.title` as never)}</h2>
        <p id="tour-text" className="mt-1.5 text-sm text-fg/85">{t(`${base}.text` as never)}</p>
        <div aria-hidden className="mt-4 flex gap-1.5">{tour.steps.map((s, i) => <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand-strong' : 'w-1.5 bg-line'}`} />)}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={finish}>{t('tour.skip')}</Button>
          <div className="flex gap-2">
            {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>{t('tour.prev')}</Button>}
            <Button size="sm" onClick={() => (last ? finish() : setStep(step + 1))}>{t(last ? 'tour.done' : 'tour.next')}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** « Revoir les guides » (paramètres) : chaque page remontrera son guide. */
export async function resetTours() {
  await del('/users/me/tours');
}
