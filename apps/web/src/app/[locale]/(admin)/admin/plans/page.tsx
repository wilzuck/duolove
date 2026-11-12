'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { DURATION_MONTHS, PLAN_FEATURE_KEYS, priceForDuration, type PlanFeatures } from '@duomatch/types';
import { Check, Minus, Pencil } from 'lucide-react';
import { Badge, Button, Card, DataTable, DataTableView, Dialog, Field, Input, Skeleton, Switch } from '@duomatch/ui';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { api, patch } from '@/lib/api';
import { formatXof } from '@/lib/format';
import { useUi } from '@/lib/store';

interface PlanRow { taglineFr: string | null; taglineEn: string | null; id: string; code: string; name: string; priceXof: number; active: boolean; featured: boolean; sortOrder: number; features: PlanFeatures; prices: { months: number; discountPercent: number; amountOverride: number | null; active: boolean }[] }
interface ProductRow { id: string; code: string; name: string; priceXof: number; quantity: number; active: boolean; kind: string }

const num = (v: string, fallback = 0) => (v === '' || Number.isNaN(Number(v)) ? fallback : Number(v));

/** Formulaire d'une formule : affiché dans la boîte de dialogue ouverte par « Modifier ». */
function PlanForm({ plan, onDone, onCancel }: { plan: PlanRow; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState(() => ({ taglineFr: plan.taglineFr ?? '', taglineEn: plan.taglineEn ?? '', name: plan.name, priceXof: plan.priceXof, active: plan.active, featured: plan.featured, sortOrder: plan.sortOrder, features: plan.features,
    prices: DURATION_MONTHS.map((m) => { const p = plan.prices.find((x) => x.months === m); return { months: m, discountPercent: p?.discountPercent ?? 0, amountOverride: p?.amountOverride ?? null, active: p?.active ?? true }; }) }));
  const save = useMutation({
    mutationFn: () => patch(`/admin/plans/${plan.code}`, { name: d.name, priceXof: d.priceXof, active: d.active, featured: d.featured, sortOrder: d.sortOrder, taglineFr: d.taglineFr, taglineEn: d.taglineEn, features: d.features, ...(plan.code === 'FREE' ? {} : { prices: d.prices }) }),
    onSuccess: () => { toast('success', t('admin.plans.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'plans'] }); void qc.invalidateQueries({ queryKey: ['plans'] }); onDone(); },
    onError: (e) => toast('error', err(e)),
  });
  const setF = <K extends keyof PlanFeatures>(k: K, v: PlanFeatures[K]) => setD({ ...d, features: { ...d.features, [k]: v } });
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-lg font-bold">{plan.code}<Badge tone={d.active ? 'success' : 'neutral'}>{d.active ? t('admin.plans.active') : t('admin.plans.inactive')}</Badge></h3>
        <div className="flex items-center gap-4 text-sm"><label className="flex items-center gap-2">{t('admin.plans.featured')}<Switch checked={d.featured} onChange={(v) => setD({ ...d, featured: v })} label={t('admin.plans.featured')} /></label>
          <label className="flex items-center gap-2">{t('admin.plans.active')}<Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('admin.plans.active')} /></label></div></div>
      {plan.code === 'FREE' && <p className="rounded-2xl bg-soft p-3 text-sm text-muted">{t('admin.plans.freeHint')}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={t('admin.plans.name')}>{(p) => <Input {...p} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
        <Field label={t('admin.plans.monthlyPrice')} hint={t('admin.plans.currencyHint')}>{(p) => <Input {...p} type="number" min={0} disabled={plan.code === 'FREE'} value={d.priceXof} onChange={(e) => setD({ ...d, priceXof: num(e.target.value) })} />}</Field>
        <Field label={t('admin.plans.order')}>{(p) => <Input {...p} type="number" min={0} value={d.sortOrder} onChange={(e) => setD({ ...d, sortOrder: num(e.target.value) })} />}</Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.plans.taglineFr')} hint={t('admin.plans.taglineHint')}>{(p) => <Input {...p} maxLength={120} value={d.taglineFr} onChange={(e) => setD({ ...d, taglineFr: e.target.value })} />}</Field>
        <Field label={t('admin.plans.taglineEn')}>{(p) => <Input {...p} maxLength={120} value={d.taglineEn} onChange={(e) => setD({ ...d, taglineEn: e.target.value })} />}</Field>
      </div>
      <fieldset className="space-y-3"><legend className="font-bold">{t('admin.plans.featuresTitle')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PLAN_FEATURE_KEYS.map((k) => {
            const v = d.features[k];
            return typeof v === 'boolean'
              ? <label key={k} title={k} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">{t(`admin.plans.fl.${k}` as never)}<Switch checked={v} onChange={(x) => setF(k, x as never)} label={t(`admin.plans.fl.${k}` as never)} /></label>
              : <Field key={k} label={t(`admin.plans.fl.${k}` as never)} hint={k === 'daily_likes_limit' ? t('admin.plans.unlimitedHint') : undefined}>{(p) => <Input {...p} type="number" min={k === 'daily_likes_limit' ? -1 : 0} value={v as number} onChange={(e) => setF(k, num(e.target.value) as never)} />}</Field>;
          })}
        </div>
      </fieldset>
      {plan.code !== 'FREE' && (
        <fieldset className="space-y-3"><legend className="font-bold">{t('admin.plans.durations')}</legend>
          <DataTable
            minWidth="34rem" className="rounded-2xl bg-transparent"
            columns={['months', 'discount', 'override', 'total', 'active'].map((h) => ({ key: h, header: t(`admin.plans.col.${h}`) }))}
          >
            <tbody>{d.prices.map((p, i) => (
              <tr key={p.months} className="border-b border-line last:border-0">
                <td className="px-3 py-2 font-semibold">{t('plans.months', { n: p.months })}</td>
                <td className="px-3 py-2"><Input aria-label={t('admin.plans.col.discount')} type="number" min={0} max={90} className="h-10 w-24" value={p.discountPercent} onChange={(e) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, discountPercent: num(e.target.value) } : x)) })} /></td>
                <td className="px-3 py-2"><Input aria-label={t('admin.plans.col.override')} type="number" min={0} className="h-10 w-32" placeholder="—" value={p.amountOverride ?? ''} onChange={(e) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, amountOverride: e.target.value === '' ? null : num(e.target.value) } : x)) })} /></td>
                <td className="px-3 py-2 font-semibold">{formatXof(priceForDuration(d.priceXof, p.months, p.discountPercent, p.amountOverride), locale)}</td>
                <td className="px-3 py-2"><Switch checked={p.active} onChange={(v) => setD({ ...d, prices: d.prices.map((x, j) => (j === i ? { ...x, active: v } : x)) })} label={t('admin.plans.col.active')} /></td>
              </tr>))}</tbody></DataTable>
          <p className="text-xs text-muted">{t('admin.plans.contractNote')}</p>
        </fieldset>
      )}
      <div className="sticky bottom-0 -mx-1 flex justify-end gap-2 bg-card px-1 pt-3"><Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>{t('common.cancel')}</Button><Button type="submit" loading={save.isPending}>{t('common.save')}</Button></div>
    </form>
  );
}

/** Valeur lisible d'une fonctionnalité : ✓ / — pour un interrupteur, nombre (ou « Illimité ») pour un quota. */
function FeatureValue({ k, v }: { k: keyof PlanFeatures; v: PlanFeatures[keyof PlanFeatures] }) {
  const t = useTranslations();
  if (typeof v === 'boolean') {
    return v ? <span className="inline-flex items-center gap-1 font-semibold text-success-ink"><Check className="size-4" aria-hidden />{t('admin.plans.on')}</span>
      : <span className="inline-flex items-center gap-1 text-muted"><Minus className="size-4" aria-hidden />{t('admin.plans.off')}</span>;
  }
  return <span className="font-semibold">{k === 'daily_likes_limit' && v === -1 ? t('admin.plans.unlimited') : v}</span>;
}

/** Une formule telle qu'enregistrée, en lecture seule ; le formulaire s'ouvre avec « Modifier ». */
function PlanCard({ plan }: { plan: PlanRow }) {
  const t = useTranslations();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <Card className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold">{plan.name}<code className="rounded-md bg-soft px-1.5 py-0.5 text-xs font-semibold text-brand-ink">{plan.code}</code>
            <Badge tone={plan.active ? 'success' : 'neutral'}>{plan.active ? t('admin.plans.active') : t('admin.plans.inactive')}</Badge>
            {plan.featured && <Badge tone="brand">{t('admin.plans.featured')}</Badge>}</h2>
          <p className="mt-1 text-sm text-muted">{plan.priceXof === 0 ? t('admin.plans.free') : t('admin.plans.perMonth', { price: formatXof(plan.priceXof, locale) })} · {t('admin.plans.order')} : {plan.sortOrder}</p>
        </div>
        <Button variant="outline" onClick={() => setOpen(true)}><Pencil className="size-4" aria-hidden />{t('admin.plans.edit')}</Button>
      </div>
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="text-xs font-medium text-muted">{t('admin.plans.taglineFr')}</dt><dd>{plan.taglineFr || <span className="text-muted">{t('admin.plans.taglineDefault')}</span>}</dd></div>
        <div><dt className="text-xs font-medium text-muted">{t('admin.plans.taglineEn')}</dt><dd>{plan.taglineEn || <span className="text-muted">{t('admin.plans.taglineDefault')}</span>}</dd></div>
      </dl>
      <section aria-label={t('admin.plans.featuresTitle')}>
        <h3 className="mb-2 text-sm font-bold">{t('admin.plans.featuresTitle')}</h3>
        <dl className="grid gap-x-8 sm:grid-cols-2">
          {PLAN_FEATURE_KEYS.map((k) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-line py-1.5 text-sm"><dt className="text-muted">{t(`admin.plans.fl.${k}` as never)}</dt><dd><FeatureValue k={k} v={plan.features[k]} /></dd></div>
          ))}
        </dl>
      </section>
      {plan.code !== 'FREE' && plan.prices.length > 0 && (
        <section aria-label={t('admin.plans.durations')}>
          <h3 className="mb-2 text-sm font-bold">{t('admin.plans.durations')}</h3>
          <ul className="flex flex-wrap gap-2 text-sm">
            {DURATION_MONTHS.map((m) => { const p = plan.prices.find((x) => x.months === m); if (!p) return null; return (
              <li key={m} className={`rounded-2xl border border-line px-3 py-2 ${p.active ? '' : 'opacity-50'}`}>
                <span className="font-semibold">{t('plans.months', { n: m })}</span>{p.discountPercent > 0 && <Badge tone="gold" className="ml-1.5">−{p.discountPercent} %</Badge>}
                <span className="block text-muted">{formatXof(priceForDuration(plan.priceXof, m, p.discountPercent, p.amountOverride), locale)}{!p.active && ` · ${t('admin.plans.hidden')}`}</span>
              </li>); })}
          </ul>
        </section>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('admin.plans.editTitle', { name: plan.name })} closeLabel={t('common.close')} className="w-[min(96vw,48rem)]">
        {open && <div className="max-h-[75dvh] overflow-y-auto pr-1"><PlanForm plan={plan} onDone={() => setOpen(false)} onCancel={() => setOpen(false)} /></div>}
      </Dialog>
    </Card>
  );
}

/** Formulaire d'un pack, dans une boîte de dialogue. */
function ProductForm({ product, onDone, onCancel }: { product: ProductRow; onDone: () => void; onCancel: () => void }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [d, setD] = useState({ name: product.name, priceXof: product.priceXof, quantity: product.quantity, active: product.active });
  const save = useMutation({
    mutationFn: () => patch(`/admin/products/${product.code}`, d),
    onSuccess: () => { toast('success', t('admin.plans.saved')); void qc.invalidateQueries({ queryKey: ['admin', 'plans'] }); void qc.invalidateQueries({ queryKey: ['plans'] }); onDone(); },
    onError: (e) => toast('error', err(e)),
  });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <Field label={t('admin.plans.name')}>{(p) => <Input {...p} required value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('admin.plans.quantity')}>{(p) => <Input {...p} type="number" min={1} value={d.quantity} onChange={(e) => setD({ ...d, quantity: num(e.target.value, 1) })} />}</Field>
        <Field label={t('admin.plans.price')}>{(p) => <Input {...p} type="number" min={0} value={d.priceXof} onChange={(e) => setD({ ...d, priceXof: num(e.target.value) })} />}</Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3 text-sm">{t('admin.plans.active')}<Switch checked={d.active} onChange={(v) => setD({ ...d, active: v })} label={t('admin.plans.active')} /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onCancel} disabled={save.isPending}>{t('common.cancel')}</Button><Button type="submit" loading={save.isPending}>{t('common.save')}</Button></div>
    </form>
  );
}

export default function AdminPlans() {
  const t = useTranslations();
  const locale = useLocale();
  const tableLabels = useTableLabels();
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const q = useQuery({ queryKey: ['admin', 'plans'], queryFn: () => api<{ plans: PlanRow[]; products: ProductRow[] }>('/admin/plans') });
  if (!q.data) return <Skeleton className="h-96" />;
  return (
    <div className="space-y-8">
      <p className="text-sm text-muted">{t('admin.plans.intro')}</p>
      {q.data.plans.map((p) => <PlanCard key={p.code} plan={p} />)}
      <section aria-labelledby="pr"><h2 id="pr" className="mb-3 text-lg font-bold">{t('admin.plans.productsTitle')}</h2>
        <DataTableView
          minWidth="36rem" rows={q.data.products} rowKey={(p) => p.code} labels={tableLabels} exportName="packs"
          rowActions={(p) => [{ label: t('admin.plans.edit'), icon: <Pencil className="size-4" aria-hidden />, onSelect: () => setEditing(p) }]}
          columns={[
            { key: 'name', header: t('admin.plans.name'), value: (p) => `${p.name} ${p.code}`, cell: (p) => <>{p.name}<code className="block text-xs text-muted">{p.code}</code></> },
            { key: 'quantity', header: t('admin.plans.quantity'), value: (p) => p.quantity, cell: (p) => p.quantity },
            { key: 'price', header: t('admin.plans.price'), value: (p) => p.priceXof, cell: (p) => formatXof(p.priceXof, locale) },
            { key: 'active', header: t('admin.plans.active'), value: (p) => (p.active ? 'on' : 'off'), filter: { options: [{ value: 'on', label: t('admin.plans.active') }, { value: 'off', label: t('admin.plans.inactive') }] }, cell: (p) => <Badge tone={p.active ? 'success' : 'neutral'}>{p.active ? t('admin.plans.active') : t('admin.plans.inactive')}</Badge> },
          ]}
        />
      </section>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing ? t('admin.plans.editProductTitle', { name: editing.name }) : ''} closeLabel={t('common.close')}>
        {editing && <ProductForm key={editing.code} product={editing} onDone={() => setEditing(null)} onCancel={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
