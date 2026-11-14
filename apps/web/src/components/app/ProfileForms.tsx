'use client';
import { Compass, Crown, HeartHandshake, Smile, Sparkles, Users, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { COUNTRIES, countryFlag, EDUCATION, HABIT, INTENTS, INTEREST_SLUGS, LIVING, MARITAL, RELIGION, SEEKING, type Intent, type Living } from '@duomatch/types';
import { Button, ChoiceCards, Checkbox, cn, Field, Input, RangeSlider, Select, Textarea } from '@duomatch/ui';
import { Link } from '@/i18n/navigation';
import { CUSTOM_VALUE_MAX, isCatalogValue, LIFE_VALUES, MAX_LIFE_VALUES, valueIcon } from '@/lib/lifeValues';
import type { Limits, MyProfile } from '@/lib/types';
import { openCountries } from '@/lib/openCountries';
import { useLaunchCountries } from '@/hooks/useQueries';
import { CityInput } from '../CityInput';
import { CityMultiInput } from '../CityMultiInput';

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

/** Bague de fiançailles (lucide n'en propose pas) : même trait que les autres icônes de la liste. */
function RingIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <path d="M9.5 2.5h5l2 3-4.5 4-4.5-4z" /><path d="M7.5 5.5h9" /><circle cx="12" cy="16" r="5.5" />
    </svg>
  );
}
const INTENT_ICONS: Record<Intent, React.ReactNode> = { SERIOUS: <HeartHandshake />, MARRIAGE: <RingIcon />, DATING: <Users />, FRIENDSHIP: <Smile />, UNSURE: <Compass /> };

export interface AboutValue { bio: string; occupation: string; languages: string[]; intent: Intent; interests: string[]; city: string; country: string }
export const aboutFrom = (p: MyProfile): AboutValue => ({ bio: p.bio, occupation: p.occupation ?? '', languages: p.languages, intent: p.intent, interests: p.interests, city: p.city, country: p.country });

/** Saisie de la taille en mètres (« 1,65 ») ; la valeur enregistrée reste en centimètres (120 à 230). */
function HeightInput({ cm, onChange, ...p }: { cm: number | null; onChange: (cm: number | null) => void; id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) {
  const locale = useLocale();
  const fmt = (v: number | null) => (v ? new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v / 100) : '');
  const [text, setText] = useState(() => fmt(cm));
  return (
    <Input {...p} type="text" inputMode="decimal" placeholder={fmt(170)} value={text} aria-invalid={p['aria-invalid']}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseFloat(e.target.value.replace(',', '.'));
        if (!e.target.value.trim()) onChange(null);
        else if (n >= 1.2 && n <= 2.3) onChange(Math.round(n * 100));
      }} onBlur={() => setText(fmt(cm))} />
  );
}

export interface LifeValue {
  hasChildren: boolean | null; likesPets: boolean | null; living: Living | null; heightCm: number | null; originCountry: string | null;
  maritalStatus: string | null; education: string | null; smoking: string | null; alcohol: string | null; religion: string | null; showReligion: boolean; values: string[];
}
export const lifeFrom = (p: MyProfile): LifeValue => ({ hasChildren: p.hasChildren, likesPets: p.likesPets, living: p.living, heightCm: p.heightCm, originCountry: p.originCountry,
  maritalStatus: p.maritalStatus, education: p.education, smoking: p.smoking, alcohol: p.alcohol, religion: p.religion, showReligion: p.showReligion, values: p.values ?? [] });
const triValue = (v: boolean | null) => (v === null ? '' : v ? 'yes' : 'no');
const fromTri = (v: string): boolean | null => (v === '' ? null : v === 'yes');

/** Mode de vie (facultatif) : sert aux critères du menu Crush. Une information non renseignée n'est jamais devinée. */
export function LifestyleFields({ value, onChange }: { value: LifeValue; onChange: (v: LifeValue) => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const set = <K extends keyof LifeValue>(k: K, v: LifeValue[K]) => onChange({ ...value, [k]: v });
  const tri = (label: string, k: 'hasChildren' | 'likesPets') => (
    <Field label={label}>{(p) => <Select {...p} value={triValue(value[k])} onChange={(e) => set(k, fromTri(e.target.value))}><option value="">{t('life.unspecified')}</option><option value="yes">{t('life.yes')}</option><option value="no">{t('life.no')}</option></Select>}</Field>
  );
  const pick = (label: string, k: 'maritalStatus' | 'education' | 'smoking' | 'alcohol' | 'religion', opts: readonly string[], ns: string) => (
    <Field label={label}>{(p) => <Select {...p} value={value[k] ?? ''} onChange={(e) => set(k, e.target.value || null)}><option value="">{t('life.unspecified')}</option>{opts.map((o) => <option key={o} value={o}>{t(`${ns}.${o}` as never)}</option>)}</Select>}</Field>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {tri(t('life.hasChildren'), 'hasChildren')}
      {tri(t('life.likesPets'), 'likesPets')}
      <Field label={t('life.living')}>{(p) => <Select {...p} value={value.living ?? ''} onChange={(e) => set('living', (e.target.value || null) as Living | null)}><option value="">{t('life.unspecified')}</option>{LIVING.map((l) => <option key={l} value={l}>{t(`life.livingOpt.${l}`)}</option>)}</Select>}</Field>
      <Field label={t('life.height')} hint={t('life.heightHint')}>{(p) => <HeightInput {...p} cm={value.heightCm} onChange={(cm) => set('heightCm', cm)} />}</Field>
      <Field label={t('life.origin')}>{(p) => <Select {...p} value={value.originCountry ?? ''} onChange={(e) => set('originCountry', e.target.value || null)}><option value="">{t('life.unspecified')}</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
      {pick(t('life.marital'), 'maritalStatus', MARITAL, 'life.maritalOpt')}
      {pick(t('life.education'), 'education', EDUCATION, 'life.educationOpt')}
      {pick(t('life.smoking'), 'smoking', HABIT, 'life.habit')}
      {pick(t('life.alcohol'), 'alcohol', HABIT, 'life.habit')}
      {pick(t('life.religion'), 'religion', RELIGION, 'life.religionOpt')}
      {value.religion && (
        <div className="flex items-end sm:col-span-1"><Checkbox label={t('life.showReligion')} checked={value.showReligion} onChange={(e) => set('showReligion', e.target.checked)} /></div>
      )}
    </div>
  );
}

export function AboutFields({ value, onChange, withLocation }: { value: AboutValue; onChange: (v: AboutValue) => void; withLocation?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const launch = useLaunchCountries();
  const set = <K extends keyof AboutValue>(k: K, v: AboutValue[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-6">
      <Field label={t('profile.bio')} hideLabel hint={t('profile.bioHint', { n: value.bio.length })}>{(p) => <Textarea {...p} maxLength={500} value={value.bio} onChange={(e) => set('bio', e.target.value)} placeholder={t('profile.bioPlaceholder')} />}</Field>
      <Field label={t('profile.occupation')}>{(p) => <Input {...p} maxLength={80} value={value.occupation} onChange={(e) => set('occupation', e.target.value)} />}</Field>
      {withLocation && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.country')}>{(p) => <Select {...p} value={value.country} onChange={(e) => set('country', e.target.value)}>{openCountries(launch.data?.countries, [value.country]).map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
          <Field label={t('auth.city')}>{(p) => <CityInput {...p} country={value.country} value={value.city} onChange={(v) => set('city', v)} />}</Field>
        </div>
      )}
      <ChoiceCards legend={t('profile.intent')} value={value.intent} onChange={(v) => set('intent', v)} options={INTENTS.map((i) => ({ value: i, label: t(`intent.${i}`), hint: t(`intentHint.${i}`), icon: INTENT_ICONS[i] }))} />
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
const PREF_BASE: Omit<Pref, 'country' | 'city' | 'cities'> = { seeking: 'EVERYONE', ageMin: 18, ageMax: 60, intents: [], languages: [], interests: [], verifiedOnly: false, activeRecently: false, maxDistanceKm: null };
/** Par défaut : même pays que le profil, toutes villes. La préférence créée à l'inscription est vide, on la complète à l'onboarding. */
export const prefDefault = (p: MyProfile): Pref => ({ ...PREF_BASE, ...p.preference, country: p.preference?.country ?? (p.onboarded ? null : p.country), city: p.preference?.city ?? null,
  cities: p.preference?.cities?.length ? p.preference.cities : p.preference?.city ? [p.preference.city] : [] });

export function PreferenceFields({ value, onChange, limits }: { value: Pref; onChange: (v: Pref) => void; limits: Limits }) {
  const t = useTranslations();
  const launch = useLaunchCountries();
  const locale = useLocale();
  const set = <K extends keyof Pref>(k: K, v: Pref[K]) => onChange({ ...value, [k]: v });
  const locked = !limits.advancedFilters;
  const c = (k: string) => t(`prefs.crit.${value.seeking}.${k}` as never); // libellés au masculin / féminin / neutre selon la personne recherchée
  const premiumBadge = locked ? <Link href="/premium" className="ml-2 inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-semibold text-gold-ink"><Crown className="size-3" aria-hidden />{t('plans.PREMIUM.name')}</Link> : null;
  return (
    <div className="space-y-6">
      <fieldset><legend className="mb-2 text-sm font-medium">{t('prefs.seeking')}</legend>
        <div className="flex flex-wrap gap-2">{SEEKING.map((s) => <label key={s} className={cn('cursor-pointer rounded-full border px-4 py-2 text-sm font-medium has-[:checked]:border-brand-strong has-[:checked]:bg-brand-strong has-[:checked]:text-white', 'border-line')}><input type="radio" name="seeking" className="sr-only" checked={value.seeking === s} onChange={() => set('seeking', s)} />{t(`seeking.${s}`)}</label>)}</div>
      </fieldset>
      <RangeSlider label={c('age')} min={18} max={99} value={[value.ageMin, value.ageMax]} minLabel={t('prefs.ageMin')} maxLabel={t('prefs.ageMax')}
        valueText={t('live.ageBetween', { min: value.ageMin, max: value.ageMax })} onChange={([a, b]) => onChange({ ...value, ageMin: a, ageMax: b })} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={c('country')}>{(p) => <Select {...p} value={value.country ?? ''} onChange={(e) => set('country', e.target.value || null)}><option value="">{t('prefs.anyCountry')}</option>{openCountries(launch.data?.countries, [value.country]).map((c) => <option key={c.code} value={c.code}>{countryFlag(c.code)} {locale === 'en' ? c.en : c.fr}</option>)}</Select>}</Field>
        <Field label={c('city')} hint={t('prefs.cityHint')}>{(p) => <CityMultiInput {...p} country={value.country} value={value.cities} onChange={(v) => onChange({ ...value, cities: v, city: v[0] ?? null })} />}</Field>
      </div>
      <div className="space-y-2"><p className="text-sm font-medium">{c('intents')}</p><Chips label={c('intents')} options={INTENTS} value={value.intents} onChange={(v) => set('intents', v)} render={(i) => t(`intent.${i}`)} /></div>

      {locked && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-gold/15 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-gold-ink"><Crown className="mt-0.5 size-4 shrink-0" aria-hidden />{t('prefs.premiumUpsell')}</p>
          <Link href="/premium"><Button size="sm">{t('app.goPremium')}</Button></Link>
        </div>
      )}
      <fieldset disabled={locked} className={cn('space-y-5 rounded-3xl border border-dashed border-line p-5', locked && 'opacity-70')}>
        <legend className="px-2 text-sm font-bold">{t('prefs.advanced')}{premiumBadge}</legend>
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <label htmlFor="pref-distance" className="text-sm font-medium text-fg">{c('distance')}</label>
            <output className="text-sm font-semibold text-brand-ink" aria-live="polite">{value.maxDistanceKm == null ? t('prefs.distanceAny') : t('prefs.distanceValue', { km: value.maxDistanceKm })}</output>
          </div>
          <input id="pref-distance" type="range" min={5} max={500} step={5} value={value.maxDistanceKm ?? 500} aria-describedby="pref-distance-hint"
            onChange={(e) => set('maxDistanceKm', Number(e.target.value) >= 500 ? null : Number(e.target.value))} className="block h-8 w-full cursor-pointer accent-brand-strong" />
          <p id="pref-distance-hint" className="text-sm text-muted">{t('prefs.distanceHint')}</p>
        </div>
        <div className="space-y-2"><p className="text-sm font-medium">{c('languages')}</p><Chips label={c('languages')} options={LANGS} value={value.languages as (typeof LANGS)[number][]} onChange={(v) => set('languages', v)} render={(l) => t(`lang.${l}`)} /></div>
        <div className="space-y-2"><p className="text-sm font-medium">{c('interests')}</p><Chips label={c('interests')} options={INTEREST_SLUGS} value={value.interests as (typeof INTEREST_SLUGS)[number][]} onChange={(v) => set('interests', v)} render={(s) => t(`interest.${s}`)} /></div>
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
  <div className="sticky bottom-20 z-30 flex justify-end lg:bottom-20">{dirty && <Button size="lg" loading={loading} onClick={onSave} className="shadow-pop">{label}</Button>}</div>
);

/** « Ce qui compte le plus pour moi » : 3 valeurs au plus, du catalogue ou écrites par la personne. */
export function ValuesFields({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const t = useTranslations();
  const [custom, setCustom] = useState('');
  const full = value.length >= MAX_LIFE_VALUES;
  const toggle = (v: string) => onChange(value.includes(v) ? value.filter((x) => x !== v) : full ? value : [...value, v]);
  const text = custom.trim().replace(/\s+/g, ' ');
  const valid = text.length >= 2 && !/[0-9@]|http|www\./i.test(text) && !value.some((x) => x.toLowerCase() === text.toLowerCase());
  const add = () => { if (valid && !full) { onChange([...value, text]); setCustom(''); } };
  const label = (v: string) => (isCatalogValue(v) ? t(`values.${v}` as never) : v);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted" aria-live="polite">{t('values.count', { n: value.length, max: MAX_LIFE_VALUES })}</p>
      <ul className="flex flex-wrap gap-2">
        {LIFE_VALUES.map((v) => {
          const on = value.includes(v);
          const Icon = valueIcon(v);
          return <li key={v}><button type="button" aria-pressed={on} disabled={!on && full} onClick={() => toggle(v)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition disabled:opacity-50', on ? 'border-brand-strong bg-brand-strong text-white' : 'border-line bg-card hover:bg-soft')}><Icon className="size-4" aria-hidden />{t(`values.${v}` as never)}</button></li>;
        })}
        {value.filter((v) => !isCatalogValue(v)).map((v) => (
          <li key={v}><button type="button" aria-pressed onClick={() => toggle(v)} aria-label={t('values.remove', { name: v })} className="inline-flex items-center gap-1.5 rounded-full border border-brand-strong bg-brand-strong px-3.5 py-1.5 text-sm text-white"><Sparkles className="size-4" aria-hidden />{label(v)}<X className="size-3.5" aria-hidden /></button></li>
        ))}
      </ul>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1"><Field label={t('values.custom')} hint={t('values.customHint', { max: CUSTOM_VALUE_MAX })}>{(p) => <Input {...p} maxLength={CUSTOM_VALUE_MAX} autoComplete="off" disabled={full} value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />}</Field></div>
        <Button type="button" variant="outline" disabled={!valid || full} onClick={add}>{t('values.add')}</Button>
      </div>
    </div>
  );
}
