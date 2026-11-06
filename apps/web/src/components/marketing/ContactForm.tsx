'use client';

import { CircleCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Select, Textarea } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { post } from '@/lib/api';

const TOPICS = ['account', 'billing', 'safety', 'privacy', 'idea', 'other'] as const;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Formulaire public : enregistre le message côté serveur (boîte de contact de l'administration). */
export function ContactForm() {
  const t = useTranslations();
  const locale = useLocale();
  const apiError = useApiError();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = { name: String(f.get('name') ?? '').trim(), email: String(f.get('email') ?? '').trim(), topic: String(f.get('topic') ?? 'other'), message: String(f.get('message') ?? '').trim(), website: String(f.get('website') ?? '') };
    const next = {
      name: v.name ? undefined : t('contact.form.errors.name'),
      email: EMAIL.test(v.email) ? undefined : t('contact.form.errors.email'),
      message: v.message.length >= 10 ? undefined : t('contact.form.errors.message'),
    };
    setErrors(next);
    if (next.name || next.email || next.message) return;
    setBusy(true); setFail(null);
    try { await post('/contact', { ...v, locale: locale === 'en' ? 'en' : 'fr' }); setDone(true); }
    catch (err) { setFail(apiError(err)); }
    finally { setBusy(false); }
  }

  if (done) {
    return (
      <div role="status" className="rounded-3xl border border-line bg-card p-7 text-center shadow-soft">
        <CircleCheck className="mx-auto size-9 text-brand-ink" aria-hidden />
        <h3 className="mt-3 text-xl font-extrabold">{t('contact.form.sentTitle')}</h3>
        <p className="mt-2 text-muted">{t('contact.form.sentText')}</p>
        <Button className="mt-5" variant="outline" onClick={() => setDone(false)}>{t('contact.form.again')}</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-3xl border border-line bg-card p-7 shadow-soft">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('contact.form.name')} error={errors.name}>{(p) => <Input {...p} name="name" autoComplete="name" maxLength={80} />}</Field>
        <Field label={t('contact.form.email')} error={errors.email}>{(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} />}</Field>
      </div>
      <Field label={t('contact.form.topic')}>{(p) => <Select {...p} name="topic" defaultValue="other">{TOPICS.map((k) => <option key={k} value={k}>{t(`contact.topics.${k}.h`)}</option>)}</Select>}</Field>
      <Field label={t('contact.form.message')} hint={t('contact.form.hint')} error={errors.message}>{(p) => <Textarea {...p} name="message" rows={6} maxLength={3000} />}</Field>
      {/* Champ piège pour les robots : invisible et hors parcours clavier. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      {fail && <Alert>{fail}</Alert>}
      <Button type="submit" disabled={busy}>{busy ? t('contact.form.sending') : t('contact.form.send')}</Button>
      <p className="text-xs text-muted">{t('contact.form.privacy')}</p>
    </form>
  );
}
