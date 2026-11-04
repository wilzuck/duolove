import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'DuoMatch', short_name: 'DuoMatch', description: 'Deux cœurs, une belle histoire.', start_url: '/discover', display: 'standalone',
    background_color: '#ffffff', theme_color: '#e91e63',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}
