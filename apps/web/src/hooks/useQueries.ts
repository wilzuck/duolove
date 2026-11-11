'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Activity, EngagementConfig, LiveInvitesView, LiveState, ConversationItem, Me, MyProfile, NotificationItem, Paged, Catalog, SubscriptionState } from '@/lib/types';

export const callKeys = { current: ['calls', 'current'] as const };
export const keys = {
  me: ['me'] as const, profile: ['profile'] as const, conversations: (q = '') => ['conversations', q] as const,
  messages: (id: string) => ['messages', id] as const, notifications: ['notifications'] as const, plans: ['plans'] as const,
  subscription: ['subscription'] as const, payments: ['payments'] as const, live: ['live'] as const, liveInvites: ['live', 'invites'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/users/me'), retry: false, staleTime: 30_000 });
/** Le visiteur est-il connecté ? (pages publiques : « Ouvrir Crushduo » au lieu de « Se connecter » / « Créer mon compte »). Répond toujours 200. */
export const useSession = () => useQuery({ queryKey: ['session'], queryFn: () => api<{ authenticated: boolean }>('/auth/session'), staleTime: 30_000, refetchOnWindowFocus: true });
export const useMyProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api<MyProfile>('/profiles/me') });
/** Statut d'activité des personnes données (matchs uniquement) : actualisé chaque minute, et seulement si la liste n'est pas vide. */
export const useActivity = (ids: string[]) => {
  const key = [...new Set(ids)].sort().slice(0, 50);
  return useQuery({ queryKey: ['activity', key], enabled: key.length > 0, staleTime: 30_000, refetchInterval: 60_000, queryFn: async () => (await api<{ items: Record<string, Activity> }>(`/profiles/activity?ids=${key.join(',')}`)).items });
};
export const useConversations = (q = '') => useQuery({ queryKey: keys.conversations(q), queryFn: () => api<ConversationItem[]>(`/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`), refetchOnWindowFocus: true });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api<Paged<NotificationItem>>('/notifications') });
/** Catalogue (offres + produits) : rafraîchi régulièrement pour refléter un changement de tarif sans rechargement. */
export const useCatalog = (initialData?: Catalog) => useQuery({ queryKey: keys.plans, queryFn: () => api<Catalog>('/plans'), initialData, staleTime: 30_000, refetchInterval: 60_000 });
export const useSubscription = () => useQuery({ queryKey: keys.subscription, queryFn: () => api<SubscriptionState>('/subscriptions/me') });
/** Menu Match : état de la recherche, jetons, personnes ayant accepté. Rafraîchi régulièrement + en direct via Socket.IO. */
export const useLive = () => useQuery({ queryKey: keys.live, queryFn: () => api<LiveState>('/live/state'), refetchInterval: 20_000, retry: false });
export const useLiveInvites = () => useQuery({ queryKey: keys.liveInvites, queryFn: () => api<LiveInvitesView>('/live/invites'), refetchInterval: 20_000 });

/** Réglages publics des fonctions d'engagement (activation, bornes) : pilotés par l'administration. */
export const useEngagementConfig = () => useQuery({ queryKey: ['engagement', 'config'], queryFn: () => api<EngagementConfig>('/engagement/config'), staleTime: 60_000 });
