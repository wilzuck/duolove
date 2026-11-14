'use client';
import { useEffect } from 'react';
import { isOpaqueScriptError, reportError } from '@/lib/reportError';

/** Remonte au suivi les erreurs JavaScript non interceptées du navigateur (y compris les promesses rejetées sans gestion). */
export function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => { if ((ev.error || ev.message) && !isOpaqueScriptError(ev)) reportError(ev.error ?? new Error(ev.message)); };
    const onRejection = (ev: PromiseRejectionEvent) => {
      const r = ev.reason as { status?: number } | undefined;
      if (r && typeof r.status === 'number' && r.status < 500) return;  // erreurs métier (droits, validation) : déjà affichées au membre, pas des pannes
      reportError(ev.reason instanceof Error ? ev.reason : new Error(String(ev.reason)));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); };
  }, []);
  return null;
}
