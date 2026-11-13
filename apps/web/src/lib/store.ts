import { create } from 'zustand';
import type { Card } from './types';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
interface UiState {
  toasts: Toast[];
  /** Jeton Google d'un visiteur sans compte, transmis en mémoire de la connexion à l'inscription (jamais stocké sur l'appareil). */
  googleToken: string | null;
  setGoogleToken: (t: string | null) => void;
  callOutcome: { id: string; status: string; direction: 'incoming' | 'outgoing'; name: string } | null;
  setCallOutcome: (o: { id: string; status: string; direction: 'incoming' | 'outgoing'; name: string } | null) => void;
  /** Paiement dont la fenêtre a été fermée sans payer : propose de réessayer ou d'annuler. */
  payInterrupted: { retry: () => void } | null;
  setPayInterrupted: (p: { retry: () => void } | null) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  dismiss: (id: number) => void;
  match: { matchId: string; conversationId: string; user: Pick<Card, 'id' | 'displayName' | 'photos'> | null; kind?: 'CRUSH' } | null;
  showMatch: (m: UiState['match']) => void;
  /** Adresse de la page courante dans chaque langue (article de blog traduit) : utilisée par le sélecteur de langue. */
  localeAlternates: Partial<Record<string, string>> | null;
  setLocaleAlternates: (a: Partial<Record<string, string>> | null) => void;
  typing: Record<string, number>;
  setTyping: (conversationId: string, on: boolean) => void;
}
let seq = 0;

export const useUi = create<UiState>((set, get) => ({
  toasts: [],
  googleToken: null,
  setGoogleToken: (googleToken) => set({ googleToken }),
  callOutcome: null,
  setCallOutcome: (callOutcome) => set({ callOutcome }),
  payInterrupted: null,
  setPayInterrupted: (payInterrupted) => set({ payInterrupted }),
  toast: (kind, text) => {
    const id = ++seq;
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, kind, text }] }));
    setTimeout(() => get().dismiss(id), 4500);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  match: null,
  showMatch: (match) => set((s) => (match && s.match?.matchId === match.matchId ? s : { match })),
  localeAlternates: null,
  setLocaleAlternates: (localeAlternates) => set({ localeAlternates }),
  typing: {},
  setTyping: (cid, on) => set((s) => {
    const typing = { ...s.typing };
    if (on) typing[cid] = Date.now(); else delete typing[cid];
    return { typing };
  }),
}));
