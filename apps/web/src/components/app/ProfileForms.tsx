'use client';
import { Crown } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { COUNTRIES, INTENTS, INTEREST_SLUGS, LIVING, SEEKING, type Intent, type Living } from '@duomatch/types';
import { Button, Checkbox, cn, Field, Input, Select, Textarea } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import type { Limits, MyProfile } from '@/lib/types';

export const LANGS = ['fr', 'en', 'fon', 'yo', 'ee', 'wo', 'ha', 'sw', 'ar', 'pt'] as const;

export function Chips<T extends string>({ options, value, onChange, max, label, render }: { options: readonly T[]; value: T[]; onChange: (v: T[]) => void; max?: number; label: string; render: (o: T) => string }) {
  const toggle = (o: T) => onChange(value.includes(o) ? value.filter((x) => x !== o) : max && value.length >= max ? value : [...value, o]);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)} className={cn('rounded-full border px-4 py-2 text-sm font-medium transition', on ? 'border-brand-strong bg-brand-strong text-white' : 'border-line bg-card hover:bg-soft')}>{render(o)}</button>;
      })}
    </div>
  );
}

export interface AboutValue { bio: string; occupation: string; languages: string[]; intent: Intent; interests: string[]; city: string; country: string }
export const aboutFrom = (p: MyProfile): AboutValue => ({ bio: p.bio, occupation: p.occupation ?? '', languages: p.languages, intent: p.intent, interests: p.interests, city: p.city, country: p.country });

export interface LifeValue { hasChildren: boolean | null; likesPets: boolean | null; living: Living | null; heightCm: number | null; originCountry: string | null }
export const lifeFrom = (p: MyProfile): LifeValue => ({ hasChildren: p.hasChildren, likesPets: p.likesPets, living: p.living, heightCm: p.heightCm, originCountry: p.originCountry });
const triValue = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const fromTri = (v: string): boolean | null => (v === '' ? null : v === 'yes');

/** Mode de vie (facultatif) : sert aux critères du menu Match. Une information non renseignée n'est jamais devinée. */
export function LifestyleFields({ value, onChange }: { value: LifeValue; onChange: (v: LifeValue) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const set = <K extends keyof LifeValue>(k: K, v: LifeValue[K]) => onChange({ ...value, [k]: v });
  const tri = (label: string, k: 'hasChildren' | 'likesPets') => (
    <Field label={label}>{(p) => <Select {...p} value={triValue(value[k])} onChange={(e) => set(k, fromTri(e.target.value))}><option value="">{t('life.unspecified')}</option><option value="yes">{t('life.yes')}</option><option value="no">{t('life.no')}</option></Select>}</Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tri(t('life.hasChildren'), 'hasChildren')}
      {tri(t('life.likesPets'), 'likesPets')}
      <Field label={t('life.living')}>{(p) => <Select {...p} value={value.living ?? ''} onChange={(e) => set('living', (e.target.value || null) as Living | null)}><option value="">{t('life.unspecified')}</option>{LIVING.map((l) => <option key={l} value={l}>{t(`life.livingOpt.${l}`)}</option>)}</Select>}</Field>
      <Field label={t('life.height')} hint={t('life.heightHint')}>{(p) => <Input {...p} type="number" inputMode="numeric" min={120} max={230} value={value.heightCm ?? ''} onChange={(e) => set('heightCm', e.target.value ? Number(e.target.value) : null)} />}</Field>
      <Field label={t('life.origin')}>{(p) => <Select {...p} value={value.originCountry ?? ''} onChange={(e) => set('originCountry', e.target.value || null)}><option value="">{t('life.unspecified')}</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
    </div>
  );
}

export function AboutFields({ value, onChange, withLocation }: { value: AboutValue; onChange: (v: AboutValue) => void; withLocation?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const set = <K extends keyof AboutValue>(k: K, v: AboutValue[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-6">
      <Field label={t('profile.bio')} hint={t('profile.bioHint', { n: value.bio.length })}>{(p) => <Textarea {...p} maxLength={500} value={value.bio} onChange={(e) => set('bio', e.target.value)} placeholder={t('profile.bioPlaceholder')} />}</Field>
      <Field label={t('profile.occupation')}>{(p) => <Input {...p} maxLength={80} value={value.occupation} onChange={(e) => set('occupation', e.target.value)} />}</Field>
      {withLocation && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.country')}>{(p) => <Select {...p} value={value.country} onChange={(e) => set('country', e.target.value)}>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
          <Field label={t('auth.city')}>{(p) => <Input {...p} value={value.city} onChange={(e) => set('city', e.target.value)} />}</Field>
        </div>
      )}
      <fieldset className="space-y-2"><legend className="text-sm font-medium">{t('profile.intent')}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {INTENTS.map((i) => (
            <label key={i} className={cn('flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition has-[:checked]:border-brand-strong has-[:checked]:bg-soft', 'border-line')}>
              <input type="radio" name="intent" className="mt-1 accent-brand-strong" checked={value.intent === i} onChange={() => set('intent', i)} />
              <span><span className="block font-semibold">{t(`intent.${i}`)}</span><span className="text-sm text-muted">{t(`intentHint.${i}`)}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2"><p className="text-sm font-medium">{t('profile.languages')}</p><Chips label={t('profile.languages')} options={LANGS} value={value.languages as (typeof LANGS)[number][]} onChange={(v) => set('languages', v)} max={8} render={(l) => t(`lang.${l}`)} /></div>
    </div>
  );
}

export function InterestPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations();
  return (
    <div className="space-y-3">
      <Chips label={t('profile.interests')} options={INTEREST_SLUGS} value={value as (typeof INTEREST_SLUGS)[number][]} onChange={onChange} max={10} render={(s) => t(`interest.${s}`)} />
      <p className="text-sm text-muted" aria-live="polite">{t('profile.interestsCount', { n: value.length })}</p>
    </div>
  );
}

type Pref = NonNullable<MyProfile['preference']>;
const PREF_BASE: Omit<Pref, 'country' | 'city'> = { seeking: 'EVERYONE', ageMin: 18, ageMax: 60, intents: [], languages: [], interests: [], verifiedOnly: false, activeRecently: false, maxDistanceKm: null };
/** Par défaut : même pays que le profil, toutes villes. La préférence créée à l'inscription est vide, on la complète à l'onboarding. */
export const prefDefault = (p: MyProfile): Pref => ({ ...PREF_BASE, ...p.preference, country: p.preference?.country ?? (p.onboarded ? null : p.country), city: p.preference?.city ?? null });

export function PreferenceFields({ value, onChange, limits }: { value: Pref; onChange: (v: Pref) => void; limits: Limits }) {
  const t = useTranslations();
  const locale = useLocale();
  const set = <K extends keyof Pref>(k: K, v: Pref[K]) => onChange({ ...value, [k]: v });
  const locked = !limits.advancedFilters;
  const premiumBadge = locked ? <Link href="/premium" className="ml-2 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold-ink"><Crown className="size-3" aria-hidden />{t('plans.PREMIUM.name')}</Link> : null;
  return (
    <div className="space-y-6">
      <fieldset><legend className="mb-2 text-sm font-medium">{t('prefs.seeking')}</legend>
        <div className="flex flex-wrap gap-2">{SEEKING.map((s) => <label key={s} className={cn('cursor-pointer rounded-full border px-4 py-2 text-sm font-medium has-[:checked]:border-brand-strong has-[:checked]:bg-brand-strong has-[:checked]:text-white', 'border-line')}><input type="radio" name="seeking" className="sr-only" checked={value.seeking === s} onChange={() => set('seeking', s)} />{t(`seeking.${s}`)}</label>)}</div>
      </fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-medium">{t('prefs.ageRange', { min: value.ageMin, max: value.ageMax })}</legend>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t('prefs.ageMin')}>{(p) => <Input {...p} type="number" min={18} max={99} value={value.ageMin} onChange={(e) => { const n = Math.min(99, Math.max(18, Number(e.target.value) || 18)); onChange({ ...value, ageMin: n, ageMax: Math.max(n, value.ageMax) }); }} />}</Field>
          <Field label={t('prefs.ageMax')}>{(p) => <Input {...p} type="number" min={18} max={99} value={value.ageMax} onChange={(e) => { const n = Math.min(99, Math.max(18, Number(e.target.value) || 18)); onChange({ ...value, ageMax: n, ageMin: Math.min(n, value.ageMin) }); }} />}</Field>
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('prefs.country')}>{(p) => <Select {...p} value={value.country ?? ''} onChange={(e) => set('country', e.target.value || null)}><option value="">{t('prefs.anyCountry')}</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
        <Field label={t('prefs.city')} hint={t('prefs.cityHint')}>{(p) => <Input {...p} value={value.city ?? ''} onChange={(e) => set('city', e.target.value || null)} />}</Field>
      </div>
      <div className="space-y-2"><p className="text-sm font-medium">{t('prefs.intents')}</p><Chips label={t('prefs.intents')} options={INTENTS} value={value.intents} onChange={(v) => set('intents', v)} render={(i) => t(`intent.${i}`)} /></div>

      {locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gold/15 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-gold-ink"><Crown className="mt-0.5 size-4 shrink-0" aria-hidden />{t('prefs.premiumUpsell')}</p>
          <Link href="/premium"><Button size="sm">{t('app.goPremium')}</Button></Link>
        </div>
      )}
      <fieldset disabled={locked} className={cn('space-y-5 rounded-3xl border border-dashed border-line p-5', locked && 'opacity-70')}>
        <legend className="px-2 text-sm font-bold">{t('prefs.advanced')}{premiumBadge}</legend>
        <Field label={t('prefs.distance')} hint={t('prefs.distanceHint')}>{(p) => <Input {...p} type="number" min={5} max={500} step={5} value={value.maxDistanceKm ?? ''} onChange={(e) => set('maxDistanceKm', e.target.value ? Number(e.target.value) : null)} />}</Field>
        <div className="space-y-2"><p className="text-sm font-medium">{t('prefs.languages')}</p><Chips label={t('prefs.languages')} options={LANGS} value={value.languages as (typeof LANGS)[number][]} onChange={(v) => set('languages', v)} render={(l) => t(`lang.${l}`)} /></div>
        <div className="space-y-2"><p className="text-sm font-medium">{t('prefs.interests')}</p><Chips label={t('prefs.interests')} options={INTEREST_SLUGS} value={value.interests as (typeof INTEREST_SLUGS)[number][]} onChange={(v) => set('interests', v)} render={(s) => t(`interest.${s}`)} /></div>
        <Checkbox align="center" label={t('prefs.verifiedOnly')} checked={value.verifiedOnly} onChange={(e) => set('verifiedOnly', e.target.checked)} />
        <Checkbox align="center" label={t('prefs.activeRecently')} checked={value.activeRecently} onChange={(e) => set('activeRecently', e.target.checked)} />
      </fieldset>
    </div>
  );
}

export function useDirty<T>(initial: T | undefined) {
  const [draft, setDraft] = useState<T | undefined>(undefined);
  return { value: (draft ?? initial) as T, set: setDraft, dirty: draft !== undefined, reset: () => setDraft(undefined) };
}
export const SaveBar = ({ dirty, loading, label, onSave }: { dirty: boolean; loading: boolean; label: string; onSave: () => void }) => (
  <div className="sticky bottom-20 z-20 flex justify-end lg:bottom-4">{dirty && <Button size="lg" loading={loading} onClick={onSave} className="shadow-pop">{label}</Button>}</div>
);
