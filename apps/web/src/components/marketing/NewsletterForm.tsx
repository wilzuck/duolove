'use client';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@duomatch/ui';
import { post } from '@/lib/api';

/** Inscription à la newsletter (visiteurs) : un e-mail de confirmation est envoyé, l'abonnement n'est actif qu'après le clic. */
export function NewsletterForm() {  // utilisé dans la section de la page d'accueil
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('busy');
    try { await post('/newsletter/subscribe', { email, website }); setState('done'); } catch { setState('error'); }
  };
  if (state === 'done') return <p role="status" className="mx-auto max-w-md rounded-2xl bg-card p-4 text-sm font-medium text-brand-ink shadow-soft">{t('newsletter.sent')}</p>;
  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-md space-y-2" aria-label={t('newsletter.title')}>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="nl-email">{t('newsletter.email')}</label>
        <input id="nl-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('newsletter.placeholder')}
          className="min-w-0 flex-1 rounded-full border border-field-line bg-field px-5 py-3 text-base outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
        <Button type="submit" size="lg" loading={state === 'busy'} aria-label={t('newsletter.subscribe')}><Mail className="size-4" aria-hidden /><span className="max-sm:sr-only">{t('newsletter.subscribe')}</span></Button>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" />
      {state === 'error' && <p role="alert" className="text-center text-sm text-danger-ink">{t('newsletter.error')}</p>}
    </form>
  );
}
