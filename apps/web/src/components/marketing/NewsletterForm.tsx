'use client';
import { Mail } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Button } from '@duomatch/ui';
import { post } from '@/lib/api';

/** Inscription à la newsletter (visiteurs) : un e-mail de confirmation est envoyé, l'abonnement n'est actif qu'après le clic. */
export function NewsletterForm() {
  const t = useTranslations();
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('busy');
    try { await post('/newsletter/subscribe', { email, website }); setState('done'); } catch { setState('error'); }
  };
  if (state === 'done') return <p role="status" className="max-w-xs rounded-2xl bg-soft p-3 text-sm text-brand-ink">{t('newsletter.sent')}</p>;
  return (
    <form onSubmit={submit} className="max-w-xs space-y-2" aria-label={t('newsletter.title')}>
      <p className="text-sm font-bold">{t('newsletter.title')}</p>
      <p className="text-sm text-muted">{t('newsletter.text')}</p>
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="nl-email">{t('newsletter.email')}</label>
        <input id="nl-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('newsletter.placeholder')}
          className="min-w-0 flex-1 rounded-full border border-field-line bg-field px-4 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/30" />
        <Button type="submit" size="sm" loading={state === 'busy'} aria-label={t('newsletter.subscribe')}><Mail className="size-4" aria-hidden /><span className="max-sm:sr-only">{t('newsletter.subscribe')}</span></Button>
      </div>
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden value={website} onChange={(e) => setWebsite(e.target.value)} className="hidden" />
      {state === 'error' && <p role="alert" className="text-sm text-danger-ink">{t('newsletter.error')}</p>}
    </form>
  );
}
