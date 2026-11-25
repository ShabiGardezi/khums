import Link from 'next/link';

import { cn } from '@khums/ui/lib/utils';

/** Positions of the beads on the inner arch of the Mihrab mark (viewBox 0 0 360 645). */
const BEADS: readonly (readonly [number, number])[] = [
  [50.0, 370.0],
  [310.0, 370.0],
  [50.0, 325.0],
  [310.0, 325.0],
  [54.8, 271.4],
  [305.2, 271.4],
  [68.1, 221.0],
  [291.9, 221.0],
  [88.8, 174.8],
  [271.2, 174.8],
  [115.2, 133.3],
  [244.8, 133.3],
  [146.1, 97.5],
  [213.9, 97.5],
  [180.0, 68.0],
];
/** The five dots: four plain, the fifth (the one-fifth of khums) in gold. */
const DOTS = [96, 138, 180, 222, 264] as const;

/** The Mihrab mark (owner's logo, 2026-11-25): an arch with a crescent and five dots. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 360 645" aria-hidden="true" className={cn('h-9 w-auto shrink-0', className)}>
      <path
        d="M0 645V300C0 150 85 62 180 0C275 62 360 150 360 300V645Z"
        className="fill-brand-green"
      />
      <path
        d="M50 645V325C50 215 110 120 180 68C250 120 310 215 310 325V645"
        fill="none"
        strokeWidth="7"
        className="stroke-brand-gold"
      />
      {BEADS.map(([x, y]) => (
        <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r="7" className="fill-brand-gold" />
      ))}
      <circle cx="175" cy="345" r="103" className="fill-brand-gold" />
      <circle cx="215" cy="323" r="89" className="fill-brand-green" />
      {DOTS.map((x, i) => (
        <circle
          key={x}
          cx={x}
          cy="555"
          r="15"
          className={i === DOTS.length - 1 ? 'fill-brand-gold' : 'fill-brand-cream'}
        />
      ))}
    </svg>
  );
}

export function Logo({
  href,
  name,
  className,
}: {
  href: string;
  name: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn('flex items-center gap-2.5 rounded-md font-semibold tracking-tight', className)}
    >
      <LogoMark />
      <span className="whitespace-nowrap text-base">{name}</span>
    </Link>
  );
}
