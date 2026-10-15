/** Ícones de linha (traço fino, cantos arredondados) — um único path por ícone, herdam a cor do texto. */
const PATHS: Record<string, string> = {
  heart: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
  leaf: "M5 19c0-8 5-13 14-14 0 9-5 14-13 14H5Zm0 0 7-7",
  sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.5 2.5M15.2 15.2l2.5 2.5M6.3 17.7l2.5-2.5M15.2 8.8l2.5-2.5",
  compass: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  pen: "M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Zm10-13 3 3",
  book: "M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5v-13ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5v-13Z",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z",
  play: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2-12.5 5 3.5-5 3.5v-7Z",
  lock: "M6 11h12v9H6v-9Zm2.5 0V8a3.5 3.5 0 0 1 7 0v3",
  shield: "M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6l7-3Zm-3 9 2 2 4-4",
  pix: "M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Zm-3 8.5 3 3 3-3-3-3-3 3Z",
  chat: "M4 5h16v11H9l-5 4V5Zm4 5h8M8 13h5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4.5l3 2",
  download: "M12 4v11m0 0-4-4m4 4 4-4M5 19h14",
  check: "M5 12.5 10 17l9-10",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z",
  hand: "M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v5m0-2.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 6 17l-2-3.5a1.5 1.5 0 0 1 2.6-1.5L7 13",
  spiral: "M12 12a1.5 1.5 0 1 1 1.5 1.5A3 3 0 1 1 16.5 10.5 4.5 4.5 0 1 1 12 6 6 6 0 1 1 6 12",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  close: "M6 6l12 12M18 6 6 18",
  plus: "M12 5v14M5 12h14",
  mail: "M4 6h16v12H4V6Zm0 0 8 7 8-7",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v5m0-8.5v.5",
  gift: "M4 10h16v10H4V10Zm-1-3h18v3H3V7Zm9 0v13M12 7S10.5 3 8 4s.5 3 4 3Zm0 0s1.5-4 4-3-.5 3-4 3Z",
  file: "M7 3h7l5 5v13H7V3Zm7 0v5h5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
};

export function Icon({ name, className = "h-5 w-5", strokeWidth = 1.6, title }: { name: string; className?: string; strokeWidth?: number; title?: string }) {
  const d = PATHS[name] ?? PATHS.check;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  );
}

/** Ícone por formato de material. */
export const formatIcon = (format: string) => ({ PDF: "file", WORKBOOK: "pen", AUDIO: "headphones", VIDEO: "play", LINK: "link" })[format] ?? "book";
