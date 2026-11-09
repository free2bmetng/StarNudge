import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'StarNudge',
  description: 'Compliant Google review requests for local businesses.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: browser extensions (grammar checkers, dark-mode tools) add
    // attributes to <html> and <body> before React loads. That mismatch is harmless.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
