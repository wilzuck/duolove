'use server';
import { updateTag } from 'next/cache';

/** Purge le cache des pages publiques du blog (appelé par l'éditeur admin après enregistrement/suppression). Ne touche à aucune donnée. */
export async function refreshBlogCache() {
  updateTag('blog');
}
