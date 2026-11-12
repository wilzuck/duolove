'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { COUNTRIES, countryFlag, GENDERS, MIN_AGE, registerSchema } from '@duomatch/types';
import { Alert, Button, Checkbox, DatePicker, Field, Input, Select } from '@duomatch/ui';
import { AuthShell } from '@/components/auth/AuthShell';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { PasswordStrength } from '@/components/auth/PasswordStrength';
import { CityInput } from '@/components/CityInput';
import { WaitlistPanel, foldCity } from '@/components/auth/WaitlistPanel';
import { useApiError } from '@/hooks/useApiError';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, api, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import { useLocale } from 'next-intl';

type Form = { displayName: string; email: string; password: string; birthDate: string; gender: string; country: string; city: string; acceptTerms: boolean; marketing: boolean; referralCode: string };
const LAUNCH_DEFAULT = ['BJ', 'CI', 'TG', 'SN', 'NE', 'BF'];
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
  const [googleToken, setGoogleToken] = useState<string | null>(() => useUi.getState().googleToken);
  useEffect(() => { useUi.getState().setGoogleToken(null); }, []);  // le jeton ne reste pas en mémoire plus longtemps que nécessaire
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));
  // Seuls les pays ouverts par l'administration sont proposés ; tant que la liste n'est pas arrivée, les pays de lancement par défaut.
  const launch = useQuery({ queryKey: ['launch-countries'], staleTime: 60_000, queryFn: () => api<{ countries: string[]; cities?: string[] }>('/launch-countries') });
  const openCodes = launch.data?.countries ?? LAUNCH_DEFAULT;
  // Villes ouvertes : liste vide = pas de restriction. Le serveur reste seul juge (403 CITY_NOT_OPEN) ; ceci évite de remplir tout le formulaire pour rien.
  const openCities = launch.data?.cities ?? [];
  const countries = COUNTRIES.filter((c) => openCodes.includes(c.code));
  const country = countries.some((c) => c.code === f.country) ? f.country : (countries[0]?.code ?? f.country);
  const cityClosed = openCities.length > 0 && f.city.trim().length >= 2 && !openCities.some((c) => foldCity(c) === foldCity(f.city));
  // Lien d'invitation : /register?ref=CODE pré-remplit le code ; la saisie du membre prend le dessus (valeur dérivée, pas d'effet).
  const urlRef = (useSearchParams().get('ref') ?? '').trim().toUpperCase().slice(0, 32);
  const referralCode = f.referralCode || urlRef;
  const [refOpen, setRefOpen] = useState(false);
  const showRef = refOpen || !!referralCode;  // champ masqué par défaut : visible avec ?ref=, une saisie, ou après un clic
  const maxBirth = new Date(); maxBirth.setFullYear(maxBirth.getFullYear() - MIN_AGE);

  const done = async (sentTo?: string) => {
    await qc.invalidateQueries();
    if (sentTo) toast('success', t('auth.registered', { email: sentTo }));
    router.replace(sentTo ? '/confirm-email' : '/onboarding'); // e-mail à confirmer d'abord ; un compte Google arrive déjà confirmé
  };
  const reg = useMutation({
    mutationFn: () => post('/auth/register', { displayName: f.displayName, email: f.email, password: f.password, birthDate: f.birthDate, gender: f.gender, country, city: f.city, acceptTerms: f.acceptTerms, ...(referralCode.trim() ? { referralCode: referralCode.trim() } : {}) }),
    onSuccess: () => done(f.email),
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'VALIDATION_ERROR' && Array.isArray(e.details)) {
        setErrors(Object.fromEntries((e.details as { path: string; code: string }[]).map((d) => [d.path, t.has(`errors.${d.code}` as never) ? t(`errors.${d.code}` as never) : t('errors.invalidField')])));
      } else setFormError(err(e));
    },
  });
  // Clic sur le bouton Google : on essaie d'abord de CONNECTER. Un compte existant entre directement, sans qu'on redemande ses informations ;
  // seule une personne nouvelle sur Crushduo (PROFILE_DETAILS_REQUIRED) passe à l'écran de complément.
  const googleStart = useMutation({
    mutationFn: (idToken: string) => post('/auth/google', { idToken }),
    onSuccess: async () => { await qc.invalidateQueries(); router.replace('/discover'); },
    onError: (e, idToken) => {
      if (e instanceof ApiError && e.code === 'PROFILE_DETAILS_REQUIRED') { setGoogleToken(idToken); return; }
      setFormError(err(e));
    },
  });
  const google = useMutation({
    mutationFn: () => post('/auth/google', { idToken: googleToken, birthDate: f.birthDate, gender: f.gender, country, city: f.city, acceptTerms: f.acceptTerms }),
    onSuccess: () => done(),
    onError: (e) => { if (e instanceof Error && 'code' in e && (e as { code: string }).code === 'INVALID_OAUTH_TOKEN') setGoogleToken(null); setFormError(err(e)); },  // jeton expiré : on redonne le bouton Google
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const base = googleToken ? { ...f, country, email: 'google@example.com', password: 'Aa1aaaaaaaaa', displayName: f.displayName || 'Google' } : f;
    const parsed = registerSchema.safeParse(googleToken ? base : { ...base, country });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), t.has(`errors.${i.message}` as never) ? t(`errors.${i.message}` as never) : t('errors.invalidField')])));
      return;
    }
    setErrors({});
    (googleToken ? google : reg).mutate();
  };

  return (
    <AuthShell title={t('auth.registerTitle')} subtitle={t('auth.registerSubtitle')} footer={<>{t('auth.haveAccount')} <Link href="/login" className="font-semibold text-brand-ink underline">{t('nav.login')}</Link></>}>
      {!googleToken && <GoogleButton onToken={(tok) => { setFormError(null); googleStart.mutate(tok); }} />}
      {googleToken && <p className="mb-5 rounded-2xl bg-soft p-4 text-sm">{t('auth.googleComplete')}</p>}
      <form onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {!googleToken && (
          <>
            <Field label={t('auth.displayName')} error={errors.displayName}>{(p) => <Input {...p} autoComplete="given-name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} />}</Field>
            <Field label={t('auth.email')} error={errors.email}>{(p) => <Input {...p} type="email" autoComplete="email" value={f.email} onChange={(e) => set('email', e.target.value)} />}</Field>
            <Field label={t('auth.password')} hint={f.password ? undefined : t('auth.passwordHint')} error={errors.password}>{(p) => <><PasswordInput {...p} autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} /><PasswordStrength value={f.password} /></>}</Field>
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
            <Select {...p} value={country} onChange={(e) => set('country', e.target.value)}>
              {countries.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {locale === 'en' ? c.en : c.fr}</option>)}
            </Select>)}
          </Field>
          <Field label={t('auth.city')} error={errors.city}>{(p) => <CityInput {...p} country={country} value={f.city} onChange={(v) => set('city', v)} />}</Field>
        </div>
        {cityClosed && <WaitlistPanel openCities={openCities} city={f.city} country={country} email={f.email} />}
        {!googleToken && (showRef
          ? <Field label={t('referral.registerLabel')} hint={t('referral.registerHint')}>{(p) => <Input {...p} autoComplete="off" autoCapitalize="characters" maxLength={32} value={referralCode} onChange={(e) => set('referralCode', e.target.value.toUpperCase())} />}</Field>
          : <button type="button" aria-expanded={false} onClick={() => setRefOpen(true)} className="text-sm font-semibold text-brand-ink underline">{t('referral.registerToggle')}</button>)}
        <div className="space-y-3 pt-1 text-sm">
          <Checkbox
            checked={f.acceptTerms} onChange={(e) => set('acceptTerms', e.target.checked)} aria-invalid={!!errors.acceptTerms}
            label={t.rich('auth.acceptTerms', { terms: (c) => <Link href="/legal/terms" className="text-brand-ink underline" target="_blank">{c}</Link>, privacy: (c) => <Link href="/legal/privacy" className="text-brand-ink underline" target="_blank">{c}</Link>, community: (c) => <Link href="/legal/community" className="text-brand-ink underline" target="_blank">{c}</Link> })}
          />
          {errors.acceptTerms && <Alert variant="text">{errors.acceptTerms}</Alert>}
        </div>
        <div className="max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:-mx-7 max-sm:-mb-1 max-sm:border-t max-sm:border-line max-sm:bg-card max-sm:px-7 max-sm:py-3">
          <Button type="submit" size="lg" className="w-full" loading={reg.isPending || google.isPending} disabled={cityClosed}>{t('auth.createAccount')}</Button>
        </div>
        <p className="text-center text-xs text-muted">{t('auth.adultsNote')} {t('auth.privacyNote')}</p>
      </form>
    </AuthShell>
  );
}
