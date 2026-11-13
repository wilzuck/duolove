'use client';
import { useEffect, useState } from 'react';
import { reloadOnceForChunkError } from '@/lib/chunkError';
import { reportError } from '@/lib/reportError';

const TEXT = {
  fr: { title: 'Cette page n’a pas pu s’afficher', text: 'Un petit souci technique. Rechargez la page : tout devrait rentrer dans l’ordre.', updating: 'Mise à jour de Crushduo…', reload: 'Recharger', home: 'Accueil' },
  en: { title: 'This page could not be displayed', text: 'A small technical issue. Reload the page and everything should be back to normal.', updating: 'Updating Crushduo…', reload: 'Reload', home: 'Home' },
};

/** Dernier filet (erreur dans la mise en page racine) : page autonome, bilingue, aux couleurs de Crushduo, avec rechargement automatique après un déploiement. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  const [reloading] = useState(() => reloadOnceForChunkError(error));
  const en = typeof window !== 'undefined' && window.location.pathname.startsWith('/en');
  const x = TEXT[en ? 'en' : 'fr'];
  useEffect(() => { console.error(error); reportError(error, { digest: error.digest }); }, [error]);
  return (
    <html lang={en ? 'en' : 'fr'}>
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#fff5f8', color: '#1f1a24', textAlign: 'center', padding: 16 }}>
        <div style={{ maxWidth: 420 }}>
          <p style={{ fontSize: 40, margin: 0 }} aria-hidden>💗</p>
          <h1 style={{ fontSize: 24, margin: '12px 0' }}>{reloading ? x.updating : x.title}</h1>
          {!reloading && <p style={{ color: '#6b6475' }}>{x.text}</p>}
          {!reloading && (
            <p style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 20 }}>
              <button type="button" onClick={() => window.location.reload()} style={{ background: '#d81b60', color: '#fff', border: 0, borderRadius: 999, padding: '12px 22px', fontWeight: 700, cursor: 'pointer' }}>{x.reload}</button>
              <a href={en ? '/en' : '/'} style={{ border: '1px solid #e8dfe6', borderRadius: 999, padding: '12px 22px', color: '#1f1a24', textDecoration: 'none', fontWeight: 600 }}>{x.home}</a>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
