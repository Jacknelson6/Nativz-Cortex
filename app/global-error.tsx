'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ backgroundColor: '#0a0a0f', color: '#e4e4e7', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
          <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Something went wrong</h2>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#a1a1aa' }}>
              An unexpected error occurred. Please try again.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: '1.5rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                backgroundColor: '#3b82f6',
                color: '#fff',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
