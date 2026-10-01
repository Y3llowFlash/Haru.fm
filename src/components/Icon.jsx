import React from 'react';

const paths = {
  pin: <><path d="m8 3 8 0-1 6 3 4H6l3-4-1-6Z" /><path d="M12 13v8" /></>,
  mini: <><rect x="3" y="4" width="18" height="16" rx="2" /><rect x="12" y="11" width="6" height="6" rx="1" /></>,
  cozy: <><path d="m3 11 9-8 9 8M5 10v11h14V10" /><path d="M10 21v-7h4v7" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  minus: <path d="M5 12h14" />,
  play: <path d="m8 5 11 7-11 7Z" />,
  pause: <><path d="M8 5v14M16 5v14" /></>,
  previous: <><path d="M5 5v14" /><path d="m18 5-10 7 10 7Z" /></>,
  next: <><path d="M19 5v14" /><path d="m6 5 10 7-10 7Z" /></>,
  volume: <><path d="M11 4 6 8H3v8h3l5 4Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></>,
  muted: <><path d="M11 4 6 8H3v8h3l5 4Z" /><path d="m16 9 5 6m0-6-5 6" /></>,
  link: <><path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2-1 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 1)" /></>,
  external: <><path d="M14 3h7v7M21 3 10 14" /><path d="M10 3H3v18h18v-7" /></>,
  motion: <><path d="M4 7h10M2 12h8M4 17h10" /><path d="m16 7 5 5-5 5" /></>,
  youtube: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3Z" /></>,
};

export default function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}

export function RecordMark({ size = 28 }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="#0d121b" stroke="#768296" strokeWidth="2" /><circle cx="20" cy="20" r="13" fill="none" stroke="#313d50" /><circle cx="20" cy="20" r="9" fill="none" stroke="#313d50" /><circle cx="20" cy="20" r="6" fill="#e7b678" /><circle cx="20" cy="20" r="2" fill="#151d29" /><path d="M7 17a14 14 0 0 1 9-10" fill="none" stroke="#8996aa" strokeWidth="2" /></svg>;
}
