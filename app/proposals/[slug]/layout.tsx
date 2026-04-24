import type { Metadata } from 'next';

// Public proposals contain deal terms, signer emails, and package pricing.
// Keep them out of search indexes even if someone shares the link.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function PublicProposalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-text-primary">
      {children}
    </div>
  );
}
