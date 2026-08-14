import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';

// Runs before first paint (synchronous, first child of <body>) so an
// explicit stored theme wins over `prefers-color-scheme` immediately —
// without this, a dark-preferring OS user who chose "light" would see a
// dark flash until React hydrates. No stored value = do nothing, the CSS
// `@media (prefers-color-scheme: dark)` block in globals.css already
// handles that case on its own.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('merrudit-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Freelo',
  description: 'Espace freelance — clients, projets, devis, factures.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={ibmPlexSans.variable} suppressHydrationWarning>
      <body className={ibmPlexSans.className} suppressHydrationWarning>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>{children}</AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
