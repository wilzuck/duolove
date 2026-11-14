'use client';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CityInput } from './CityInput';
import { addCity, MAX_CITIES } from '@/lib/cities';

/**
 * Plusieurs villes : pastilles retirables + champ avec suggestions (celles du pays choisi).
 * Une suggestion choisie ou Entrée ajoute la ville ; liste vide = toutes les villes.
 */
export function CityMultiInput({ value, onChange, country, id, ...aria }: {
  value: string[]; onChange: (v: string[]) => void; country: string | null | undefined; id?: string;
  'aria-invalid'?: boolean; 'aria-describedby'?: string;
}) {
  const t = useTranslations();
  const [draft, setDraft] = useState('');
  const add = (c: string) => { onChange(addCity(value, c)); setDraft(''); };
  const full = value.length >= MAX_CITIES;
  return (
    // Saisie non validée par Entrée : ajoutée quand on quitte le champ (sinon elle serait perdue à l'enregistrement).
    <div className="space-y-2" onBlurCapture={() => { if (draft.trim()) add(draft); }}>
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('prefs.citiesChosen')}>
          {value.map((c) => (
            <li key={c} className="inline-flex items-center gap-1 rounded-full border border-brand-strong bg-brand-strong py-1 pl-3 pr-1 text-sm text-white">
              {c}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== c))} aria-label={t('prefs.cityRemove', { city: c })}
                className="grid size-6 place-items-center rounded-full hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!full && <CityInput {...aria} id={id} country={country} value={draft} onChange={setDraft} onPick={add} onEnter={() => add(draft)} />}
    </div>
  );
}
