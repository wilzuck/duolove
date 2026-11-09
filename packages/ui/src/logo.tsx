import { cn } from './cn';

/**
 * Logo CrushDuo, en deux versions : texte noir pour le thème clair, texte blanc pour le thème sombre (fichiers dans /brand).
 * Le choix se fait en CSS (classes `.logo-light` / `.logo-dark`, voir tokens.css) : il suit le réglage manuel ET celui de l'appareil, sans attendre le JavaScript.
 * `variant` force une version (ex. barre latérale d'administration, toujours sombre).
 */
export function Logo({ className, variant = 'auto' }: { className?: string; variant?: 'auto' | 'light' | 'dark' }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center', className)}>
      {variant !== 'dark' && <img src="/brand/crushduo-logo-light.webp" alt="CrushDuo" width={573} height={144} className={cn('h-9 w-auto', variant === 'auto' && 'logo-light')} />}
      {variant !== 'light' && <img src="/brand/crushduo-logo-dark.webp" alt={variant === 'dark' ? 'CrushDuo' : ''} aria-hidden={variant === 'dark' ? undefined : true} width={586} height={144} className={cn('h-9 w-auto', variant === 'auto' && 'logo-dark')} />}
    </span>
  );
}
