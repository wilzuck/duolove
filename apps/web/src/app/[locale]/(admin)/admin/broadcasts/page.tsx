'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Send } from 'lucide-react';
import { useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge, Card, DataTableView, Skeleton, buttonVariants } from '@duomatch/ui';
import { PageHeader } from '@/components/admin/PageParts';
import { useAdminList } from '@/hooks/useAdmin';
import { useApiError } from '@/hooks/useApiError';
import { useTableLabels } from '@/hooks/useTableLabels';
import { Link } from '@/i18n/navigation';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';

type Status = 'SCHEDULED' | 'SENDING' | 'SENT' | 'CANCELED' | 'FAILED';
interface Row { id: string; subject: string; status: Status; channel: 'EMAIL' | 'APP' | 'BOTH'; kind: 'SERVICE' | 'MARKETING'; audienceMode: string; scheduledAt: string; sentAt: string | null; recipients: number; sent: number; failed: number; error: string | null; createdAt: string }
interface Detail extends Row { body: string; signature: string }
const TONE: Record<Status, 'success' | 'brand' | 'neutral' | 'danger'> = { SENT: 'success', SENDING: 'brand', SCHEDULED: 'brand', CANCELED: 'neutral', FAILED: 'danger' };

/** Contenu du message envoyé (chargé à l'ouverture du détail d'une ligne). */
function Body({ id }: { id: string }) {
  const t = useTranslations();
  const q = useQuery({ queryKey: ['admin', 'broadcast', id], queryFn: () => api<Detail>(`/admin/broadcasts/${id}`) });
  if (!q.data) return <Skeleton className="h-24" />;
  return (
    <section className="space-y-2 border-t border-line pt-4">
      <h3 className="font-bold">{t('admin.bc.message')}</h3>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-soft p-3 font-sans text-sm">{q.data.body}{q.data.signature ? `\n\n${q.data.signature}` : ''}</pre>
      {q.data.error && <p className="text-sm text-danger-ink">{q.data.error}</p>}
    </section>
  );
}

/** Envois de l'administration : e-mails et annonces dans l'application, immédiats ou planifiés. */
export default function AdminBroadcasts() {
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const labels = useTableLabels();
  const list = useAdminList<Row>(['broadcasts'], '/admin/broadcasts');
  const busy = list.items.some((b) => b.status === 'SENDING' || b.status === 'SCHEDULED');
  // Envois en cours ou planifiés : la liste se rafraîchit toute seule (compteurs, passage à « Envoyé »).
  useEffect(() => { if (!busy) return; const id = setInterval(() => void qc.invalidateQueries({ queryKey: ['admin', 'broadcasts'] }), 4000); return () => clearInterval(id); }, [busy, qc]);
  const cancel = useMutation({ mutationFn: (id: string) => post(`/admin/broadcasts/${id}/cancel`), onSuccess: () => { toast('success', t('admin.bc.canceled')); void qc.invalidateQueries({ queryKey: ['admin'] }); }, onError: (e) => toast('error', err(e)) });
  const date = (iso: string) => new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso.endsWith('Z') ? iso : `${iso}Z`));
  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.nav.broadcasts')} description={t('admin.bc.desc')} />
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div><h2 className="font-bold">{t('admin.bc.headline')}</h2><p className="text-sm text-muted">{t('admin.bc.headlineHelp')}</p></div>
        <Link href="/admin/broadcasts/new" className={buttonVariants({})}><Send className="size-4" aria-hidden />{t('admin.bc.new')}</Link>
      </Card>
      {list.isLoading ? <Skeleton className="h-48" /> : (
        <DataTableView<Row>
          minWidth="52rem" rows={list.items} rowKey={(b) => b.id} empty={t('admin.bc.empty')} labels={labels}
          hasMore={list.hasNextPage} onLoadMore={() => void list.fetchNextPage()} loadingMore={list.isFetchingNextPage}
          detailTitle={(b) => b.subject} detail={(b) => <Body id={b.id} />}
          rowActions={(b) => (b.status === 'SCHEDULED' ? [{ label: t('admin.bc.cancel'), icon: <Ban className="size-4" aria-hidden />, tone: 'danger' as const, onSelect: () => cancel.mutate(b.id) }] : [])}
          columns={[
            { key: 'subject', header: t('admin.bc.cols.subject'), value: (b) => b.subject, cellClassName: 'max-w-xs font-semibold', cell: (b) => <span className="block truncate">{b.subject}</span> },
            { key: 'status', header: t('admin.bc.cols.status'), value: (b) => b.status, filter: { options: (['SCHEDULED', 'SENDING', 'SENT', 'CANCELED', 'FAILED'] as const).map((s) => ({ value: s, label: t(`admin.bc.status.${s}`) })) }, cell: (b) => <Badge tone={TONE[b.status]}>{t(`admin.bc.status.${b.status}`)}</Badge> },
            { key: 'channel', header: t('admin.bc.cols.channel'), mobileHidden: true, value: (b) => b.channel, cell: (b) => t(`admin.bc.channel.${b.channel}`) },
            { key: 'audience', header: t('admin.bc.cols.audience'), mobileHidden: true, value: (b) => b.audienceMode, cell: (b) => <>{t(`admin.bc.mode.${b.audienceMode}`)} · {t(`admin.bc.kind.${b.kind}`)}</> },
            { key: 'rec', header: t('admin.bc.cols.recipients'), value: (b) => b.recipients, cell: (b) => (b.status === 'SCHEDULED' || b.status === 'CANCELED' ? String(b.recipients) : t('admin.bc.progress', { sent: b.sent, total: b.recipients, failed: b.failed })) },
            { key: 'date', header: t('admin.bc.cols.date'), value: (b) => b.scheduledAt, cellClassName: 'text-muted whitespace-nowrap', cell: (b) => date(b.status === 'SENT' && b.sentAt ? b.sentAt : b.scheduledAt) },
          ]}
        />
      )}
    </div>
  );
}
