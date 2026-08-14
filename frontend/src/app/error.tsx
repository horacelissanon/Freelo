'use client';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 bg-background px-4">
      <h1 className="font-headings text-2xl font-bold text-foreground">Something went wrong</h1>
      <p className="text-center font-body text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md bg-primary px-5 py-2.5 font-body text-sm font-medium text-primary-foreground"
      >
        Try again
      </button>
    </main>
  );
}
