import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'CrushDuo', short_name: 'CrushDuo', description: 'Deux cœurs, une belle histoire.', start_url: '/discover', scope: '/', display: 'standalone', orientation: 'portrait', categories: ['social', 'lifestyle'],
    background_color: '#ffffff', theme_color: '#e91e63',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
