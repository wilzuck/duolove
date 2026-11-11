import { cn } from './cn';

/**
 * Logo CrushDuo, en deux versions : texte noir pour le thème clair, texte blanc pour le thème sombre (fichiers dans /brand).
 * Le choix se fait en CSS (classes `.logo-light` / `.logo-dark`, voir tokens.css) : il suit le réglage manuel ET celui de l'appareil, sans attendre le JavaScript.
 * `variant` force une version (ex. barre latérale d'administration, toujours sombre).
 * `markOnMobile` : sur petit écran (< 640 px), n'affiche que le cœur pour gagner de la place ; le logo complet revient dès `sm`.
 */
export function Logo({ className, variant = 'auto', markOnMobile = false }: { className?: string; variant?: 'auto' | 'light' | 'dark'; markOnMobile?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center leading-none', className)}>
      <span className={cn('inline-flex items-center leading-none', markOnMobile && 'max-sm:hidden')}>
        {variant !== 'dark' && <img src="/brand/crushduo-logo-light.webp" alt="CrushDuo" width={960} height={185} className={cn('block h-[22px] w-auto', variant === 'auto' && 'logo-light')} />}
        {variant !== 'light' && <img src="/brand/crushduo-logo-dark.webp" alt={variant === 'dark' ? 'CrushDuo' : ''} aria-hidden={variant === 'dark' ? undefined : true} width={960} height={185} className={cn('block h-[22px] w-auto', variant === 'auto' && 'logo-dark')} />}
      </span>
      {markOnMobile && (
        <span className="inline-flex items-center leading-none sm:hidden">
          {variant !== 'dark' && <img src="/brand/crushduo-mark-light.webp" alt="CrushDuo" width={283} height={240} className={cn('block h-[24px] w-auto', variant === 'auto' && 'logo-light')} />}
          {variant !== 'light' && <img src="/brand/crushduo-mark-dark.webp" alt={variant === 'dark' ? 'CrushDuo' : ''} aria-hidden={variant === 'dark' ? undefined : true} width={283} height={240} className={cn('block h-[24px] w-auto', variant === 'auto' && 'logo-dark')} />}
        </span>
      )}
    </span>
  );
}
