import { cn } from './cn';

/** Marque CrushDuo : deux cœurs entrelacés (dessin original). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 44" aria-hidden className={cn('size-8', className)}>
      <defs>
        <linearGradient id="dm-a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FF6B81" /><stop offset="1" stopColor="#E91E63" /></linearGradient>
        <linearGradient id="dm-b" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E91E63" /><stop offset="1" stopColor="#B0124F" /></linearGradient>
      </defs>
      <path d="M16 38.500C6 30 2 23.500 2 17 2 11 6.300 7 11.500 7c3.400 0 5.600 1.800 6.500 4 .9-2.200 3.100-4 6.500-4C29.700 7 34 11 34 17c0 6.500-4 13-14 21.500-1.200 1-2.800 1-4 0Z" fill="url(#dm-a)" opacity=".95" />
      <path d="M32 40.500c-1.200 1-2.800 1-4 0C18 32 14 25.500 14 19c0-6 4.300-10 9.500-10 3.400 0 5.600 1.800 6.500 4 .9-2.200 3.100-4 6.500-4C41.700 9 46 13 46 19c0 6.500-4 13-14 21.500Z" fill="url(#dm-b)" style={{ mixBlendMode: 'multiply' }} opacity=".92" />
    </svg>
  );
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-display text-xl font-extrabold tracking-tight text-fg', className)}>
      <LogoMark className={markClassName} />
      <span>Crush<span className="text-brand-ink">Duo</span></span>
    </span>
  );
}
