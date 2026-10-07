import type { SVGProps } from 'react';

/**
 * Icon set.
 *
 * Hand-written rather than pulled from an icon package: the app needs about
 * forty glyphs, and this keeps them on one 24px grid with one stroke weight and
 * no runtime dependency. Every icon inherits `currentColor` and sizes from the
 * `size` prop, defaulting to 16px to match the 13–14px type scale.
 */

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
}

function Icon({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------- navigation */

export const Dashboard = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>
);
export const Projects = (p: IconProps) => (
  <Icon {...p}><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.2a2 2 0 0 1 1.6.8l1 1.4h7.2A2.5 2.5 0 0 1 21 9.7v7.8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" /></Icon>
);
export const Team = (p: IconProps) => (
  <Icon {...p}><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19.5a5.8 5.8 0 0 1 11 0" /><path d="M16.5 5.6a3.2 3.2 0 0 1 0 6.3M18 19.5a5.8 5.8 0 0 0-2.2-4.5" /></Icon>
);
export const Chat = (p: IconProps) => (
  <Icon {...p}><path d="M20.5 11.6c0 4-3.8 7.2-8.5 7.2a9.6 9.6 0 0 1-2.6-.35L4.5 20.5l1.2-3.4A6.9 6.9 0 0 1 3.5 11.6c0-4 3.8-7.1 8.5-7.1s8.5 3.2 8.5 7.1z" /></Icon>
);
export const Tasks = (p: IconProps) => (
  <Icon {...p}><path d="M9 6h11M9 12h11M9 18h11" /><path d="M4 5.8l1.3 1.4L7.5 4.6M4 11.8l1.3 1.4 2.2-2.6M4 17.8l1.3 1.4 2.2-2.6" /></Icon>
);
export const Kanban = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="5" height="13" rx="1.4" /><rect x="9.5" y="4" width="5" height="9" rx="1.4" /><rect x="16" y="4" width="5" height="16" rx="1.4" /></Icon>
);
export const Sprint = (p: IconProps) => (
  <Icon {...p}><path d="M20.5 12a8.5 8.5 0 1 1-3.1-6.6" /><path d="M21 4v5h-5" /><circle cx="12" cy="12" r="2.2" /></Icon>
);
export const Bug = (p: IconProps) => (
  <Icon {...p}><rect x="7.5" y="7.5" width="9" height="11" rx="4.5" /><path d="M7.5 11H4m16 0h-3.5M7.5 15H4m16 0h-3.5M9 7.5 7.5 5m7 2.5L16 5M12 18.5V21" /></Icon>
);
export const Review = (p: IconProps) => (
  <Icon {...p}><path d="M8.5 7 5 10.5 8.5 14M15.5 10 19 13.5 15.5 17" /><path d="M13.5 5.5 10 18.5" /></Icon>
);
export const Git = (p: IconProps) => (
  <Icon {...p}><circle cx="6.5" cy="5.5" r="2.3" /><circle cx="6.5" cy="18.5" r="2.3" /><circle cx="17.5" cy="12" r="2.3" /><path d="M6.5 7.8v8.4" /><path d="M15.3 12H13a4 4 0 0 0-4 4v0" /></Icon>
);
export const Deploy = (p: IconProps) => (
  <Icon {...p}><path d="M12 3c3.2 2.3 5 5.6 5 9.2 0 1.6-.3 3-.9 4.3H7.9A10.2 10.2 0 0 1 7 12.2C7 8.6 8.8 5.3 12 3z" /><circle cx="12" cy="10.5" r="1.8" /><path d="M9.5 19.5h5M10.5 22h3" /></Icon>
);
export const Calendar = (p: IconProps) => (
  <Icon {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.2" /><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" /></Icon>
);
export const Knowledge = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="6" r="2.4" /><circle cx="5.5" cy="17" r="2.4" /><circle cx="18.5" cy="17" r="2.4" /><path d="M10.4 7.8 7.1 15.2M13.6 7.8l3.3 7.4M8 17h8" /></Icon>
);
export const Files = (p: IconProps) => (
  <Icon {...p}><path d="M13.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9.5z" /><path d="M13.5 3.5v4a2 2 0 0 0 2 2h4" /></Icon>
);
export const Activity = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 13h4l2.5-6 3.5 11 2.5-5h4.5" /></Icon>
);
export const Reports = (p: IconProps) => (
  <Icon {...p}><path d="M4 20V10M9.5 20V5M15 20v-7M20.5 20V8" /></Icon>
);
export const Bell = (p: IconProps) => (
  <Icon {...p}><path d="M18 10.5a6 6 0 1 0-12 0c0 4.2-1.5 5.5-1.5 5.5h15S18 14.7 18 10.5z" /><path d="M10.2 19.5a2.1 2.1 0 0 0 3.6 0" /></Icon>
);
export const Settings = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="2.8" /><path d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1" /></Icon>
);
export const Shield = (p: IconProps) => (
  <Icon {...p}><path d="M12 3 5 5.8v5.4c0 4.2 2.9 8 7 9.3 4.1-1.3 7-5.1 7-9.3V5.8z" /><path d="m9 12 2.1 2.1L15 10.3" /></Icon>
);

/* ------------------------------------------------------------------ actions */

export const Plus = (p: IconProps) => <Icon {...p}><path d="M12 5v14M5 12h14" /></Icon>;
export const X = (p: IconProps) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
export const Check = (p: IconProps) => <Icon {...p}><path d="M4.5 12.5 9 17l10.5-10.5" /></Icon>;
export const Search = (p: IconProps) => (
  <Icon {...p}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 4.5 4.5" /></Icon>
);
export const Filter = (p: IconProps) => (
  <Icon {...p}><path d="M4 6.5h16M7 12h10M10 17.5h4" /></Icon>
);
export const ChevronDown = (p: IconProps) => <Icon {...p}><path d="m6 9.5 6 6 6-6" /></Icon>;
export const ChevronRight = (p: IconProps) => <Icon {...p}><path d="m9.5 6 6 6-6 6" /></Icon>;
export const ChevronLeft = (p: IconProps) => <Icon {...p}><path d="m14.5 6-6 6 6 6" /></Icon>;
export const ChevronsLeft = (p: IconProps) => (
  <Icon {...p}><path d="m13 6-6 6 6 6M19 6l-6 6 6 6" /></Icon>
);
export const More = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" /><circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" /></Icon>
);
export const Trash = (p: IconProps) => (
  <Icon {...p}><path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" /><path d="M10.5 11v6M13.5 11v6" /></Icon>
);
export const Edit = (p: IconProps) => (
  <Icon {...p}><path d="M16.5 3.8a2 2 0 0 1 2.8 2.8L8 18l-4 1 1-4z" /><path d="m14.5 5.8 3.7 3.7" /></Icon>
);
export const Logout = (p: IconProps) => (
  <Icon {...p}><path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" /><path d="M16 8.5 19.5 12 16 15.5M19.5 12h-9" /></Icon>
);
export const Send = (p: IconProps) => (
  <Icon {...p}><path d="M4 12 20 4l-7 16-2.5-6.5z" /><path d="m10.5 13.5 9.5-9.5" /></Icon>
);
export const Attach = (p: IconProps) => (
  <Icon {...p}><path d="M19 11.5l-7.6 7.6a4.3 4.3 0 0 1-6-6l8-8a2.9 2.9 0 0 1 4 4l-8 8a1.4 1.4 0 0 1-2-2l7.3-7.3" /></Icon>
);
export const Download = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5v11M8 11l4 4 4-4" /><path d="M4.5 18.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1" /></Icon>
);
export const Upload = (p: IconProps) => (
  <Icon {...p}><path d="M12 15.5V4.5M8 8l4-4 4 4" /><path d="M4.5 18.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1" /></Icon>
);
export const External = (p: IconProps) => (
  <Icon {...p}><path d="M14 4.5h5.5V10M19 5l-8 8" /><path d="M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" /></Icon>
);
export const Clock = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></Icon>
);
export const Flag = (p: IconProps) => (
  <Icon {...p}><path d="M5.5 21V4M5.5 5h9l-1.2 3 1.2 3h-9" /></Icon>
);
export const Branch = (p: IconProps) => (
  <Icon {...p}><circle cx="7" cy="5.5" r="2.2" /><circle cx="7" cy="18.5" r="2.2" /><circle cx="17" cy="5.5" r="2.2" /><path d="M7 7.7v8.6M17 7.7c0 4-4 3.5-6 5.5" /></Icon>
);
export const Commit = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="3.2" /><path d="M3.5 12h5.3M15.2 12h5.3" /></Icon>
);
export const Sun = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></Icon>
);
export const Moon = (p: IconProps) => (
  <Icon {...p}><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" /></Icon>
);
export const Command = (p: IconProps) => (
  <Icon {...p}><path d="M9 6.5a2.5 2.5 0 1 0-2.5 2.5h11A2.5 2.5 0 1 0 15 6.5v11a2.5 2.5 0 1 0 2.5-2.5h-11A2.5 2.5 0 1 0 9 17.5z" /></Icon>
);
export const Menu = (p: IconProps) => <Icon {...p}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
export const Link = (p: IconProps) => (
  <Icon {...p}><path d="M10 13.5a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1" /><path d="M14 10.5a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" /></Icon>
);
export const Warning = (p: IconProps) => (
  <Icon {...p}><path d="M12 4.5 2.8 20h18.4z" /><path d="M12 10v4.2M12 17.2v.1" /></Icon>
);
export const Info = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.1" /></Icon>
);
export const Sparkle = (p: IconProps) => (
  <Icon {...p}><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></Icon>
);
export const Fire = (p: IconProps) => (
  <Icon {...p}><path d="M12 21c3.6 0 6-2.3 6-5.5 0-4.2-4.5-5.8-3.6-11C11 6 8 8.7 8 12.2c0-1.2-.5-2.2-1.3-2.9A6.6 6.6 0 0 0 6 13c0 4.4 2.4 8 6 8z" /></Icon>
);
export const Target = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.8" /><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" /></Icon>
);
export const Graph = (p: IconProps) => (
  <Icon {...p}><circle cx="6" cy="7" r="2.2" /><circle cx="18" cy="6" r="2.2" /><circle cx="17" cy="18" r="2.2" /><circle cx="6.5" cy="17" r="2.2" /><path d="M8.1 7.6 15.8 6.3M7.3 9 6.7 14.8M8.6 16.3l6.2 1.4M17.6 8.1l-.5 7.7" /></Icon>
);

/* ------------------------------------------------------------------- shell */

export const Zap = (p: IconProps) => <Icon {...p}><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" /></Icon>;
/** Sidebar-panel glyph whose arrow points the way the navigator will move. */
export const PanelToggle = ({ open = true, ...p }: IconProps & { open?: boolean }) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
    <path d="M9.5 4v16" />
    <path d={open ? 'm16 10-2 2 2 2' : 'm14 10 2 2-2 2'} />
  </Icon>
);
export const Folder = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 7A2 2 0 0 1 5.5 5h3.6l2 2.2h7.4a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></Icon>
);
export const ChevronsUpDown = (p: IconProps) => <Icon {...p}><path d="m8 9 4-4 4 4M8 15l4 4 4-4" /></Icon>;
export const User = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="8" r="3.6" /><path d="M5 20a7 7 0 0 1 14 0" /></Icon>
);
export const GripVertical = (p: IconProps) => (
  <Icon {...p}>{[6, 12, 18].map((y) => (<g key={y}><circle cx="9" cy={y} r="1.1" fill="currentColor" stroke="none" /><circle cx="15" cy={y} r="1.1" fill="currentColor" stroke="none" /></g>))}</Icon>
);
export const SlidersHorizontal = (p: IconProps) => (
  <Icon {...p}><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></Icon>
);
export const Inbox = (p: IconProps) => (
  <Icon {...p}><path d="M3.5 13.5 6 5.5h12l2.5 8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18z" /><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" /></Icon>
);
export const List = (p: IconProps) => (
  <Icon {...p}><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M4 9.5h16M4 14.5h16" /></Icon>
);
export const Columns = (p: IconProps) => (
  <Icon {...p}><rect x="4" y="4.5" width="16" height="15" rx="2" /><path d="M9.5 4.5v15M14.5 4.5v15" /></Icon>
);
export const Refresh = (p: IconProps) => (
  <Icon {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4h-4" /></Icon>
);
export const PullRequest = (p: IconProps) => (
  <Icon {...p}><circle cx="6.5" cy="5.5" r="2" /><circle cx="6.5" cy="18.5" r="2" /><circle cx="17.5" cy="18.5" r="2" /><path d="M6.5 7.5v9M17.5 16.5V9.5a3 3 0 0 0-3-3H11" /><path d="m13 4.5-2 2 2 2" /></Icon>
);
