// App Router file convention — Next.js serves this at /manifest.webmanifest
// and auto-injects the <link rel="manifest"> tag, no manual wiring needed
// (verified against node_modules/next/dist/docs/.../metadata/manifest.md
// for this Next 16 build per AGENTS.md). `start_url` points at /dashboard
// rather than the marketing homepage — installing is only meaningful for a
// freelancer who already has an account, so the installed icon should open
// straight into the app they actually use daily.
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Freelo — Espace freelance',
    short_name: 'Freelo',
    description: 'Clients, projets, devis et factures — un seul espace de travail freelance.',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#fafafa',
    theme_color: '#059669',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
