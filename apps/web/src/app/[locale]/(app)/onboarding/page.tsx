'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import type { ProfileUpdateInput } from '@duomatch/types';
import { Button, Skeleton } from '@duomatch/ui';
import { AboutFields, InterestPicker, PreferenceFields, aboutFrom, prefDefault, type AboutValue } from '@/components/app/ProfileForms';
import { PhotoManager } from '@/components/app/PhotoManager';
import { useApiError } from '@/hooks/useApiError';
import { keys, useMe, useMyProfile } from '@/hooks/useQueries';
import { useRouter } from '@/i18n/navigation';
import { patch, post, put } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { Me, MyProfile } from '@/lib/types';

const STEPS = ['about', 'interests', 'photos', 'prefs'] as const;

export default function OnboardingPage() {
  const { data: me } = useMe();
  const { data: profile } = useMyProfile();
  if (!profile || !me) return <div className="mx-auto max-w-xl space-y-4 p-6"><Skeleton className="h-8" /><Skeleton className="h-96" /></div>;
  return <Wizard profile={profile} me={me} />;
}

function Wizard({ profile, me }: { profile: MyProfile; me: Me }) {
  const t = useTranslations();
  const router = useRouter();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [step, setStep] = useState(0);
  const [about, setAbout] = useState<AboutValue>(() => aboutFrom(profile));
  const [pref, setPref] = useState<ReturnType<typeof prefDefault>>(() => prefDefault(profile));

  const saveAbout = useMutation({
    mutationFn: (a: AboutValue) => patch<MyProfile>('/profiles/me', { bio: a.bio, occupation: a.occupation || undefined, languages: a.languages, intent: a.intent, interests: a.interests as ProfileUpdateInput['interests'] }),
    onSuccess: (p) => qc.setQueryData(keys.profile, p), onError: (e) => toast('error', err(e)),
  });
  const finish = useMutation({
    mutationFn: async () => {
      await put('/profiles/me/preferences', { ...pref, maxDistanceKm: undefined, languages: [], interests: [], verifiedOnly: false, activeRecently: false });
      return post<MyProfile>('/profiles/me/onboarding/complete');
    },
    onSuccess: async () => { await qc.invalidateQueries(); router.replace('/discover'); },
    onError: (e) => toast('error', err(e)),
  });

  const key = STEPS[step]!;
  const next = async () => {
    if ((key === 'about' || key === 'interests')) { try { await saveAbout.mutateAsync(about); } catch { return; } }
    if (key === 'photos' && profile.photos.length < 1) { toast('error', t('errors.PHOTO_REQUIRED')); return; }
    setStep((s) => s + 1);
  };

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-8">
      <div className="mb-6" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t('onboarding.progress', { n: step + 1, total: STEPS.length })}>
        <div className="flex gap-1.5">{STEPS.map((s, i) => <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-strong' : 'bg-line'}`} />)}</div>
        <p className="mt-2 text-sm text-muted">{t('onboarding.progress', { n: step + 1, total: STEPS.length })}</p>
      </div>
      <h1 className="text-3xl font-extrabold">{t(`onboarding.${key}.title`, { name: profile.displayName })}</h1>
      <p className="mt-2 mb-7 text-muted">{t(`onboarding.${key}.text`)}</p>

      {key === 'about' && <AboutFields value={about} onChange={setAbout} />}
      {key === 'interests' && <InterestPicker value={about.interests} onChange={(v) => setAbout({ ...about, interests: v })} />}
      {key === 'photos' && <PhotoManager photos={profile.photos} />}
      {key === 'prefs' && <PreferenceFields value={pref} onChange={setPref} limits={me.entitlement.limits} />}

      <div className="mt-10 flex justify-between gap-3">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}><ArrowLeft className="size-4" />{t('common.back')}</Button>
        {step < STEPS.length - 1
          ? <Button size="lg" onClick={next} loading={saveAbout.isPending}>{t('common.next')}<ArrowRight className="size-4" /></Button>
          : <Button size="lg" onClick={() => finish.mutate()} loading={finish.isPending}>{t('onboarding.finish')}</Button>}
      </div>
    </div>
  );
}
