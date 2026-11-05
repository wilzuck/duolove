import { create } from 'zustand';
import type { Card } from './types';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
interface UiState {
  toasts: Toast[];
  callOutcome: { id: string; status: string; direction: 'incoming' | 'outgoing'; name: string } | null;
  setCallOutcome: (o: { id: string; status: string; direction: 'incoming' | 'outgoing'; name: string } | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismiss: (id: number) => void;
  match: { matchId: string; conversationId: string; user: Pick<Card, 'id' | 'displayName' | 'photos'> | null } | null;
  showMatch: (m: UiState['match']) => void;
  typing: Record<string, number>;
  setTyping: (conversationId: string, on: boolean) => void;
}
let seq = 0;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  callOutcome: null,
  setCallOutcome: (callOutcome) => set({ callOutcome }),
  toast: (kind, text) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text }] }));
    setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  match: null,
  showMatch: (match) => set((s) => (match && s.match?.matchId === match.matchId ? s : { match })),
  typing: {},
  setTyping: (cid, on) => set((s) => {
    const typing = { ...s.typing };
    if (on) typing[cid] = Date.now(); else delete typing[cid];
    return { typing };
  }),
}));
