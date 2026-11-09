import Link from 'next/link';
import type { ReactNode } from 'react';
import { isSandboxMode } from '@/lib/config';
import { Icon, IconStar } from '@/app/_components/icons';

/*
 * Signed-out frame. Same header, skip link and sandbox banner as ui.tsx's Public,
 * plus two options Public does not offer: a wider reading column for the landing page,
 * and a footer. Pages use this so every signed-out surface shares one frame.
 */

export type HeaderLink = { href: string; label: string };

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function PublicFrame({
  children,
  wide = false,
  headerLink = { href: '/privacy', label: 'Privacy' },
  footer,
}: {
  children: ReactNode;
  wide?: boolean;
  headerLink?: HeaderLink;
  footer?: ReactNode;
}) {
  const sandbox = isSandboxMode();
  const width = wide ? 'max-w-[64rem]' : undefined;
  return (
    <div className="sn-public">
      <a href="#main-content" className="sn-skip-link">
        Skip to content
      </a>
      {sandbox ? (
        <div className="sn-sandbox">
          <Icon name="alert" />
          <span>SANDBOX: no real texts or emails are sent.</span>
        </div>
      ) : null}
      <header className="sn-public-header">
        <div className={cx('sn-public-bar', width)}>
          <Link href="/" className="sn-brand">
            <span className="sn-brand-mark" aria-hidden="true">
              <IconStar fill="currentColor" />
            </span>
            <span className="sn-brand-word">StarNudge</span>
          </Link>
          <Link href={headerLink.href} className="sn-header-link">
            {headerLink.label}
          </Link>
        </div>
      </header>
      <main id="main-content" className={cx('sn-public-main', width)}>
        {children}
      </main>
      {footer}
    </div>
  );
}
