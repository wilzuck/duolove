'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { COUNTRIES, GENDERS, MIN_AGE, registerSchema } from '@duomatch/types';
import { Alert, Button, Checkbox, DatePicker, Field, Input, Select } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import { useLocale } from 'next-intl';

type Form = { displayName: string; email: string; password: string; birthDate: string; gender: string; country: string; city: string; acceptTerms: boolean; marketing: boolean; referralCode: string };
const empty: Form = { displayName: '', email: '', password: '', birthDate: '', gender: '', country: 'BJ', city: '', acceptTerms: false, marketing: false, referralCode: '' };

export default function RegisterPage() {
  return <Suspense><RegisterForm /></Suspense>;
}

function RegisterForm() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [f, setF] = useState<Form>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  // Lien d'invitation : /register?ref=CODE pré-remplit le code ; la saisie du membre prend le dessus (valeur dérivée, pas d'effet).
  const urlRef = (useSearchParams().get('ref') ?? '').trim().toUpperCase().slice(0, 32);
  const referralCode = f.referralCode || urlRef;
  const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - MIN_AGE);

  const done = async (sentTo?: string) => {
    await qc.invalidateQueries();
    if (sentTo) toast('success', t('auth.registered', { email: sentTo }));
    router.replace(sentTo ? '/confirm-email' : '/onboarding'); // e-mail à confirmer d'abord ; un compte Google arrive déjà confirmé
  };
  const reg = useMutation({
    mutationFn: () => post('/auth/register', { displayName: f.displayName, email: f.email, password: f.password, birthDate: f.birthDate, gender: f.gender, country: f.country, city: f.city, acceptTerms: f.acceptTerms, ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}) }),
    onSuccess: () => done(f.email),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
        setErrors(Object.fromEntries((e.details as { path: string; code: string }[]).map((d) => [d.path, t.has(`errors.${d.code}` as never) ? t(`errors.${d.code}` as never) : t('errors.invalidField')])));
      } else setFormError(err(e));
    },
  });
  const google = useMutation({
    mutationFn: () => post('/auth/google', { idToken: googleToken, birthDate: f.birthDate, gender: f.gender, country: f.country, city: f.city, acceptTerms: f.acceptTerms }),
    onSuccess: () => done(), onError: (e) => setFormError(err(e)),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const base = googleToken ? { ...f, email: 'google@example.com', password: 'Aa1aaaaaaaaa', displayName: f.displayName || 'Google' } : f;
    const parsed = registerSchema.safeParse(base);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), t.has(`errors.${i.message}` as never) ? t(`errors.${i.message}` as never) : t('errors.invalidField')])));
      return;
    }
    setErrors({});
    (googleToken ? google : reg).mutate();
  };

  return (
    <AuthShell backdrop="/images/auth-couple.webp" title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} footer={<>{t('auth.haveAccount')} <Link href="/login" className="font-semibold text-brand-ink underline">{t('nav.login')}</Link></>}>
      <ul className="-mt-2 mb-6 space-y-1.5 text-sm">
        {(t.raw('auth.reassure') as string[]).map((r) => <li key={r} className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden /><span>{r}</span></li>)}
      </ul>
      {!googleToken && <GoogleButton onToken={setGoogleToken} />}
      {googleToken && <p className="mb-5 rounded-2xl bg-soft p-4 text-sm">{t('auth.googleComplete')}</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {!googleToken && (
          <>
            <Field label={t('auth.displayName')} error={errors.displayName}>{(p) => <Input {...p} autoComplete="given-name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />}</Field>
            <Field label={t('auth.email')} error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} />}</Field>
            <Field label={t('auth.password')} hint={t('auth.passwordHint')} error={errors.password}>{(p) => <><PasswordInput {...p} autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /><PasswordStrength value={f.password} /></>}</Field>
          </>
        )}
        <Field label={t('auth.birthDate')} hint={t('auth.birthHint', { age: MIN_AGE })} error={errors.birthDate}>{(p) => <DatePicker id={p.id} aria-describedby={p['aria-describedby']} invalid={!!errors.birthDate} dropdowns locale={locale} max={maxBirth} value={f.birthDate} onChange={(v) => set('birthDate', v)} labels={{ placeholder: t('common.pickDate'), clear: t('common.clearDate') }} />}</Field>
        <Field label={t('auth.gender')} error={errors.gender}>{(p) => (
          <Select {...p} value={f.gender} onChange={(e) => set('gender', e.target.value)}>
            <option value="" disabled>{t('common.choose')}</option>
            {GENDERS.map((g) => <option key={g} value={g}>{t(`gender.${g}`)}</option>)}
          </Select>)}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.country')} error={errors.country}>{(p) => (
            <Select {...p} value={f.country} onChange={(e) => set('country', e.target.value)}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{locale === 'en' ? c.en : c.fr}</option>)}
            </Select>)}
          </Field>
          <Field label={t('auth.city')} error={errors.city}>{(p) => <Input {...p} autoComplete="address-level2" value={f.city} onChange={(e) => set('city', e.target.value)} />}</Field>
        </div>
        {!googleToken && <Field label={t('referral.registerLabel')} hint={t('referral.registerHint')}>{(p) => <Input {...p} autoComplete="off" autoCapitalize="characters" maxLength={32} value={referralCode} onChange={(e) => set('referralCode', e.target.value.toUpperCase())} />}</Field>}
        <div className="space-y-3 pt-1 text-sm">
          <Checkbox
            checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} aria-invalid={!!errors.acceptTerms}
            label={t.rich('auth.acceptTerms', { terms: (c) => <Link href="/legal/terms" className="text-brand-ink underline" target="_blank">{c}</Link>, privacy: (c) => <Link href="/legal/privacy" className="text-brand-ink underline" target="_blank">{c}</Link>, community: (c) => <Link href="/legal/community" className="text-brand-ink underline" target="_blank">{c}</Link> })}
          />
          {errors.acceptTerms && <Alert variant="text">{errors.acceptTerms}</Alert>}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={reg.isPending || google.isPending}>{t('auth.createAccount')}</Button>
        <p className="text-center text-xs text-muted">{t('auth.adultsNote')} {t('auth.privacyNote')}</p>
      </form>
    </AuthShell>
  );
}
