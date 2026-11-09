import type { ReactNode, SVGProps } from 'react';

/*
 * StarNudge icon set.
 * Inline SVG on a 24-unit grid, 1.75 stroke, currentColor. Size with font-size or width/height.
 * Icons are decorative (aria-hidden). Put a visible word next to each icon, or name the control.
 */

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ className, children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className ? `sn-icon ${className}` : 'sn-icon'}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function IconDashboard(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3.5" y="3.5" width="7" height="8" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="1.5" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="1.5" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="1.5" />
    </Glyph>
  );
}

export function IconCustomers(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20.5c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5" />
      <path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4" />
      <path d="M18 14.9c1.7.9 2.7 2.8 3 5.6" />
    </Glyph>
  );
}

export function IconInbox(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M3 13.5l2.3-7.4A2 2 0 0 1 7.2 4.7h9.6a2 2 0 0 1 1.9 1.4L21 13.5" />
      <path d="M3 13.5v4.8a1.7 1.7 0 0 0 1.7 1.7h14.6a1.7 1.7 0 0 0 1.7-1.7v-4.8" />
      <path d="M3 13.5h4.5l1.2 2.4h6.6l1.2-2.4H21" />
    </Glyph>
  );
}

export function IconTemplates(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V8z" />
      <path d="M14 3.5V8h4.5" />
      <path d="M9 12.5h6M9 16h4" />
    </Glyph>
  );
}

export function IconSettings(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Glyph>
  );
}

export function IconQr(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="14" y="3.5" width="6.5" height="6.5" rx="1" />
      <rect x="3.5" y="14" width="6.5" height="6.5" rx="1" />
      <path d="M14 14h3v3h-3zM20.5 14v3h-3M20.5 20.5v-1.5M14 20.5h3M17 17.5v3" />
    </Glyph>
  );
}

export function IconSandbox(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.5 3.5h5" />
      <path d="M10.5 3.5v5.6L5.3 17.6A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.7-2.9l-5.2-8.5V3.5" />
      <path d="M7.7 15h8.6" />
    </Glyph>
  );
}

export function IconLogOut(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M14.5 4.5H18a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-3.5" />
      <path d="M10 16.5l-4-4.5 4-4.5" />
      <path d="M6 12h9.5" />
    </Glyph>
  );
}

export function IconMore(props: GlyphProps) {
  return (
    <Glyph strokeWidth={3} {...props}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </Glyph>
  );
}

export function IconStar(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 2.8l2.59 5.64 6.16.72-4.57 4.2 1.23 6.08L12 16.4l-5.41 3.04 1.23-6.08-4.57-4.2 6.16-.72z" />
    </Glyph>
  );
}

export function IconCheck(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12.5l4.2 4.2L19 7" />
    </Glyph>
  );
}

export function IconAlert(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M10.3 4.3L2.9 17.2a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4" />
      <path d="M12 17h.01" />
    </Glyph>
  );
}

export function IconXCircle(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" />
    </Glyph>
  );
}

export function IconInfo(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.2" />
      <path d="M12 8h.01" />
    </Glyph>
  );
}

export function IconPlus(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 5v14M5 12h14" />
    </Glyph>
  );
}

export function IconArrow(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Glyph>
  );
}

export function IconChevron(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M9.5 6l6 6-6 6" />
    </Glyph>
  );
}

export function IconSend(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M21 3L10.2 13.8" />
      <path d="M21 3l-6.8 18-3.4-7.2L3 10.4z" />
    </Glyph>
  );
}

export function IconMail(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </Glyph>
  );
}

export function IconPhone(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M5 4.5h3.2l1.6 4.2-2 1.3a11 11 0 0 0 6.2 6.2l1.3-2 4.2 1.6V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 6 1.5 1.5 0 0 1 5 4.5z" />
    </Glyph>
  );
}

export function IconShield(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 3l7.5 2.8v5.6c0 4.6-3.1 8.2-7.5 9.6-4.4-1.4-7.5-5-7.5-9.6V5.8z" />
      <path d="M9 12l2.2 2.2L15.5 10" />
    </Glyph>
  );
}

export function IconClock(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Glyph>
  );
}

export function IconUpload(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M12 15V4.5" />
      <path d="M7.5 9L12 4.5 16.5 9" />
      <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
    </Glyph>
  );
}

export function IconMessage(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M20 11.5a7.5 7.5 0 0 1-11 6.6L4 19.5l1.4-4.4A7.5 7.5 0 1 1 20 11.5z" />
    </Glyph>
  );
}

export function IconClose(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Glyph>
  );
}

export const iconSet = {
  dashboard: IconDashboard,
  customers: IconCustomers,
  inbox: IconInbox,
  templates: IconTemplates,
  settings: IconSettings,
  qr: IconQr,
  sandbox: IconSandbox,
  logout: IconLogOut,
  more: IconMore,
  star: IconStar,
  check: IconCheck,
  alert: IconAlert,
  xcircle: IconXCircle,
  info: IconInfo,
  plus: IconPlus,
  arrow: IconArrow,
  chevron: IconChevron,
  send: IconSend,
  mail: IconMail,
  phone: IconPhone,
  shield: IconShield,
  clock: IconClock,
  upload: IconUpload,
  message: IconMessage,
  close: IconClose,
} as const;

export type IconName = keyof typeof iconSet;

/** Renders an icon by name, for places that receive the name as data (for example nav config). */
export function Icon({ name, ...rest }: GlyphProps & { name: IconName }) {
  const Component = iconSet[name];
  return <Component {...rest} />;
}
