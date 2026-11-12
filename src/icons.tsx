import React from 'react';

const P: Record<string, React.ReactNode> = {
  bell: <path d="M6 17V11a6 6 0 0112 0v6l1.5 2h-15zM10 20.5h4" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  rates: <path d="M4 19h16M6 16l4-5 3 3 5-7" />,
  cal: <><rect x="4" y="5" width="16" height="15" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  msg: <path d="M5 5h14v10H9l-4 4z" />,
  pin: <><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" /></>,
  menu: <path d="M4 8h16M4 16h16" />,
  image: <><rect x="3" y="6" width="18" height="12" /><path d="M7 14l3-3 3 3 2-2 3 3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  tv: <><rect x="3" y="5" width="18" height="12" /><path d="M8 21h8M12 17v4" /></>,
  palette: <><path d="M12 3a9 9 0 100 18c1.1 0 1.5-.8 1.5-1.5 0-1.4-1.3-1.7-1.3-3s1-2 2.3-2H17a4 4 0 004-4c0-4-4-7.5-9-7.5z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="15" cy="7.5" r="1" /></>,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  up: <path d="M6 15l6-6 6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  right: <path d="M5 12h14M13 6l6 6-6 6" />,
  out: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  wa: <path d="M4 20l1.3-4A8 8 0 1112 20a8 8 0 01-4-1z" />
};

export const Icon: React.FC<{ n: keyof typeof P | string; size?: number }> = ({ n, size = 20 }) => (
  <svg className="i" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{P[n]}</svg>
);

/** The small filled triangles beside a change: the direction is in the shape, not only the colour. */
export const Arrow: React.FC<{ up: boolean; size?: number }> = ({ up, size = 9 }) => (
  <svg viewBox="0 0 10 10" width={size} height={size} aria-hidden="true"><path d={up ? 'M5 1 L9 8 L1 8 Z' : 'M5 9 L9 2 L1 2 Z'} fill="currentColor" /></svg>
);
