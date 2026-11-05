'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, Flag, Heart, LogOut, MessageCircle, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { use, useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button, Card, Input, Skeleton, cn } from '@duomatch/ui';
import { ReportDialog } from '@/components/app/ReportDialog';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { api, del, post } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { SpeedPerson, SpeedRoom } from '@/lib/types';

/** Compte à rebours basé sur l'horloge du navigateur, recalé à chaque réponse du serveur. */
function useCountdown(seconds: number, stamp: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const left = Math.max(0, seconds - Math.floor((now - stamp) / 1000));
  const d = Math.floor(left / 86400), h = Math.floor((left % 86400) / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return { left, label: d > 0 ? `${d} j ${h} h` : h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : mmss };
}

function Person({ p, compact }: { p: SpeedPerson; compact?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <Avatar src={p.thumbUrl} name={p.displayName} size={compact ? 44 : 72} />
      <div className="min-w-0">
        <p className="font-bold">{p.displayName}, {p.age}</p>
        <p className="text-sm text-muted">{p.city}</p>
        {!compact && p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
        {!compact && p.interests.length > 0 && <ul className="mt-2 flex flex-wrap gap-1.5">{p.interests.map((i) => <li key={i} className="rounded-full bg-soft px-2.5 py-0.5 text-xs">{i}</li>)}</ul>}
      </div>
    </div>
  );
}

function Choice({ pairId, mine, onDecide }: { pairId: string; mine: string | null | undefined; onDecide: (v: { pairId: string; decision: 'INTEREST' | 'PASS' }) => void }) {
  const t = useTranslations();
  return (
    <div className="flex gap-2" role="group" aria-label={t('speed.decisionTitle')}>
      <Button size="sm" variant={mine === 'INTEREST' ? 'primary' : 'outline'} aria-pressed={mine === 'INTEREST'} onClick={() => onDecide({ pairId, decision: 'INTEREST' })}><Heart className="size-4" aria-hidden />{t('speed.interested')}</Button>
      <Button size="sm" variant={mine === 'PASS' ? 'primary' : 'outline'} aria-pressed={mine === 'PASS'} onClick={() => onDecide({ pairId, decision: 'PASS' })}>{t('speed.passed')}</Button>
    </div>
  );
}

export default function SpeedRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const [text, setText] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const q = useQuery({ queryKey: ['speed', id], queryFn: () => api<SpeedRoom>(`/speed-events/${id}`), refetchInterval: 3000 });
  const room = q.data;
  const stamp = q.dataUpdatedAt || 0;
  const cd = useCountdown(room?.event.secondsLeft ?? 0, stamp);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['speed', id] });
  const send = useMutation({ mutationFn: () => post(`/speed-events/${id}/messages`, { body: text }), onSuccess: () => { setText(''); refresh(); }, onError: (e) => toast('error', err(e)) });
  const decide = useMutation({
    mutationFn: (v: { pairId: string; decision: 'INTEREST' | 'PASS' }) => post(`/speed-events/${id}/decisions`, v),
    onSuccess: () => { toast('success', t('speed.decisionSaved')); refresh(); }, onError: (e) => toast('error', err(e)),
  });
  const leave = useMutation({ mutationFn: () => del(`/speed-events/${id}/register`), onSuccess: refresh });
  const count = room?.messages.length ?? 0;
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'nearest' }); }, [count]);

  if (q.isLoading || !room) return <div className="mx-auto max-w-2xl p-4"><Skeleton className="h-64" /></div>;
  const ev = room.event;
  const registered = ev.myStatus === 'REGISTERED';
  const block = async (uid: string) => { try { await post(`/blocks/${uid}`); toast('success', t('report.blocked')); refresh(); } catch (e) { toast('error', err(e)); } };

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div><h1 className="font-display text-2xl font-extrabold">{ev.title}</h1><p className="text-sm text-muted">{formatDate(ev.startsAt, locale, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p></div>
        <Link href="/speed" className="text-sm font-semibold text-brand-ink underline">{t('speed.title')}</Link>
      </header>

      {ev.phase === 'CANCELED' && <Card className="p-5" role="status"><p className="font-bold">{t('speed.cancelled')}</p><p className="mt-1 text-sm text-muted">{ev.cancelReason ? t(`speed.cancelReason.${ev.cancelReason}` as never) : ''}</p></Card>}

      {!registered && ev.phase !== 'CANCELED' && (
        <Card className="space-y-3 p-5">
          <p>{room.eligible ? t(`speed.reason.${room.eligible}` as never) : t('speed.subtitle')}</p>
          <Link href="/speed"><Button variant="outline">{t('speed.title')}</Button></Link>
        </Card>
      )}

      {registered && ev.phase === 'UPCOMING' && (
        <Card className="space-y-3 p-6 text-center" role="status">
          <p className="text-sm text-muted">{t('speed.startsIn')}</p>
          <p className="font-display text-5xl font-extrabold tabular-nums">{cd.label}</p>
          <p className="text-sm text-muted">{t('speed.waitingText')}</p>
          <p className="flex items-center justify-center gap-2 text-sm"><Check className="size-4 text-brand" aria-hidden />{t('speed.safe')}</p>
          <Button variant="outline" onClick={() => leave.mutate()}>{t('speed.unregister')}</Button>
        </Card>
      )}

      {registered && ev.phase === 'ROUND' && (
        <>
          <div className="flex items-center justify-between rounded-2xl bg-soft px-4 py-2">
            <Badge tone="brand">{t('speed.round', { n: ev.round, m: ev.rounds })}</Badge>
            <p className="text-sm" aria-live="off"><span className="text-muted">{t('speed.timeLeft')} </span><span className={cn('font-bold tabular-nums', cd.left < 30 && 'text-danger')}>{cd.label}</span></p>
          </div>
          {room.rest && <Card className="p-6 text-center" role="status"><p>{t('speed.rest')}</p></Card>}
          {room.partner && (
            <Card className="space-y-4 p-5">
              <Person p={room.partner} />
              {room.partner.left && <p className="rounded-xl bg-soft px-3 py-2 text-sm" role="status">{t('speed.partnerLeft')}</p>}
              <div className="max-h-72 min-h-32 space-y-2 overflow-y-auto rounded-2xl border border-line p-3" role="log" aria-label={t('speed.title')}>
                {room.messages.length === 0 && <p className="py-6 text-center text-sm text-muted"><MessageCircle className="mx-auto mb-1 size-5" aria-hidden />{t('speed.noMessages')}</p>}
                {room.messages.map((m) => <p key={m.id} className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm', m.mine ? 'ml-auto bg-brand-strong text-white' : 'bg-soft')}>{m.body}</p>)}
                <div ref={bottom} />
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send.mutate(); }}>
                <Input aria-label={t('speed.write')} placeholder={t('speed.write')} value={text} maxLength={room.messageMax} onChange={(e) => setText(e.target.value)} disabled={room.partner.left} />
                <Button type="submit" loading={send.isPending} disabled={!text.trim() || room.partner.left}><Send className="size-4" aria-hidden /><span className="sr-only">{t('speed.send')}</span></Button>
              </form>
              {room.pairId && <Choice pairId={room.pairId} mine={room.myDecision} onDecide={decide.mutate} />}
              <p className="text-xs text-muted">{t('speed.privateNote')}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <button type="button" className="flex items-center gap-1 text-muted underline" onClick={() => setReport(room.partner!.id)}><Flag className="size-4" aria-hidden />{t('speed.report')}</button>
                <button type="button" className="flex items-center gap-1 text-muted underline" onClick={() => void block(room.partner!.id)}><Ban className="size-4" aria-hidden />{t('speed.block')}</button>
              </div>
            </Card>
          )}
        </>
      )}

      {registered && ev.phase === 'BREAK' && (
        <Card className="space-y-2 p-6 text-center" role="status">
          <p className="font-bold">{t('speed.break', { n: ev.round + 1 })}</p>
          <p className="font-display text-4xl font-extrabold tabular-nums">{cd.label}</p>
          <p className="text-sm text-muted">{t('speed.breakText')}</p>
        </Card>
      )}

      {registered && (ev.phase === 'DECISION' || ev.phase === 'BREAK' || ev.phase === 'ROUND') && room.meetings.length > 0 && ev.phase !== 'ROUND' && (
        <Card className="space-y-4 p-5">
          <div><h2 className="font-bold">{t('speed.decisionTitle')}</h2><p className="text-sm text-muted">{t('speed.decisionText')}</p>{ev.phase === 'DECISION' && <p className="mt-1 text-sm"><span className="text-muted">{t('speed.timeLeft')} </span><span className="font-bold tabular-nums">{cd.label}</span></p>}</div>
          <ul className="space-y-4">
            {room.meetings.map((m) => m.user && (
              <li key={m.pairId} className="space-y-2 rounded-2xl border border-line p-3">
                <p className="text-xs font-semibold text-muted">{t('speed.meetingRound', { n: m.round })}</p>
                <Person p={m.user} compact />
                <Choice pairId={m.pairId} mine={m.myDecision} onDecide={decide.mutate} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {registered && ev.phase === 'ENDED' && (
        <Card className="space-y-4 p-6" role="status">
          <h2 className="font-display text-xl font-bold">{t('speed.resultsTitle')}</h2>
          {room.results.length === 0 ? <p className="text-muted">{t('speed.noMatch')}</p> : (
            <>
              <p className="font-semibold text-brand-ink">{t('speed.matches')}</p>
              <p className="text-sm text-muted">{t('speed.matchesText')}</p>
              <ul className="space-y-3">{room.results.map((r) => r.user && (
                <li key={r.conversationId} className="flex items-center justify-between gap-3"><Person p={r.user} compact /><Link href={`/messages/${r.conversationId}`}><Button size="sm">{t('speed.openChat')}</Button></Link></li>
              ))}</ul>
            </>
          )}
        </Card>
      )}

      {registered && (ev.phase === 'ROUND' || ev.phase === 'BREAK' || ev.phase === 'DECISION') && (
        <button type="button" className="flex items-center gap-1 text-sm text-muted underline" onClick={() => { if (window.confirm(t('speed.leaveConfirm'))) leave.mutate(); }}><LogOut className="size-4" aria-hidden />{t('speed.leave')}</button>
      )}
      {report && <ReportDialog userId={report} open onClose={() => setReport(null)} />}
    </div>
  );
}
