import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/', name: 'Crushduo', short_name: 'Crushduo', description: 'Deux cœurs, une belle histoire.', start_url: '/discover', scope: '/', display: 'standalone', orientation: 'portrait', categories: ['social', 'lifestyle'],
    background_color: '#ffffff', theme_color: '#e91e63',
    icons: [
      { src: '/icon-192.png?v=2', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png?v=2', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
