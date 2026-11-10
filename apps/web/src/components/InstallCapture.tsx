'use client';
import { useEffect } from 'react';
import { startInstallCapture } from '@/lib/install';

/** Invisible : démarre l'écoute de l'événement d'installation dès le chargement du site, avant que la page /install ou la bannière ne s'affiche. */
export function InstallCapture() {
  useEffect(() => { startInstallCapture(); }, []);
  return null;
}
