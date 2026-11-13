'use client';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Eye, Send, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { COUNTRIES, INTENTS } from '@duomatch/types';
import { Alert, Button, Card, Dialog, Field, Input, Select, Tabs, Textarea } from '@duomatch/ui';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { PageHeader } from '@/components/admin/PageParts';
import { useApiError } from '@/hooks/useApiError';
import { useRouter } from '@/i18n/navigation';
import { api, post, upload } from '@/lib/api';
import { useUi } from '@/lib/store';

type Mode = 'ALL' | 'EXCEPT' | 'SPECIFIC' | 'PROFILE' | 'FREE';
type Channel = 'EMAIL' | 'APP' | 'BOTH';
type Kind = 'SERVICE' | 'MARKETING';
interface Member { id: string; email: string; name: string }
const VARS = ['{{prénom}}', '{{ville}}'] as const;
const parseEmails = (s: string) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

/** Nouvel envoi : public, canal, objet, message mis en forme, variables, signature, planification ; aperçu et test avant l'envoi. */
export default function NewBroadcast() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [mode, setMode] = useState<Mode>('ALL');
  const [channel, setChannel] = useState<Channel>('EMAIL');
  const [kind, setKind] = useState<Kind>('MARKETING');
  const [emails, setEmails] = useState('');
  const [picked, setPicked] = useState<Member[]>([]);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ gender: '', country: '', plan: '', verified: '', intent: '', activeDays: '' });
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [signature, setSignature] = useState('');
  const [when, setWhen] = useState<'now' | 'later'>('now');
  const [at, setAt] = useState('');
  const [minAt] = useState(() => new Date(Date.now() + 120_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));  // heure locale, 2 minutes plus tard
  const [confirm, setConfirm] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);

  const effectiveKind: Kind = mode === 'FREE' ? 'SERVICE' : kind;  // des adresses libres n'ont aucun consentement enregistré : information du service seulement
  const audience = useMemo(() => {
    if (mode === 'EXCEPT') return { emails: parseEmails(emails) };
    if (mode === 'FREE') return { emails: parseEmails(emails) };
    if (mode === 'SPECIFIC') return { userIds: picked.map((m) => m.id) };
    if (mode === 'PROFILE') {
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(filters)) if (v !== '') f[k] = k === 'verified' ? v === 'yes' : k === 'activeDays' ? Number(v) : v;
      return { filters: f };
    }
    return {};
  }, [mode, emails, picked, filters]);
  const target = { audienceMode: mode, audience, channel, kind: effectiveKind };
  const ready = mode !== 'FREE' && mode !== 'SPECIFIC' ? true : mode === 'FREE' ? parseEmails(emails).length > 0 : picked.length > 0;
  const count = useQuery({ queryKey: ['admin', 'bc-audience', target], enabled: ready, retry: false, queryFn: () => post<{ count: number; sample: { email: string; name: string }[] }>('/admin/broadcasts/audience', target) });
  const members = useQuery({ queryKey: ['admin', 'bc-members', search], enabled: mode === 'SPECIFIC' && search.trim().length >= 2, queryFn: () => api<{ items: Member[] }>(`/admin/broadcasts/members?q=${encodeURIComponent(search.trim())}`) });
  const n = count.data?.count ?? 0;
  const content = { subject, body, signature };
  const scheduledAt = when === 'later' && at ? new Date(at).toISOString() : undefined;
  const valid = subject.trim() !== '' && body.trim() !== '' && ready && n > 0 && (when === 'now' || !!scheduledAt);

  const inline = useMutation({ mutationFn: (f: File) => upload<{ url: string }>('/admin/blog/images', f, f.name), onError: (e) => toast('error', err(e)) });
  const doPreview = useMutation({ mutationFn: () => post<{ subject: string; html: string }>('/admin/broadcasts/preview', content), onSuccess: setPreview, onError: (e) => toast('error', err(e)) });
  const test = useMutation({ mutationFn: () => post<{ ok: boolean; to: string }>('/admin/broadcasts/test', content), onSuccess: (r) => toast(r.ok ? 'success' : 'error', t(r.ok ? 'admin.bc.testSent' : 'admin.bc.testFailed', { to: r.to })), onError: (e) => toast('error', err(e)) });
  const send = useMutation({
    mutationFn: () => post<{ id: string }>('/admin/broadcasts', { ...content, ...target, when, scheduledAt, expectedRecipients: n }),
    onSuccess: () => { toast('success', t(when === 'now' ? 'admin.bc.started' : 'admin.bc.scheduled')); router.push('/admin/broadcasts'); },
    onError: (e) => { setConfirm(false); toast('error', err(e)); void count.refetch(); },
  });
  const tab = <K extends string>(label: string, value: K, onChange: (k: K) => void, items: readonly K[], text: (k: K) => string) => (
    <div className="space-y-1.5"><p className="text-sm font-medium">{label}</p><Tabs label={label} value={value} onChange={onChange} tabs={items.map((k) => ({ key: k, label: text(k) }))} /></div>
  );
  const when_ = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(iso));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('admin.bc.new')} description={t('admin.bc.newHelp')} />
      <Card className="space-y-6 p-5">
        {tab(t('admin.bc.audience'), mode, setMode, ['ALL', 'EXCEPT', 'SPECIFIC', 'PROFILE', 'FREE'] as const, (k) => t(`admin.bc.mode.${k}`))}

        {(mode === 'EXCEPT' || mode === 'FREE') && (
          <Field label={t(mode === 'EXCEPT' ? 'admin.bc.exceptLabel' : 'admin.bc.freeLabel')} hint={t('admin.bc.emailsHint')}>{(p) => <Textarea {...p} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="nom@exemple.com" />}</Field>
        )}
        {mode === 'SPECIFIC' && (
          <div className="space-y-3">
            <Field label={t('admin.bc.searchMember')}>{(p) => <Input {...p} type="search" autoComplete="off" value={search} onChange={(e) => setSearch(e.target.value)} />}</Field>
            {members.data && members.data.items.length > 0 && (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {members.data.items.filter((m) => !picked.some((x) => x.id === m.id)).map((m) => (
                  <li key={m.id}><button type="button" onClick={() => { setPicked([...picked, m]); setSearch(''); }} className="flex w-full justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-soft"><span className="font-medium">{m.name || '—'}</span><span className="text-muted">{m.email}</span></button></li>
                ))}
              </ul>
            )}
            {picked.length > 0 && <ul className="flex flex-wrap gap-2">{picked.map((m) => <li key={m.id}><span className="inline-flex items-center gap-1.5 rounded-full bg-soft px-3 py-1 text-sm">{m.name || m.email}<button type="button" aria-label={t('admin.bc.remove', { name: m.name || m.email })} onClick={() => setPicked(picked.filter((x) => x.id !== m.id))}><X className="size-3.5" aria-hidden /></button></span></li>)}</ul>}
          </div>
        )}
        {mode === 'PROFILE' && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t('admin.bc.f.gender')}>{(p) => <Select {...p} value={filters.gender} onChange={(e) => setFilters({ ...filters, gender: e.target.value })}><option value="">{t('admin.bc.any')}</option>{['MAN', 'WOMAN', 'NON_BINARY', 'OTHER'].map((g) => <option key={g} value={g}>{t(`gender.${g}` as never)}</option>)}</Select>}</Field>
            <Field label={t('admin.bc.f.country')}>{(p) => <Select {...p} value={filters.country} onChange={(e) => setFilters({ ...filters, country: e.target.value })}><option value="">{t('admin.bc.any')}</option>{COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</Select>}</Field>
            <Field label={t('admin.bc.f.plan')}>{(p) => <Select {...p} value={filters.plan} onChange={(e) => setFilters({ ...filters, plan: e.target.value })}><option value="">{t('admin.bc.any')}</option>{['FREE', 'PREMIUM', 'VIP', 'GOLD'].map((g) => <option key={g} value={g}>{g}</option>)}</Select>}</Field>
            <Field label={t('admin.bc.f.verified')}>{(p) => <Select {...p} value={filters.verified} onChange={(e) => setFilters({ ...filters, verified: e.target.value })}><option value="">{t('admin.bc.any')}</option><option value="yes">{t('admin.bc.yes')}</option><option value="no">{t('admin.bc.no')}</option></Select>}</Field>
            <Field label={t('admin.bc.f.intent')}>{(p) => <Select {...p} value={filters.intent} onChange={(e) => setFilters({ ...filters, intent: e.target.value })}><option value="">{t('admin.bc.any')}</option>{INTENTS.map((g) => <option key={g} value={g}>{t(`intent.${g}` as never)}</option>)}</Select>}</Field>
            <Field label={t('admin.bc.f.active')}>{(p) => <Select {...p} value={filters.activeDays} onChange={(e) => setFilters({ ...filters, activeDays: e.target.value })}><option value="">{t('admin.bc.any')}</option>{[7, 30, 90].map((d) => <option key={d} value={d}>{t('admin.bc.lastDays', { n: d })}</option>)}</Select>}</Field>
          </div>
        )}
        <p role="status" aria-live="polite" className="rounded-2xl bg-soft px-4 py-3 text-sm">
          {!ready ? t('admin.bc.chooseAudience') : count.isLoading ? t('admin.bc.counting') : count.isError ? t('admin.bc.countFailed') : <><strong>{t('admin.bc.recipients', { n })}</strong>{count.data && count.data.sample.length > 0 && <span className="text-muted"> — {count.data.sample.map((s) => s.name || s.email).join(', ')}{n > count.data.sample.length ? '…' : ''}</span>}</>}
        </p>

        {tab(t('admin.bc.channelLabel'), channel, setChannel, ['APP', 'EMAIL', 'BOTH'] as const, (k) => t(`admin.bc.channel.${k}`))}
        {mode === 'FREE' ? <p className="text-sm text-muted">{t('admin.bc.freeKind')}</p> : (
          <div className="space-y-1.5">{tab(t('admin.bc.kindLabel'), kind, setKind, ['MARKETING', 'SERVICE'] as const, (k) => t(`admin.bc.kind.${k}`))}<p className="text-sm text-muted">{t(`admin.bc.kindHelp.${kind}`)}</p></div>
        )}

        <Field label={t('admin.bc.subject')}>{(p) => <Input {...p} maxLength={150} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
        <div className="space-y-1.5">
          <p className="text-sm font-medium">{t('admin.bc.message')}</p>
          <RichTextEditor value={body} onChange={setBody} busy={inline.isPending} uploadImage={async (f) => (await inline.mutateAsync(f)).url} />
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">{t('admin.bc.insert')}{VARS.map((v) => <button key={v} type="button" onClick={() => setBody((b) => `${b}${b && !b.endsWith(' ') ? ' ' : ''}${v}`)} className="rounded-full border border-line px-3 py-1 font-mono text-xs text-fg hover:bg-soft">{v}</button>)}</p>
        </div>
        <Field label={t('admin.bc.signature')} hint={t('admin.bc.signatureHint')}>{(p) => <Textarea {...p} maxLength={300} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder={t('admin.bc.signaturePlaceholder')} />}</Field>

        {tab(t('admin.bc.when'), when, setWhen, ['now', 'later'] as const, (k) => t(`admin.bc.whenOpt.${k}`))}
        {when === 'later' && <Field label={t('admin.bc.at')} hint={t('admin.bc.atHint')}>{(p) => <Input {...p} type="datetime-local" value={at} min={minAt} onChange={(e) => setAt(e.target.value)} />}</Field>}

        <div className="flex flex-wrap gap-3">
          <Button disabled={!valid} onClick={() => setConfirm(true)}><Send className="size-4" aria-hidden />{n > 0 ? t('admin.bc.sendN', { n }) : t('admin.bc.send')}</Button>
          <Button variant="outline" disabled={!subject.trim() || !body.trim()} loading={doPreview.isPending} onClick={() => doPreview.mutate()}><Eye className="size-4" aria-hidden />{t('admin.bc.preview')}</Button>
          <Button variant="outline" disabled={!subject.trim() || !body.trim()} loading={test.isPending} onClick={() => test.mutate()}><Send className="size-4" aria-hidden />{t('admin.bc.test')}</Button>
          <Button variant="ghost" onClick={() => router.push('/admin/broadcasts')}>{t('common.cancel')}</Button>
        </div>
      </Card>

      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t('admin.bc.confirmTitle')} closeLabel={t('common.close')} dismissible={!send.isPending}>
        <div className="space-y-4">
          <p className="text-sm">{t('admin.bc.confirmText', { n, channel: t(`admin.bc.channel.${channel}`), when: when === 'later' && scheduledAt ? when_(scheduledAt) : t('admin.bc.immediately') })}</p>
          <p className="rounded-xl bg-soft px-3 py-2 text-sm font-semibold">{subject}</p>
          {effectiveKind === 'MARKETING' && <Alert variant="text">{t('admin.bc.consentNote')}</Alert>}
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setConfirm(false)} disabled={send.isPending}>{t('common.cancel')}</Button><Button onClick={() => send.mutate()} loading={send.isPending}>{when === 'later' ? t('admin.bc.schedule') : t('admin.bc.sendNow')}</Button></div>
        </div>
      </Dialog>
      <Dialog open={!!preview} onClose={() => setPreview(null)} title={preview?.subject ?? ''} closeLabel={t('common.close')} className="w-[min(96vw,44rem)]">
        {preview && <iframe title={t('admin.bc.preview')} sandbox="" srcDoc={preview.html} className="h-[70vh] w-full rounded-xl border border-line bg-white" />}
      </Dialog>
    </div>
  );
}
