import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md space-y-4">
        <p className="text-sm font-semibold uppercase tracking-widest text-accent-text">404</p>
        <h1 className="text-3xl font-semibold text-text-primary md:text-4xl">
          This page doesn&apos;t exist
        </h1>
        <p className="text-sm text-text-muted">
          The page you&apos;re looking for may have been moved, deleted, or the link may be expired.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/admin/login"
            className="inline-flex items-center rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-sm font-medium text-accent-text transition hover:border-accent/50 hover:bg-accent/20"
          >
            Back to sign in
          </Link>
          <Link
            href="https://nativz.io"
            className="inline-flex items-center rounded-lg border border-nativz-border bg-surface-hover/60 px-4 py-2 text-sm font-medium text-text-secondary transition hover:text-text-primary"
          >
            Nativz home
          </Link>
        </div>
      </div>
    </div>
  );
}
