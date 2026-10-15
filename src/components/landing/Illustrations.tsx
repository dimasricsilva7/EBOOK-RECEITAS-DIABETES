/**
 * Ilustrações editoriais em traço fino (SVG inline, sem custo de rede). Usadas nos cards quando não há
 * fotografia cadastrada no admin. São decorativas: o texto do card carrega o significado.
 */
type Props = { name?: string; className?: string };

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Backdrop() {
  return (
    <>
      <circle cx="150" cy="40" r="46" className="fill-accent/35" />
      <circle cx="46" cy="118" r="34" className="fill-secondary/15" />
    </>
  );
}

/** Fim de um dia cansativo: xícara quente e lua. */
function Evening() {
  return (
    <g {...STROKE}>
      <path d="M150 28a14 14 0 1 0 14 18 11 11 0 0 1-14-18z" className="text-primary" />
      <path d="M62 82h60v22a22 22 0 0 1-22 22h-16a22 22 0 0 1-22-22z" />
      <path d="M122 88h6a10 10 0 0 1 0 20h-8" />
      <path d="M52 132h88" />
      <path d="M80 70c-4-6 4-10 0-17M94 70c-4-6 4-10 0-17M108 70c-4-6 4-10 0-17" className="text-secondary" />
    </g>
  );
}

/** Distração: tela acesa e um prato de lanche ao lado. */
function Distraction() {
  return (
    <g {...STROKE}>
      <rect x="58" y="34" width="52" height="88" rx="9" />
      <path d="M76 42h16" />
      <path d="M68 60h32M68 72h24M68 84h28" className="text-secondary" />
      <ellipse cx="140" cy="116" rx="26" ry="8" />
      <path d="M126 112c2-8 26-8 28 0" className="text-primary" />
      <circle cx="132" cy="102" r="3" className="text-primary" />
      <circle cx="144" cy="99" r="3" className="text-primary" />
    </g>
  );
}

/** Padrões: espiral e pontos ao longo do caminho. */
function Patterns() {
  return (
    <g {...STROKE}>
      <path d="M100 80c0-6 9-6 9 1 0 10-16 11-18 1-3-14 18-21 28-9 13 16-3 38-23 36-24-3-33-32-17-49 17-18 51-14 60 10" />
      <circle cx="139" cy="70" r="4" className="fill-primary text-primary" />
      <circle cx="62" cy="96" r="3" className="text-secondary" />
      <circle cx="150" cy="104" r="2.5" className="text-secondary" />
    </g>
  );
}

/** Autocobrança → gentileza: mão acolhendo um coração. */
function Kindness() {
  return (
    <g {...STROKE}>
      <path d="M100 66c-6-12-26-10-26 6 0 14 26 28 26 28s26-14 26-28c0-16-20-18-26-6z" className="text-primary" />
      <path d="M54 112c10-4 22-6 34-2l18 6c6 2 6 10-1 10H86" />
      <path d="M106 116l26-12c6-3 12 4 6 9l-28 18c-6 4-14 5-21 3l-35-9" />
    </g>
  );
}

/** Compreender: lupa sobre uma folha. */
function Understand() {
  return (
    <g {...STROKE}>
      <path d="M70 110c0-34 26-56 62-60-2 36-24 62-62 60z" className="text-secondary" />
      <path d="M70 110c18-18 34-34 50-46" className="text-secondary" />
      <circle cx="122" cy="96" r="18" />
      <path d="M135 109l16 16" />
    </g>
  );
}

const MAP: Record<string, () => React.ReactElement> = {
  moon: Evening,
  sun: Evening,
  play: Distraction,
  headphones: Distraction,
  spiral: Patterns,
  eye: Patterns,
  heart: Kindness,
  hand: Kindness,
  compass: Understand,
  leaf: Understand,
};

export function Illustration({ name = "leaf", className = "" }: Props) {
  const Art = MAP[name] ?? Understand;
  return (
    <svg viewBox="0 0 200 150" className={`text-ink/80 ${className}`} aria-hidden="true" focusable="false">
      <Backdrop />
      <Art />
    </svg>
  );
}
