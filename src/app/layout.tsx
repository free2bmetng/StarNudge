import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Favicon: the StarNudge mark, inline, so no image file is needed.
const faviconSvg =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" rx="8" fill="#8b2c5b"/>' +
  '<path transform="translate(6 6) scale(0.8333)" fill="#ffffff" d="M12 2.8l2.59 5.64 6.16.72-4.57 4.2 1.23 6.08L12 16.4l-5.41 3.04 1.23-6.08-4.57-4.2 6.16-.72z"/>' +
  '</svg>';

export const metadata: Metadata = {
  title: {
    default: 'StarNudge',
    template: '%s · StarNudge',
  },
  description: 'Compliant Google review requests for local businesses.',
  icons: {
    icon: [{ url: `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`, type: 'image/svg+xml' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
    { media: '(prefers-color-scheme: dark)', color: '#13120f' },
  ],
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
