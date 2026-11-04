'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { EngagementConfig, LiveIncoming, LiveState, ConversationItem, Me, MyProfile, NotificationItem, Paged, Catalog, SubscriptionState } from '@/lib/types';

export const keys = {
  me: ['me'] as const, profile: ['profile'] as const, conversations: (q = '') => ['conversations', q] as const,
  messages: (id: string) => ['messages', id] as const, notifications: ['notifications'] as const, plans: ['plans'] as const,
  subscription: ['subscription'] as const, payments: ['payments'] as const, live: ['live'] as const, liveInvites: ['live', 'invites'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api<Me>('/users/me'), retry: false, staleTime: 30_000 });
export const useMyProfile = () => useQuery({ queryKey: keys.profile, queryFn: () => api<MyProfile>('/profiles/me') });
export const useConversations = (q = '') => useQuery({ queryKey: keys.conversations(q), queryFn: () => api<ConversationItem[]>(`/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`), refetchOnWindowFocus: true });
export const useNotifications = () => useQuery({ queryKey: keys.notifications, queryFn: () => api<Paged<NotificationItem>>('/notifications') });
/** Catalogue (offres + produits) : rafraîchi régulièrement pour refléter un changement de tarif sans rechargement. */
export const useCatalog = (initialData?: Catalog) => useQuery({ queryKey: keys.plans, queryFn: () => api<Catalog>('/plans'), initialData, staleTime: 30_000, refetchInterval: 60_000 });
export const useSubscription = () => useQuery({ queryKey: keys.subscription, queryFn: () => api<SubscriptionState>('/subscriptions/me') });
/** Menu Match : état de la recherche, jetons, personnes ayant accepté. Rafraîchi régulièrement + en direct via Socket.IO. */
export const useLive = () => useQuery({ queryKey: keys.live, queryFn: () => api<LiveState>('/live/state'), refetchInterval: 20_000, retry: false });
export const useLiveInvites = () => useQuery({ queryKey: keys.liveInvites, queryFn: () => api<{ items: LiveIncoming[] }>('/live/invites'), refetchInterval: 20_000 });

/** Réglages publics des fonctions d'engagement (activation, bornes) : pilotés par l'administration. */
export const useEngagementConfig = () => useQuery({ queryKey: ['engagement', 'config'], queryFn: () => api<EngagementConfig>('/engagement/config'), staleTime: 60_000 });
