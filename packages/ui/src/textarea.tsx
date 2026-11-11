'use client';
import { useCallback, useLayoutEffect, useRef, type Ref, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Même aspect que les autres champs (voir field.tsx). */
const control = 'w-full rounded-xl border border-field-line bg-field px-4 text-fg placeholder:text-muted transition hover:border-field-line-hover focus:border-brand focus:outline-2 focus:outline-offset-0 focus:outline-brand/60 disabled:opacity-60 aria-invalid:border-danger';

/**
 * Zone de texte élastique : sa hauteur suit le contenu, sans barre de défilement. Elle ne rétrécit jamais sous sa hauteur minimale (`min-h-*`)
 * et s'arrête à `max-h-*` si l'appelant en fixe une (la barre de défilement n'apparaît alors qu'à partir de cette limite).
 * Marche sur tous les navigateurs (calcul de la hauteur en JavaScript, sans dépendre de `field-sizing`).
 */
export function Textarea({ className, ref, onInput, onFocus, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement> }) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const fit = useCallback(() => {
    const el = inner.current;
    if (!el || el.offsetParent === null) return; // masquée (fenêtre fermée, accordéon replié) : rien à mesurer, on recalculera à l'affichage
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`; // + bordures
  }, []);
  const setRef = useCallback((node: HTMLTextAreaElement | null) => {
    inner.current = node;
    if (typeof ref === 'function') ref(node); else if (ref) (ref as { current: HTMLTextAreaElement | null }).current = node;
  }, [ref]);
  useLayoutEffect(fit, [fit, p.value, p.defaultValue]); // valeur modifiée de l'extérieur (envoi du message, idée choisie, réinitialisation)
  useLayoutEffect(() => {
    window.addEventListener('resize', fit); // largeur modifiée : le texte se replie autrement
    return () => window.removeEventListener('resize', fit);
  }, [fit]);
  return (
    <textarea ref={setRef} className={cn(control, 'min-h-28 resize-none overflow-y-auto py-3', className)} {...p}
      onInput={(e) => { fit(); onInput?.(e); }} onFocus={(e) => { fit(); onFocus?.(e); }} />
  );
}
