import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KWATCH',
  description: '웹사이트 관제 시스템',
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-sans: 'Noto Sans KR', system-ui, -apple-system, sans-serif;
          }

          * {
            font-family: var(--font-sans);
          }
        `}</style>
      </head>
      <body className="bg-kwatch-bg-primary text-kwatch-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
