'use client';

export default function NotFound() {
  return (
    <html>
      <body style={{ padding: '40px', fontFamily: 'system-ui', textAlign: 'center' }}>
        <h2>404 - Page Not Found</h2>
        <p>The page you're looking for doesn't exist.</p>
        <a href="/" style={{ color: '#3b82f6', textDecoration: 'underline' }}>
          Go back home
        </a>
      </body>
    </html>
  );
}
