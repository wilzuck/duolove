import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['fr', 'en'],
  defaultLocale: 'fr',
  // Français sans préfixe (/), anglais sous /en. Architecture prête pour d'autres langues : ajouter la locale + messages/<l>.json.
  localePrefix: 'as-needed',
  localeDetection: false,
});
export type Locale = (typeof routing.locales)[number];
