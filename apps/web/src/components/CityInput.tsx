'use client';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Input, cn } from '@duomatch/ui';
import { api } from '@/lib/api';

/**
 * Saisie d'une ville avec suggestions (villes populaires du pays + villes déjà présentes chez les membres).
 * Une aide, pas une contrainte : on peut toujours écrire une autre ville. Clavier : ↑ ↓ pour choisir, Entrée pour valider, Échap pour fermer.
 * Sans pays, aucune suggestion (le champ reste un champ texte).
 * Le remplissage automatique du navigateur (adresses enregistrées) est coupé ici : il se superposait à nos propres suggestions. `autocomplete="off"` est la seule valeur
 * conforme (WCAG 1.3.5) qui désactive le remplissage ; Chrome l'ignore parfois sur les champs d'adresse, d'où aussi un `name` neutre, propre à chaque champ,
 * et des attributs `data-*` qui écartent les gestionnaires de mots de passe.
 */
export function CityInput({ value, onChange, country, id, className, ...aria }: {
  value: string; onChange: (v: string) => void; country: string | null | undefined; id?: string; className?: string;
  'aria-invalid'?: boolean; 'aria-describedby'?: string; autoComplete?: string; required?: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [term, setTerm] = useState(value);
  const box = useRef<HTMLDivElement>(null);

  // Petite attente avant d'interroger le serveur : une requête par pause de frappe, pas une par lettre.
  useEffect(() => { const h = setTimeout(() => setTerm(value), 200); return () => clearTimeout(h); }, [value]);
  const q = useQuery({
    queryKey: ['cities', country, term.trim()], enabled: !!country && open, staleTime: 5 * 60_000,
    queryFn: () => api<{ items: string[] }>(`/places/cities?country=${encodeURIComponent(country ?? '')}&q=${encodeURIComponent(term.trim())}`),
  });
  const items = (q.data?.items ?? []).filter((c) => c.toLowerCase() !== value.trim().toLowerCase());

  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, []);
  const pick = (c: string) => { onChange(c); setOpen(false); setActive(-1); };
  const show = open && items.length > 0;

  return (
    <div ref={box} className="relative">
      <Input {...aria} id={id} className={className} value={value} role="combobox" aria-expanded={show} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete={aria.autoComplete ?? 'off'} name={`ville-${listId}`} data-lpignore="true" data-1p-ignore="true" data-form-type="other"
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!show) return;
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
          else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]!); }
          else if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
        }} />
      {show && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-field-line bg-card p-1 shadow-pop">
          {items.map((c, i) => (
            <li key={c} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(c); }} onMouseEnter={() => setActive(i)}
              className={cn('cursor-pointer rounded-xl px-3 py-2 text-sm', i === active ? 'bg-soft text-brand-ink' : 'hover:bg-soft')}>{c}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
