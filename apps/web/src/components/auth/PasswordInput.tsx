'use client';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type InputHTMLAttributes } from 'react';
import { Input } from '@duomatch/ui';

/** Champ de saisie secrète avec bouton « afficher / masquer » (utile sur mobile, où l'on se trompe vite). Le bouton n'a volontairement pas « mot de passe » dans son nom. */
export function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations();
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className="pr-12" />
      <button type="button" onClick={() => setShown(!shown)} aria-pressed={shown} aria-controls={props.id} aria-label={t(shown ? 'auth.hideInput' : 'auth.showInput')}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-2 text-muted hover:bg-soft hover:text-fg focus-visible:outline-2 focus-visible:outline-brand">
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
