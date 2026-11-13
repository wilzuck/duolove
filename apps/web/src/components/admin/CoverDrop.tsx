'use client';
import { ImagePlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Spinner } from '@duomatch/ui';
import { useUi } from '@/lib/store';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Bloc image d'un article : cliquer dedans ou y déposer un fichier pour choisir / remplacer l'image. `locked` : image reprise de l'autre version, non modifiable ici. */
export function CoverDrop({ url, alt, locked = false, pending = false, onFile, className = 'max-w-xl' }: {
  url: string | null; alt?: string; locked?: boolean; pending?: boolean; onFile: (file: File) => void; className?: string;
}) {
  const t = useTranslations();
  const toast = useUi((s) => s.toast);
  const [over, setOver] = useState(false);
  const off = locked || pending;
  const take = (file: File | undefined) => {
    if (!file) return;
    if (IMAGE_TYPES.includes(file.type)) onFile(file);
    else toast('error', t('admin.blog.coverBadType'));
  };
  return (
    <label
      className={`relative block w-full overflow-hidden rounded-2xl has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${off ? '' : 'cursor-pointer'} ${over ? 'ring-4 ring-brand' : ''} ${className}`}
      onDragOver={(e) => { if (off) return; e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!off) take(e.dataTransfer.files?.[0]); }}
    >
      <input type="file" accept={IMAGE_TYPES.join(',')} disabled={off} className="sr-only" aria-label={t(url ? 'admin.blog.coverReplace' : 'admin.blog.coverUpload')} onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      {url
        ? <img src={url} alt={alt || ''} className="aspect-video w-full object-cover" />
        : <span className={`grid aspect-video w-full place-items-center rounded-2xl border-2 border-dashed text-center text-sm text-muted ${over ? 'border-brand bg-soft' : 'border-line hover:bg-soft'}`}>
            <span className="flex flex-col items-center gap-2 px-4"><ImagePlus className="size-6" aria-hidden />{t('admin.blog.coverDrop')}</span>
          </span>}
      {(pending || (over && url)) && <span className="absolute inset-0 grid place-items-center bg-black/50 text-sm font-semibold text-white">{pending ? <Spinner size="sm" label={t('admin.blog.uploading')} /> : t('admin.blog.coverDropHere')}</span>}
    </label>
  );
}
