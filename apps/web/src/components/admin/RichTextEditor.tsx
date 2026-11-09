'use client';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Placeholder } from '@tiptap/extensions';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Heading2, Heading3, ImagePlus, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2, Unlink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Input, cn } from '@duomatch/ui';
import { docToMarkdown, markdownToDoc, type PMNode } from '@/lib/blogMarkdown';

function ToolBtn({ label, on, active, disabled, children }: { label: string; on: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={on}
      className={cn('inline-flex size-9 items-center justify-center rounded-lg text-fg transition hover:bg-soft disabled:opacity-40', active && 'bg-soft text-brand-ink')}>{children}</button>
  );
}

/** Éditeur riche (Tiptap) pour les articles : l'équipe met en forme visuellement, le contenu est enregistré en Markdown restreint (voir lib/blogMarkdown). */
export function RichTextEditor({ value, onChange, uploadImage, busy }: { value: string; onChange: (markdown: string) => void; uploadImage: (file: File) => Promise<string>; busy?: boolean }) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef(uploadImage);
  useEffect(() => { uploadRef.current = uploadImage; });
  const [linkOpen, setLinkOpen] = useState(false);
  const [href, setHref] = useState('');

  const insertFiles = (files: File[]) => {
    const imgs = files.filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
    if (!imgs.length) return false;
    void (async () => { for (const f of imgs) { const src = await uploadRef.current(f).catch(() => null); if (src) editor?.chain().focus().setImage({ src, alt: '' }).run(); } })();
    return true;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, code: false, codeBlock: false, strike: false, horizontalRule: false, hardBreak: false, underline: false, link: false }),
      Link.configure({ openOnClick: false, autolink: false, protocols: [], HTMLAttributes: { rel: 'noopener noreferrer nofollow' } }),
      Image.configure({ inline: true, allowBase64: false }),
      Placeholder.configure({ placeholder: t('admin.blog.rte.placeholder') }),
    ],
    content: markdownToDoc(value),
    editorProps: {
      attributes: { class: 'rte min-h-96 px-5 py-4 outline-none', 'aria-label': t('admin.blog.rte.label'), role: 'textbox', 'aria-multiline': 'true' },
      handlePaste: (_v, e) => insertFiles(Array.from(e.clipboardData?.files ?? [])),
      handleDrop: (_v, e) => insertFiles(Array.from((e as DragEvent).dataTransfer?.files ?? [])),
    },
    onUpdate: ({ editor: ed }) => onChange(docToMarkdown(ed.getJSON() as PMNode)),
  });

  const st = useEditorState({
    editor,
    selector: ({ editor: ed }) => ed ? {
      h2: ed.isActive('heading', { level: 2 }), h3: ed.isActive('heading', { level: 3 }), bold: ed.isActive('bold'), italic: ed.isActive('italic'), link: ed.isActive('link'),
      ul: ed.isActive('bulletList'), ol: ed.isActive('orderedList'), quote: ed.isActive('blockquote'), image: ed.isActive('image'), alt: String(ed.getAttributes('image').alt ?? ''),
      canUndo: ed.can().undo(), canRedo: ed.can().redo(), linkHref: String(ed.getAttributes('link').href ?? ''),
    } : null,
  });
  if (!editor) return <div className="min-h-96 rounded-2xl border border-line" aria-busy />;

  const sep = <span aria-hidden className="mx-1 h-5 w-px bg-line" />;
  const c = () => editor.chain().focus();
  const openLink = () => { setHref(st?.linkHref ?? ''); setLinkOpen(true); };
  const applyLink = () => {
    const v = href.trim();
    if (!v) c().unsetLink().run();
    else if (/^(https?:\/\/|\/(?!\/))/.test(v) && !/\s|\)/.test(v)) c().extendMarkRange('link').setLink({ href: v }).run();
    setLinkOpen(false);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card focus-within:border-brand">
      <div role="toolbar" aria-label={t('admin.blog.rte.toolbar')} className="flex flex-wrap items-center gap-0.5 border-b border-line bg-soft/40 p-1.5">
        <ToolBtn label={t('admin.blog.rte.h2')} active={st?.h2} on={() => c().toggleHeading({ level: 2 }).run()}><Heading2 className="size-4" /></ToolBtn>
        <ToolBtn label={t('admin.blog.rte.h3')} active={st?.h3} on={() => c().toggleHeading({ level: 3 }).run()}><Heading3 className="size-4" /></ToolBtn>
        {sep}
        <ToolBtn label={t('admin.blog.rte.bold')} active={st?.bold} on={() => c().toggleBold().run()}><Bold className="size-4" /></ToolBtn>
        <ToolBtn label={t('admin.blog.rte.italic')} active={st?.italic} on={() => c().toggleItalic().run()}><Italic className="size-4" /></ToolBtn>
        <ToolBtn label={t('admin.blog.rte.link')} active={st?.link} on={openLink}><Link2 className="size-4" /></ToolBtn>
        {st?.link && <ToolBtn label={t('admin.blog.rte.unlink')} on={() => c().extendMarkRange('link').unsetLink().run()}><Unlink className="size-4" /></ToolBtn>}
        {sep}
        <ToolBtn label={t('admin.blog.rte.ul')} active={st?.ul} on={() => c().toggleBulletList().run()}><List className="size-4" /></ToolBtn>
        <ToolBtn label={t('admin.blog.rte.ol')} active={st?.ol} on={() => c().toggleOrderedList().run()}><ListOrdered className="size-4" /></ToolBtn>
        <ToolBtn label={t('admin.blog.rte.quote')} active={st?.quote} on={() => c().toggleBlockquote().run()}><Quote className="size-4" /></ToolBtn>
        {sep}
        <ToolBtn label={busy ? t('admin.blog.rte.uploading') : t('admin.blog.rte.image')} disabled={busy} on={() => fileRef.current?.click()}><ImagePlus className="size-4" /></ToolBtn>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) insertFiles([f]); e.target.value = ''; }} />
        <span className="ml-auto flex">
          <ToolBtn label={t('admin.blog.rte.undo')} disabled={!st?.canUndo} on={() => c().undo().run()}><Undo2 className="size-4" /></ToolBtn>
          <ToolBtn label={t('admin.blog.rte.redo')} disabled={!st?.canRedo} on={() => c().redo().run()}><Redo2 className="size-4" /></ToolBtn>
        </span>
      </div>
      {linkOpen && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-soft/40 p-2">
          <Input aria-label={t('admin.blog.rte.linkUrl')} placeholder="https://" value={href} autoFocus onChange={(e) => setHref(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } if (e.key === 'Escape') setLinkOpen(false); }} className="min-w-0 flex-1" />
          <Button type="button" size="sm" onClick={applyLink}>{t('admin.blog.rte.apply')}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setLinkOpen(false)}>{t('admin.blog.rte.cancel')}</Button>
        </div>
      )}
      {st?.image && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-soft/40 p-2">
          <span className="text-sm font-semibold">{t('admin.blog.rte.imageAlt')}</span>
          <Input aria-label={t('admin.blog.rte.imageAlt')} placeholder={t('admin.blog.rte.imageAltHint')} maxLength={200} value={st.alt} onChange={(e) => editor.chain().updateAttributes('image', { alt: e.target.value }).run()} className="min-w-0 flex-1" />
          <Button type="button" size="sm" variant="outline" onClick={() => c().deleteSelection().run()}>{t('admin.blog.rte.imageRemove')}</Button>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
