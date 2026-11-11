import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

const intl = createMiddleware(routing);
const SESSION_COOKIE = 'duomatch_sid';  // même nom que côté serveur (backend/app/core/auth.py)
const HOME = /^\/(?:(en|fr))?\/?$/;

/** Un membre connecté qui ouvre l'accueil (« / », « /en ») arrive directement sur la découverte. Seule la présence du cookie de session est testée :
 *  si la session a expiré, la page de découverte renvoie vers la connexion. Les robots n'ont pas de cookie et voient toujours l'accueil. */
export default function proxy(req: NextRequest) {
  const m = HOME.exec(req.nextUrl.pathname);
  if (m && req.cookies.has(SESSION_COOKIE)) {
    const url = req.nextUrl.clone();
    url.pathname = m[1] === 'en' ? '/en/discover' : '/discover';
    return NextResponse.redirect(url);
  }
  return intl(req);
}

export const config = {
  // Ni l'API (réécrite vers le backend), ni les fichiers statiques ne passent par la négociation de langue.
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)'],
};
