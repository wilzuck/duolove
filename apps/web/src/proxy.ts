import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

export default createMiddleware(routing);

export const config = {
  // Ni l'API (réécrite vers le backend), ni les fichiers statiques ne passent par la négociation de langue.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
