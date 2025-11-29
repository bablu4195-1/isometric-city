'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ padding: '40px', fontFamily: 'system-ui', textAlign: 'center' }}>
        <h2 style={{ color: '#dc2626' }}>Something went wrong!</h2>
        <button 
          onClick={() => reset()}
          style={{ 
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
