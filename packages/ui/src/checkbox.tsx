import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children'> {
  /** Libellé (texte ou JSX, ex. liens des conditions). */
  label: ReactNode;
  /** Précision sous le libellé, reliée au champ par aria-describedby. */
  hint?: ReactNode;
  /** Alignement vertical de la case avec la première ligne (`start`) ou le centre (`center`, libellé court). */
  align?: 'start' | 'center';
}

/** Case à cocher accessible : 20 px, couleur de marque, libellé cliquable. */
export function Checkbox({ label, hint, align = 'start', className, id, 'aria-describedby': describedBy, ...input }: CheckboxProps) {
  const auto = useId();
  const hintId = hint ? `${id ?? auto}-hint` : undefined;
  return (
    <label className={cn('flex gap-3 text-sm', align === 'center' ? 'items-center' : 'items-start', className)}>
      <input
        {...input} id={id} type="checkbox"
        aria-describedby={[describedBy, hintId].filter(Boolean).join(' ') || undefined}
        className={cn('size-5 shrink-0 accent-brand-strong', align === 'start' && 'mt-0.5')}
      />
      <span>
        <span className={hint ? 'font-medium' : undefined}>{label}</span>
        {hint && <span id={hintId} className="block text-muted">{hint}</span>}
      </span>
    </label>
  );
}
