'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CameraOff, Mic, MicOff, Phone, PhoneOff, Video } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Dialog, IconButton } from '@duomatch/ui';
import { callKeys } from '@/hooks/useQueries';
import { Link } from '@/i18n/navigation';
import { api, post } from '@/lib/api';
import { useUi } from '@/lib/store';
import type { CallInfo, CallTicket } from '@/lib/types';

/** Appels audio/vidéo : sonnerie entrante (sans son automatique), écran d'appel, résultats. Rien n'est enregistré. */
export function CallLayer() {
  const t = useTranslations();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const outcome = useUi((s) => s.callOutcome);
  const { data } = useQuery({
    queryKey: callKeys.current, queryFn: () => api<{ call: CallInfo | null }>('/calls/current'), staleTime: 15_000,
    refetchInterval: (q) => (q.state.data?.call ? 5000 : false),
  });
  const call = data?.call ?? null;

  // La sonnerie s'arrête d'elle-même : on relit l'état à l'échéance.
  useEffect(() => {
    if (!call || call.status !== 'RINGING' || !call.ringExpiresAt) return;
    const ms = new Date(`${call.ringExpiresAt}`).getTime() - Date.now() + 800;
    const id = setTimeout(() => void qc.invalidateQueries({ queryKey: callKeys.current }), Math.max(ms, 500));
    return () => clearTimeout(id);
  }, [call, qc]);

  // Résultats d'appel : messages discrets, jamais pour une action que l'on vient de faire soi-même.
  useEffect(() => {
    if (!outcome) return;
    const { status, direction, name } = outcome;
    if (status === 'ENDED') toast('info', t('calls.ended'));
    else if (status === 'DECLINED' && direction === 'outgoing') toast('info', t('calls.declined', { name }));
    else if (status === 'MISSED' && direction === 'outgoing') toast('info', t('calls.missed', { name }));
    else if (status === 'CANCELED' && direction === 'incoming') toast('info', t('calls.missedBy', { name }));
    useUi.getState().setCallOutcome(null);
  }, [outcome, t, toast]);

  const act = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'accept' | 'decline' | 'cancel' | 'end' }) => post<CallInfo>(`/calls/${id}/${verb}`),
    onSettled: () => void qc.invalidateQueries({ queryKey: callKeys.current }),
  });

  if (!call) return null;
  if (call.status === 'RINGING' && call.direction === 'incoming') {
    return (
      <Dialog open onClose={() => act.mutate({ id: call.id, verb: 'decline' })} title={t('calls.incoming', { name: call.other.displayName })} closeLabel={t('calls.decline')}>
        <div role="alert" className="flex flex-col items-center gap-4 text-center">
          <Avatar name={call.other.displayName} size={72} />
          <p className="text-muted">{call.kind === 'VIDEO' ? t('calls.incomingVideo') : t('calls.incomingAudio')}</p>
          <div className="flex w-full gap-3">
            <Button variant="secondary" className="flex-1" onClick={() => act.mutate({ id: call.id, verb: 'decline' })}><PhoneOff className="size-4" aria-hidden />{t('calls.decline')}</Button>
            <Button className="flex-1" onClick={() => act.mutate({ id: call.id, verb: 'accept' })}><Phone className="size-4" aria-hidden />{t('calls.accept')}</Button>
          </div>
        </div>
      </Dialog>
    );
  }
  if (call.status === 'RINGING' || call.status === 'ACTIVE') return <CallScreen call={call} onHangUp={() => act.mutate({ id: call.id, verb: call.status === 'ACTIVE' ? 'end' : call.direction === 'outgoing' ? 'cancel' : 'decline' })} />;
  return null;
}

function useElapsed(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!since) return '00:00';
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

type Phase = 'connecting' | 'connected' | 'denied' | 'failed';

function CallScreen({ call, onHangUp }: { call: CallInfo; onHangUp: () => void }) {
  const t = useTranslations();
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [livePhase, setPhase] = useState<Phase>('connecting');
  const phase: Phase = call.simulated ? 'connected' : livePhase;
  const room = useRef<import('livekit-client').Room | null>(null);
  const remote = useRef<HTMLVideoElement>(null);
  const local = useRef<HTMLVideoElement>(null);
  const audioHost = useRef<HTMLDivElement>(null);
  const joined = call.status === 'ACTIVE' || call.direction === 'outgoing';
  const timer = useElapsed(call.answeredAt);

  useEffect(() => {
    if (!joined) return;
    if (call.simulated) return;
    let closed = false;
    const host = audioHost.current;
    void (async () => {
      try {
        const ticket = await api<CallTicket>(`/calls/${call.id}/token`);
        const { Room, RoomEvent } = await import('livekit-client');
        const r = new Room({ adaptiveStream: true });
        room.current = r;
        r.on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === 'video' && remote.current) track.attach(remote.current);
          else if (track.kind === 'audio' && host) host.appendChild(track.attach());
        });
        r.on(RoomEvent.Disconnected, () => { if (!closed) setPhase('failed'); });
        await r.connect(ticket.url, ticket.token);
        if (closed) { void r.disconnect(); return; }
        setPhase('connected');
        try {
          await r.localParticipant.setMicrophoneEnabled(true);
          if (call.kind === 'VIDEO') {
            await r.localParticipant.setCameraEnabled(true);
            const pub = r.localParticipant.getTrackPublication('camera' as never);
            if (pub?.track && local.current) pub.track.attach(local.current);
          }
        } catch { if (!closed) setPhase('denied'); }
      } catch { if (!closed) setPhase('failed'); }
    })();
    return () => { closed = true; void room.current?.disconnect(); room.current = null; if (host) host.replaceChildren(); };
  }, [joined, call.id, call.kind, call.simulated]);

  const toggleMic = () => { const next = !muted; setMuted(next); void room.current?.localParticipant.setMicrophoneEnabled(!next); };
  const toggleCam = () => { const next = !camOff; setCamOff(next); void room.current?.localParticipant.setCameraEnabled(!next); };
  const ringing = call.status === 'RINGING';
  const video = call.kind === 'VIDEO';

  return (
    <Dialog open onClose={onHangUp} title={ringing ? t('calls.calling', { name: call.other.displayName }) : `${call.other.displayName} · ${t('calls.connected')}`} closeLabel={t('calls.hangUp')} className="w-[min(96vw,36rem)]">
      <div className="flex flex-col items-center gap-4 text-center">
        {video && !call.simulated ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <video ref={remote} autoPlay playsInline className="size-full object-cover" aria-label={call.other.displayName} />
            <video ref={local} autoPlay playsInline muted className="absolute right-2 bottom-2 h-24 w-20 rounded-xl border border-white/40 object-cover" aria-hidden />
          </div>
        ) : <Avatar name={call.other.displayName} size={88} />}
        <div ref={audioHost} className="hidden" aria-hidden />
        <p className="font-display text-2xl font-bold tabular-nums" aria-live="polite">{ringing ? t('calls.connecting') : phase === 'connecting' ? t('calls.connecting') : timer}</p>
        {call.simulated && <p role="note" className="rounded-xl bg-soft px-3 py-2 text-sm text-muted">{t('calls.simulated')}</p>}
        {phase === 'denied' && <p role="alert" className="text-sm text-danger">{t('calls.permissionDenied')}</p>}
        {phase === 'failed' && <p role="alert" className="text-sm text-danger">{t('calls.failed')}</p>}
        {phase === 'connecting' && !call.simulated && joined && <p className="text-sm text-muted">{t('calls.permission')}</p>}
        <div className="flex items-center justify-center gap-3">
          <IconButton label={muted ? t('calls.unmute') : t('calls.mute')} aria-pressed={muted} onClick={toggleMic}>{muted ? <MicOff className="size-5" /> : <Mic className="size-5" />}</IconButton>
          {video && <IconButton label={camOff ? t('calls.cameraOn') : t('calls.cameraOff')} aria-pressed={camOff} onClick={toggleCam}>{camOff ? <CameraOff className="size-5" /> : <Camera className="size-5" />}</IconButton>}
          <Button onClick={onHangUp} className="bg-danger text-white hover:bg-danger"><PhoneOff className="size-4" aria-hidden />{ringing ? t('calls.cancel') : t('calls.hangUp')}</Button>
        </div>
        <p className="text-xs text-muted">{t('calls.privacy')} {t('calls.limit', { n: call.maxMinutes })}</p>
        <p className="text-xs text-muted">{t('calls.safety')} <Link href={`/messages/${call.conversationId}`} className="underline" onClick={onHangUp}>{t('report.cta')}</Link></p>
      </div>
    </Dialog>
  );
}

/** Boutons d'appel de l'en-tête de conversation. */
export function CallButtons({ conversationId, name }: { conversationId: string; name: string }) {
  const t = useTranslations();
  const qc = useQueryClient();
  const toast = useUi((s) => s.toast);
  const start = useMutation({
    mutationFn: (kind: 'AUDIO' | 'VIDEO') => post<CallInfo>(`/conversations/${conversationId}/calls`, { kind }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: callKeys.current }),
    onError: (e) => {
      const code = (e as { code?: string }).code;
      const map: Record<string, string> = { CALL_BUSY: t('calls.busy'), CALLEE_UNAVAILABLE: t('calls.unavailable', { name }), CALL_LIMIT: t('calls.dailyLimit'), CONVERSATION_CLOSED: t('calls.closed'), PAUSED: t('calls.paused'), FEATURE_DISABLED: t('calls.disabled') };
      toast('error', (code && map[code]) || t('calls.error'));
    },
  });
  return (
    <>
      <IconButton label={t('calls.audio')} tone="plain" disabled={start.isPending} onClick={() => start.mutate('AUDIO')}><Phone className="size-5" /></IconButton>
      <IconButton label={t('calls.video')} tone="plain" disabled={start.isPending} onClick={() => start.mutate('VIDEO')}><Video className="size-5" /></IconButton>
    </>
  );
}
