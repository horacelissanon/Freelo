import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { BottomNavStyleProvider } from '@/contexts/BottomNavStyleContext';
import { AccentColorProvider } from '@/contexts/AccentColorContext';
import { SidebarColorProvider } from '@/contexts/SidebarColorContext';
import { SidebarShapeProvider } from '@/contexts/SidebarShapeContext';
import { MobileNavStyleProvider } from '@/contexts/MobileNavStyleContext';
import { ScopedColorGuard } from '@/components/ScopedColorGuard';
import { APP_ROUTE_SEGMENTS } from '@/lib/appRoutes';

// Single source of truth (frontend/src/lib/appRoutes.ts) for which URL
// segment identifies the private, authenticated app — reused below to gate
// the two pre-paint scripts so a freelancer's accent/sidebar color never
// applies to a public page on the very first (full) load. Plain
// string.split/indexOf, not a regex literal — `\d`/`\w`/`\/` inside a JS
// template literal silently drop their backslash (only recognized escapes
// like \n, \\ survive), which would corrupt a regex built this way.
const APP_ROUTES_JSON = JSON.stringify(APP_ROUTE_SEGMENTS);

// Runs before first paint (synchronous, first child of <body>) so an
// explicit stored theme wins over `prefers-color-scheme` immediately —
// without this, a dark-preferring OS user who chose "light" would see a
// dark flash until React hydrates. No stored value = do nothing, the CSS
// `@media (prefers-color-scheme: dark)` block in globals.css already
// handles that case on its own.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('merrudit-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

// Same pre-paint pattern as THEME_INIT_SCRIPT — a custom accent touches
// buttons/links/active-states all over the first paint, so without this a
// user who picked e.g. blue would see a flash of the default green. Checks
// the free-form custom hex first (merrudit-accent-custom) since it takes
// priority over the 6 fixed presets when both happen to be stored. Gated
// to app routes only (see APP_ROUTES_JSON above + ScopedColorGuard.tsx) —
// a freelancer's personalization must never paint the public landing page,
// login, signup, etc. with their own chosen brand color.
const ACCENT_INIT_SCRIPT = `(function(){var __seg=(location.pathname.split('/')[1]||'');if(${APP_ROUTES_JSON}.indexOf(__seg)===-1){return;}try{var ch=localStorage.getItem('merrudit-accent-custom');if(ch&&/^#[0-9a-fA-F]{6}$/.test(ch)){var h2r=function(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};var rgb=h2r(ch).map(function(v){return Math.round(v*0.88);});var toH=function(v){return Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0');};var dark='#'+toH(rgb[0])+toH(rgb[1])+toH(rgb[2]);document.documentElement.style.setProperty('--color-primary',ch);document.documentElement.style.setProperty('--color-accent',dark);return;}}catch(e){}try{var a=localStorage.getItem('merrudit-accent');if(a&&a!=='green'){document.documentElement.setAttribute('data-accent',a);}}catch(e){}})();`;

// Same pre-paint pattern, for the free-form sidebar/bottom-nav background
// color (no fixed enum to key a data-attribute off, so this always goes
// through inline custom properties — see contexts/SidebarColorContext.tsx).
// The `c.toLowerCase()==='#f8fafc'` branch mirrors
// resolveSidebarColorForTheme/LIGHT_SIDEBAR_HEX there (can't import a
// module into a pre-paint string) — the "Sobre & clair" white preset swaps
// to the "Ardoise" duo's #18181b in dark mode so it doesn't flash white
// before React hydrates and re-applies the same swap. THEME_INIT_SCRIPT
// runs before this one (see <Script> order below), so data-theme is
// already set (or deliberately left unset for 'system' mode) by this point.
const SIDEBAR_INIT_SCRIPT = `(function(){var __seg=(location.pathname.split('/')[1]||'');if(${APP_ROUTES_JSON}.indexOf(__seg)===-1){return;}try{var c=localStorage.getItem('merrudit-sidebar-color');if(c&&/^#[0-9a-fA-F]{6}$/.test(c)){if(c.toLowerCase()==='#f8fafc'){var dt=document.documentElement.getAttribute('data-theme');var isDark=dt==='dark'||(!dt&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(isDark){c='#18181b';}}var h2r=function(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];};var lum=function(h){var rgb=h2r(h).map(function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});return 0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2];};var ratio=function(a,b){var la=lum(a),lb=lum(b);var hi=Math.max(la,lb),lo=Math.min(la,lb);return(hi+0.05)/(lo+0.05);};var fg=ratio(c,'#ffffff')>=ratio(c,'#0a0a0a')?'#ffffff':'#0a0a0a';var a1=h2r(c),b1=h2r(fg);var mix=function(i){return Math.round(a1[i]+(b1[i]-a1[i])*0.14);};var toH=function(v){return Math.max(0,Math.min(255,v)).toString(16).padStart(2,'0');};var muted='#'+toH(mix(0))+toH(mix(1))+toH(mix(2));var root=document.documentElement.style;root.setProperty('--color-sidebar',c);root.setProperty('--color-sidebar-foreground',fg);root.setProperty('--color-sidebar-muted',muted);}}catch(e){}})();`;

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

// themeColor moved out of `metadata` in the App Router metadata API this
// Next version ships (verified against node_modules/next/dist/docs/.../
// generate-viewport.md) — colors the browser UI (address bar on Android
// Chrome, PWA splash/status bar once installed) to match the brand primary.
export const viewport: Viewport = {
  themeColor: '#059669',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={ibmPlexSans.variable} suppressHydrationWarning>
      <body className={ibmPlexSans.className} suppressHydrationWarning>
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Script id="accent-init" strategy="beforeInteractive">
          {ACCENT_INIT_SCRIPT}
        </Script>
        <Script id="sidebar-init" strategy="beforeInteractive">
          {SIDEBAR_INIT_SCRIPT}
        </Script>
        <ThemeProvider>
          <AccentColorProvider>
            <SidebarColorProvider>
              <SidebarShapeProvider>
                <BottomNavStyleProvider>
                  <MobileNavStyleProvider>
                    <ToastProvider>
                      <AuthProvider>
                        <ScopedColorGuard />
                        {children}
                      </AuthProvider>
                    </ToastProvider>
                  </MobileNavStyleProvider>
                </BottomNavStyleProvider>
              </SidebarShapeProvider>
            </SidebarColorProvider>
          </AccentColorProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
