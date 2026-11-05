'use client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_PUBLIC_URL } from '@/lib/site';
import { useUi } from '@/lib/store';
import type { ChatMessage, Paged } from '@/lib/types';
import { keys } from './useQueries';

let socket: Socket | null = null;
export const getSocket = () => socket;

/** Connexion Socket.IO authentifiée par le cookie de session ; met à jour le cache TanStack Query en direct. */
export function useRealtime(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    const s = io(API_PUBLIC_URL, { withCredentials: true, transports: ['websocket', 'polling'] });
    socket = s;
    s.on('message:new', (m: ChatMessage) => {
      qc.setQueryData<{ pages: Paged<ChatMessage>[]; pageParams: unknown[] }>(keys.messages(m.conversationId), (old) => {
        if (!old) return old;
        if (old.pages.some((p) => p.items.some((x) => x.id === m.id))) return old;
        const [first, ...rest] = old.pages;
        return { ...old, pages: [{ ...first!, items: [...first!.items, m] }, ...rest] };
      });
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      useUi.getState().setTyping(m.conversationId, false);
    });
    s.on('message:deleted', ({ conversationId }: { conversationId: string }) => void qc.invalidateQueries({ queryKey: keys.messages(conversationId) }));
    s.on('message:reaction', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: ChatMessage['reactions'] }) => {
      qc.setQueryData<{ pages: Paged<ChatMessage>[]; pageParams: unknown[] }>(keys.messages(conversationId), (old) => old && { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === messageId ? { ...x, reactions } : x)) })) });
    });
    s.on('date:update', ({ conversationId }: { conversationId: string }) => { void qc.invalidateQueries({ queryKey: ['dates', conversationId] }); void qc.invalidateQueries({ queryKey: keys.notifications }); });
    s.on('message:read', ({ conversationId }: { conversationId: string }) => void qc.invalidateQueries({ queryKey: keys.messages(conversationId) }));
    s.on('notification:new', () => { void qc.invalidateQueries({ queryKey: keys.notifications }); void qc.invalidateQueries({ queryKey: keys.me }); });
    s.on('match:new', (m: { matchId: string; conversationId: string; userId: string }) => {
      void qc.invalidateQueries({ queryKey: ['conversations'] });
      useUi.getState().showMatch({ matchId: m.matchId, conversationId: m.conversationId, user: { id: m.userId, displayName: '', photos: [] } });
    });
    s.on('live:invite', () => { void qc.invalidateQueries({ queryKey: keys.live }); });
    s.on('live:accepted', () => { void qc.invalidateQueries({ queryKey: keys.live }); });
    s.on('typing', ({ conversationId, isTyping }: { conversationId: string; isTyping: boolean }) => {
      useUi.getState().setTyping(conversationId, isTyping);
      if (isTyping) setTimeout(() => useUi.getState().setTyping(conversationId, false), 4000);
    });
    return () => { s.disconnect(); socket = null; };
  }, [enabled, qc]);
}
