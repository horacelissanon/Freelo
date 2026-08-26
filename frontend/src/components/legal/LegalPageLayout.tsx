import Link from 'next/link';

const LEGAL_LINKS: { href: string; label: string }[] = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/cgu', label: 'CGU' },
  { href: '/cgv', label: 'CGV' },
];

export function LegalPageLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 bg-background px-4 py-12">
      <Link href="/" className="flex items-center gap-2 self-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary">
          <svg
            viewBox="0 0 64 64"
            className="h-5 w-5 text-primary-foreground"
            fill="none"
            stroke="currentColor"
            strokeWidth={8}
            strokeLinecap="square"
          >
            <line x1="17" y1="19" x2="47" y2="19" />
            <line x1="17" y1="45" x2="47" y2="45" />
            <line x1="15" y1="47" x2="49" y2="17" strokeWidth={7.5} />
          </svg>
        </div>
        <span className="font-headings text-xl font-bold tracking-tight text-foreground">
          ZeFacto
        </span>
      </Link>

      <div className="rounded-lg border border-border bg-canvas shadow-card p-6 sm:p-8">
        <h1 className="font-headings text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-1 font-body text-xs text-muted-foreground">
          Dernière mise à jour : {updatedAt}
        </p>
        <div className="prose-legal mt-6 flex flex-col gap-4 font-body text-sm text-foreground">
          {children}
        </div>
      </div>

      <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1 font-body text-xs text-muted-foreground">
        {LEGAL_LINKS.map((link) => (
          <Link key={link.href} href={link.href} className="hover:text-foreground hover:underline">
            {link.label}
          </Link>
        ))}
      </nav>

      <p className="text-center font-body text-sm text-muted-foreground">
        <Link href="/" className="font-medium text-primary">
          Retour à l’accueil
        </Link>
      </p>
    </main>
  );
}
