'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '@/lib/api';

interface Cfg { enabled: boolean; publicKey: string | null; devices: number }

const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

export type PushState = 'loading' | 'unsupported' | 'ios-install' | 'not-ready' | 'denied' | 'off' | 'on';

/**
 * Notifications push de CET appareil : navigateur compatible ? serveur configuré ? permission ? abonné ?
 * L'activation doit venir d'un geste du membre (le navigateur refuse de demander la permission sans clic).
 */
export function usePush() {
  const qc = useQueryClient();
  const cfg = useQuery({ queryKey: ['push-config'], queryFn: () => api<Cfg>('/push/config'), staleTime: 60_000 });
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  const iosNeedsInstall = /iPhone|iPad|iPod/.test(ua) && !standalone;

  // État de CET appareil (permission du navigateur + abonnement existant), lu à la demande et relu après chaque action.
  const dev = useQuery({
    queryKey: ['push-device'], enabled: supported, gcTime: 0,
    queryFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      return { perm: Notification.permission, endpoint: sub?.endpoint ?? null };
    },
  });
  const endpoint = dev.data?.endpoint ?? null;
  const perm = dev.data?.perm ?? 'default';
  const ready = !supported || dev.isSuccess;
  const reload = () => Promise.all([qc.invalidateQueries({ queryKey: ['push-config'] }), qc.invalidateQueries({ queryKey: ['push-device'] })]);

  const enable = useMutation({
    mutationFn: async () => {
      if (!cfg.data?.publicKey) throw new Error('not-ready');
      const p = await Notification.requestPermission();
      if (p !== 'granted') throw new Error('denied');
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.data.publicKey) }));
      const json = sub.toJSON();
      await post('/push/subscribe', { endpoint: sub.endpoint, keys: json.keys });
    },
    onSettled: reload,
  });
  const disable = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    },
    onSettled: reload,
  });
  const test = useMutation({ mutationFn: () => post<{ sent: number }>('/push/test', { endpoint }) });

  let state: PushState = 'loading';
  if (ready && cfg.data) {
    if (!supported) state = iosNeedsInstall ? 'ios-install' : 'unsupported';
    else if (!cfg.data.enabled) state = 'not-ready';
    else if (perm === 'denied') state = 'denied';
    else state = endpoint ? 'on' : 'off';
  }
  if (ready && !supported && iosNeedsInstall) state = 'ios-install';
  return { state, enable, disable, test, devices: cfg.data?.devices ?? 0 };
}
