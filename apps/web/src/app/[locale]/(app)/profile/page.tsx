'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, Camera, Crown, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { Badge, Button, Card, Skeleton } from '@duomatch/ui';
import { PhotoManager } from '@/components/app/PhotoManager';
import { ProfileTips } from '@/components/app/ProfileTips';
import { PromptsEditor } from '@/components/app/PromptsEditor';
import { AboutFields, InterestPicker, LifestyleFields, PreferenceFields, SaveBar, ValuesFields, aboutFrom, lifeFrom, prefDefault, type AboutValue, type LifeValue } from '@/components/app/ProfileForms';
import { useApiError } from '@/hooks/useApiError';
import { keys, useMe, useMyProfile } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { patch, put, upload } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { MyProfile } from '@/lib/types';
import { SectionTabs } from '@/components/app/SectionTabs';

export default function ProfilePage() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const { data: me } = useMe();
  const { data: p } = useMyProfile();
  const [about, setAbout] = useState<AboutValue | null>(null);
  const [life, setLife] = useState<LifeValue | null>(null);
  const [pref, setPref] = useState<ReturnType<typeof prefDefault> | null>(null);
  const selfie = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: async () => {
      let next = p!;
      if (about) next = await patch<MyProfile>('/profiles/me', { bio: about.bio, occupation: about.occupation || undefined, languages: about.languages, intent: about.intent, interests: about.interests, country: about.country, city: about.city });
      if (life) next = await patch<MyProfile>('/profiles/me', life);
      if (pref) next = await put<MyProfile>('/profiles/me/preferences', pref);
      return next;
    },
    onSuccess: (n) => { qc.setQueryData(keys.profile, n); setAbout(null); setLife(null); setPref(null); void qc.invalidateQueries({ queryKey: ['feed'] }); toast('success', t('profile.saved')); },
    onError: (e) => toast('error', err(e)),
  });
  const verify = useMutation({ mutationFn: (f: File) => upload('/profiles/me/verification', f, f.name), onSuccess: () => { void qc.invalidateQueries({ queryKey: keys.profile }); toast('success', t('profile.verifySent')); }, onError: (e) => toast('error', err(e)) });

  if (!p || !me) return <div className="mx-auto max-w-2xl space-y-4 p-4"><Skeleton className="h-28" /><Skeleton className="h-96" /></div>;
  const a = about ?? aboutFrom(p);
  const lf = life ?? lifeFrom(p);
  const pr = pref ?? prefDefault(p);
  const boosted = p.boostedUntil && new Date(p.boostedUntil) > new Date();

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-4">
      <SectionTabs />
      <div className="flex items-center justify-between"><h1 className="text-2xl font-extrabold">{t('app.nav.profile')}</h1><Link href={`/profile/${p.id}`} className="hidden" aria-hidden /></div>

      <Card className={me.entitlement.plan === 'FREE' ? 'flex flex-wrap items-center justify-between gap-4 border-brand/30 bg-linear-to-br from-soft to-card p-5' : 'flex flex-wrap items-center justify-between gap-4 p-5'}>
        <div className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white"><Crown className="size-5" aria-hidden /></span>
          <div><h2 className="font-bold">{t.rich('profile.planTitle', { plan: t(`plans.${me.entitlement.plan}.name`), p: (c) => <span className={me.entitlement.plan === 'VIP' ? 'text-gold-ink' : me.entitlement.plan === 'PREMIUM' ? 'text-brand-ink' : 'text-muted'}>{c}</span> })}</h2><p className="text-sm text-muted">{me.entitlement.plan === 'FREE' ? t('profile.planFreeText') : t('profile.planPaidText')}</p></div></div>
        <Link href={me.entitlement.plan === 'FREE' ? '/premium' : '/settings?tab=subscription'}><Button variant={me.entitlement.plan === 'FREE' ? 'primary' : 'outline'}>{me.entitlement.plan === 'FREE' ? t('app.goPremium') : t('profile.planManage')}</Button></Link>
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between"><h2 className="font-bold">{t('profile.completeness')}</h2><Badge tone={p.completenessLevel === 'COMPLETE' ? 'success' : 'brand'}>{t(`profile.level.${p.completenessLevel}`)}</Badge></div>
        <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={p.completeness} aria-valuemin={0} aria-valuemax={100} aria-label={t('profile.completeness')}><div className="h-full rounded-full bg-linear-to-r from-brand-2 to-brand-strong transition-all" style={{ width: `${p.completeness}%` }} /></div>
        {p.completeness < 100 && <p className="text-sm text-muted">{t('profile.completenessTip')}</p>}
      </Card>

      <ProfileTips />
      <Card id="photos" className="scroll-mt-20 space-y-4 p-5"><h2 className="font-bold">{t('profile.photos')}</h2><PhotoManager photos={p.photos} /></Card>
      <Card id="about" className="scroll-mt-20 space-y-4 p-5"><h2 className="font-bold">{t('profile.about')}</h2><AboutFields value={a} onChange={setAbout} withLocation /></Card>
      <Card id="values" className="scroll-mt-20 space-y-4 p-5"><div><h2 className="font-bold">{t('values.title')}</h2><p className="text-sm text-muted">{t('values.hint')}</p></div><ValuesFields value={lf.values} onChange={(v) => setLife({ ...lf, values: v })} /></Card>
      <Card className="space-y-4 p-5"><div><h2 className="font-bold">{t('life.title')}</h2><p className="text-sm text-muted">{t('life.hint')}</p></div><LifestyleFields value={lf} onChange={setLife} /></Card>
      <Card id="interests" className="scroll-mt-20 space-y-4 p-5"><h2 className="font-bold">{t('profile.interests')}</h2><InterestPicker value={a.interests} onChange={(v) => setAbout({ ...a, interests: v })} /></Card>
      <PromptsEditor />
      <Card id="filters" className="scroll-mt-20 space-y-4 p-5"><h2 className="font-bold">{t('prefs.title')}</h2><PreferenceFields value={pr} onChange={setPref} limits={me.entitlement.limits} /></Card>

      <Card id="verification" className="scroll-mt-20 space-y-3 p-5">
        <h2 className="flex items-center gap-2 font-bold"><BadgeCheck className="size-5 text-sky-500" aria-hidden />{t('profile.verification')}</h2>
        {p.verified ? <Badge tone="success">{t('profile.verified')}</Badge> : p.verificationPending ? <p role="status" className="text-sm text-muted">{t('profile.verifyPending')}</p> : (
          <>
            <p className="text-sm text-muted">{t('profile.verifyText')}</p>
            <Button variant="outline" onClick={() => selfie.current?.click()} loading={verify.isPending}><Camera className="size-4" aria-hidden />{t('profile.verifyCta')}</Button>
            <input ref={selfie} type="file" accept="image/jpeg,image/png,image/webp" capture="user" aria-hidden className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) verify.mutate(f); e.target.value = ''; }} />
          </>
        )}
      </Card>

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><h2 className="flex items-center gap-2 font-bold"><Rocket className="size-5 text-brand" aria-hidden />{t('profile.boost')}</h2><p className="text-sm text-muted">{boosted ? t('profile.boostActive') : t('profile.boostShopText')}</p></div>
        <Link href="/shop"><Button variant="outline">{t('profile.boostCta')}</Button></Link>
      </Card>
      <SaveBar dirty={!!about || !!life || !!pref} loading={save.isPending} label={t('common.save')} onSave={() => save.mutate()} />
    </div>
  );
}
