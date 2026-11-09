'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon, IconMore, type IconName } from './icons';

export type NavItem = { href: string; label: string; icon: IconName };
export type NavGroup = { label: string; items: NavItem[] };

/** A destination is current on its own page and on pages below it, so /customers/[id] marks Customers. */
function isCurrent(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Desktop sidebar (1024px and up). CSS hides it below that width. */
export function SidebarNav({
  brand,
  groups,
  footer,
}: {
  brand: ReactNode;
  groups: NavGroup[];
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  return (
    <aside className="sn-sidebar">
      {brand}
      <nav aria-label="Main" className="sn-sidebar-nav">
        {groups.map((group) => (
          <div key={group.label} role="group" aria-label={group.label} className="sn-nav-group">
            <p className="sn-nav-group-label" aria-hidden="true">
              {group.label}
            </p>
            <ul className="sn-nav-list">
              {group.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="sn-nav-link"
                    aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer ? <div className="sn-sidebar-foot">{footer}</div> : null}
    </aside>
  );
}

/** Phone bottom tab bar (below 1024px). CSS hides it at 1024px and up. */
export function TabBar({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="sn-tabbar">
      <ul className="sn-tab-list">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="sn-tab"
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Phone overflow menu for pages that are not in the tab bar. Closes itself after navigation. */
export function MoreMenu({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  const anyCurrent = items.some((item) => isCurrent(pathname, item.href));

  return (
    <details ref={ref} className="sn-more">
      <summary className="sn-more-trigger" aria-label="More pages" data-current={anyCurrent ? 'true' : 'false'}>
        <IconMore />
      </summary>
      <div className="sn-more-panel">
        <ul className="sn-more-list">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="sn-nav-link"
                aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
