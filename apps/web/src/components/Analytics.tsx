'use client';
import Script from 'next/script';
import { useEffect } from 'react';
import { usePathname } from '@/i18n/navigation';
import { isAnalyticsPath, useConsent } from '@/lib/consent';
import { GTM_ID } from '@/lib/site';

declare global { interface Window { gtag?: (...a: unknown[]) => void } }

/**
 * Google Tag Manager, chargé UNIQUEMENT si le visiteur a accepté (bandeau) et sur une page publique. Publicité refusée par défaut (`ad_*` : denied).
 * Le script ne peut pas être déchargé en cours de navigation : en passant dans l'espace membre, le stockage d'analyse est remis à « denied ».
 */
export function Analytics() {
  const consent = useConsent();
  const path = usePathname();
  const allowed = consent === 'granted' && isAnalyticsPath(path);
  useEffect(() => { if (consent === 'granted') window.gtag?.('consent', 'update', { analytics_storage: allowed ? 'granted' : 'denied' }); }, [consent, allowed]);
  if (consent !== 'granted' || !GTM_ID || !isAnalyticsPath(path)) return null;
  return (
    <Script id="gtm" strategy="afterInteractive">{`
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      window.gtag = gtag;
      gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
      (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s);j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${GTM_ID}');
    `}</Script>
  );
}
