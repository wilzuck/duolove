/** Guides de découverte : un guide par page, montré une seule fois par compte (premier passage).
 *  Chaque étape vise un repère `data-tour` ; s'il n'est pas visible sur cet écran (ex. menu latéral sur mobile), l'étape s'affiche au centre. */
export interface TourStep { id: string; target?: string }
export interface Tour { id: string; match: (path: string) => boolean; steps: TourStep[] }

export const TOURS: Tour[] = [
  { id: 'discover', match: (p) => p === '/discover', steps: [
    { id: 'welcome' }, { id: 'actions', target: 'discover-actions' }, { id: 'filters', target: 'discover-filters' }, { id: 'daily', target: 'section-tabs' },
    { id: 'boosts', target: 'topbar-actions' }, { id: 'messages', target: 'nav-messages' }, { id: 'profile', target: 'nav-profile' },
  ] },
  { id: 'likes', match: (p) => p === '/likes', steps: [{ id: 'tabs', target: 'likes-tabs' }, { id: 'back' }] },
  { id: 'match', match: (p) => p === '/match', steps: [{ id: 'head', target: 'match-head' }, { id: 'more', target: 'section-tabs' }] },
  { id: 'messages', match: (p) => p === '/messages' || p.startsWith('/messages/'), steps: [{ id: 'head', target: 'messages-head' }, { id: 'safety' }] },
  { id: 'profile', match: (p) => p === '/profile', steps: [{ id: 'view' }, { id: 'edit', target: 'profile-edit' }] },
];

export const tourFor = (path: string) => TOURS.find((t) => t.match(path)) ?? null;
