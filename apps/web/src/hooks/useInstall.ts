'use client';
import { useSyncExternalStore } from 'react';
import { canPromptNow, detectPlatform, isInstalledNow, promptInstall, subscribeInstall, type InstallPlatform } from '@/lib/install';

const none = () => () => {};

/** État d'installation : `canPrompt` (le navigateur propose son installation), `installed` (déjà installée), `platform` (système détecté). */
export function useInstall(): { canPrompt: boolean; installed: boolean; platform: InstallPlatform; install: typeof promptInstall } {
  const canPrompt = useSyncExternalStore(subscribeInstall, canPromptNow, () => false);
  const installed = useSyncExternalStore(subscribeInstall, isInstalledNow, () => false);
  const platform = useSyncExternalStore(none, detectPlatform, (): InstallPlatform => 'desktop');
  return { canPrompt, installed, platform, install: promptInstall };
}
