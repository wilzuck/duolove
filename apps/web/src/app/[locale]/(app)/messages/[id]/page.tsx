'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, CheckCheck, Flag, HeartCrack, ImagePlus, MoreVertical, Send, Smile, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, cn, IconButton, Skeleton, Textarea } from '@duomatch/ui';
import { ReportDialog } from '@/components/app/ReportDialog';
import { useApiError } from '@/hooks/useApiError';
import { getSocket } from '@/hooks/useRealtime';
import { keys, useConversations } from '@/hooks/useQueries';
import { Link, useRouter } from '@/i18n/navigation';
import { api, del, post, upload } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useUi } from '@/lib/store';
import type { ChatMessage, Paged } from '@/lib/types';

const EMOJIS = ['😀', '😂', '😍', '🥰', '😘', '😉', '😊', '😎', '🤗', '🙏', '👍', '👏', '🎉', '❤️', '💕', '💖', '🔥', '✨', '🌹', '🌍', '☀️', '🍽️', '🎶', '💃', '😅', '🤔', '😢', '😴'];
type MsgPage = Paged<ChatMessage> & { readReceipts: boolean };

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const qc = useQueryClient();
  const router = useRouter();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const typing = useUi((s) => !!s.typing[id]);
  const { data: convs } = useConversations();
  const conv = convs?.find((c) => c.id === id);
  const [text, setText] = useState('');
  const [emoji, setEmoji] = useState(false);
  const [menu, setMenu] = useState(false);
  const [report, setReport] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const lastTyping = useRef(0);

  const q = useInfiniteQuery({
    queryKey: keys.messages(id), initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<MsgPage>(`/conversations/${id}/messages?limit=30${pageParam ? `&cursor=${pageParam}` : ''}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined, retry: false,
  });
  const messages = useMemo(() => [...(q.data?.pages ?? [])].reverse().flatMap((p) => p.items), [q.data]);
  const lastId = messages.at(-1)?.id;
  // Séparateurs de jour calculés hors du rendu des lignes.
  const rows = useMemo(() => {
    const days = messages.map((m) => formatDate(m.createdAt, locale, { weekday: 'long', day: 'numeric', month: 'long' }));
    return messages.map((m, i) => ({ m, day: days[i]!, sep: i === 0 || days[i] !== days[i - 1] }));
  }, [messages, locale]);

  // Marque comme lu à l'ouverture et à chaque nouveau message reçu.
  const read = useMutation({ mutationFn: () => post(`/conversations/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }) });
  const theirLast = [...messages].reverse().find((m) => !m.mine)?.id;
  useEffect(() => { if (theirLast) read.mutate(); }, [theirLast]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [lastId, typing]);

  const append = (m: ChatMessage) => qc.setQueryData<{ pages: MsgPage[]; pageParams: unknown[] }>(keys.messages(id), (old) => {
    if (!old || old.pages.some((p) => p.items.some((x) => x.id === m.id))) return old;
    const [first, ...rest] = old.pages;
    return { ...old, pages: [{ ...first!, items: [...first!.items, m] }, ...rest] };
  });
  const send = useMutation({ mutationFn: (body: string) => post<ChatMessage>(`/conversations/${id}/messages`, { body }), onSuccess: (m) => { append(m); void qc.invalidateQueries({ queryKey: ['conversations'] }); }, onError: (e) => toast('error', err(e)) });
  const sendImg = useMutation({ mutationFn: (f: File) => upload<ChatMessage>(`/conversations/${id}/images`, f, f.name), onSuccess: append, onError: (e) => toast('error', err(e)) });
  const remove = useMutation({ mutationFn: (mid: string) => del(`/messages/${mid}`), onSuccess: () => qc.invalidateQueries({ queryKey: keys.messages(id) }), onError: (e) => toast('error', err(e)) });
  const unmatch = useMutation({ mutationFn: () => del(`/matches/${conv!.matchId}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['conversations'] }); toast('info', t('chat.unmatched')); router.replace('/messages'); } });
  const block = useMutation({ mutationFn: () => post(`/blocks/${conv!.user.id}`), onSuccess: () => { void qc.invalidateQueries(); toast('success', t('report.blocked', { name: conv!.user.displayName })); router.replace('/messages'); } });

  const submit = () => { const b = text.trim(); if (!b || send.isPending) return; setText(''); setEmoji(false); send.mutate(b); };
  const onType = (v: string) => {
    setText(v);
    if (Date.now() - lastTyping.current > 2000) { lastTyping.current = Date.now(); getSocket()?.emit('typing', { conversationId: id, isTyping: true }); }
  };

  const closed = q.isError;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-card px-3 py-3">
        <Link href="/messages" className="rounded-full p-2 hover:bg-soft lg:hidden" aria-label={t('common.back')}><ArrowLeft className="size-5" /></Link>
        {conv ? (
          <Link href={`/profile/${conv.user.id}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar src={conv.user.thumbUrl} name={conv.user.displayName} size={42} /><span className="min-w-0"><span className="block truncate font-bold">{conv.user.displayName}</span><span className="block text-xs text-muted" aria-live="polite">{typing ? t('chat.typing') : t('chat.viewProfile')}</span></span></Link>
        ) : <Skeleton className="h-10 flex-1" />}
        <div className="relative">
          <IconButton label={t('chat.options')} tone="plain" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-haspopup="menu"><MoreVertical className="size-5" /></IconButton>
          {menu && conv && (
            <ul role="menu" className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-2xl border border-line bg-card py-1 shadow-pop">
              <li><button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft" onClick={() => { setMenu(false); unmatch.mutate(); }}><HeartCrack className="size-4" aria-hidden />{t('chat.unmatch')}</button></li>
              <li><button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft" onClick={() => { setMenu(false); block.mutate(); }}><Ban className="size-4" aria-hidden />{t('report.block')}</button></li>
              <li><button role="menuitem" className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-soft" onClick={() => { setMenu(false); setReport(true); }}><Flag className="size-4" aria-hidden />{t('report.cta')}</button></li>
            </ul>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-soft/40 px-3 py-4" role="log" aria-live="polite" aria-label={t('chat.history')}>
        {q.isLoading && <div className="space-y-3"><Skeleton className="ml-auto h-12 w-2/3" /><Skeleton className="h-12 w-1/2" /><Skeleton className="ml-auto h-12 w-1/2" /></div>}
        {closed && <p className="m-auto max-w-sm py-10 text-center text-muted">{t('chat.closed')}</p>}
        {q.hasNextPage && <div className="mb-4 text-center"><Button variant="outline" size="sm" onClick={() => q.fetchNextPage()} loading={q.isFetchingNextPage}>{t('chat.older')}</Button></div>}
        {q.data && messages.length === 0 && <p className="py-10 text-center text-muted">{t('chat.firstMessage', { name: conv?.user.displayName ?? '' })}</p>}
        <ul className="space-y-1.5">
          {rows.map(({ m, day, sep }) => {
            return (
              <li key={m.id}>
                {sep && <p className="my-3 text-center text-xs font-medium text-muted">{day}</p>}
                <div className={cn('group flex items-end gap-2', m.mine && 'flex-row-reverse')}>
                  <div className={cn('max-w-[78%] rounded-3xl px-4 py-2.5 text-[15px] shadow-sm', m.mine ? 'rounded-br-lg bg-linear-to-br from-brand-strong to-brand-strong-2 text-white' : 'rounded-bl-lg bg-card')}>
                    {m.deleted ? <em className="opacity-70">{t('chat.deleted')}</em> : (<>
                      {m.attachments.map((a) => <img key={a.id} src={a.url} alt={t('chat.imageAlt')} className="mb-1 max-h-72 rounded-2xl" loading="lazy" />)}
                      {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    </>)}
                    <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px]', m.mine ? 'text-white/80' : 'text-muted')}>{formatTime(m.createdAt, locale)}{m.mine && !m.deleted && (m.readAt ? <CheckCheck className="size-3.5" aria-label={t('chat.read')} /> : <Check className="size-3.5" aria-label={t('chat.sent')} />)}</p>
                  </div>
                  {m.mine && !m.deleted && <IconButton label={t('chat.deleteMessage')} size="sm" onClick={() => remove.mutate(m.id)} className="opacity-0 focus:opacity-100 group-hover:opacity-100"><Trash2 className="size-4" /></IconButton>}
                </div>
              </li>
            );
          })}
        </ul>
        {typing && <p className="mt-2 text-sm text-muted" aria-hidden>{t('chat.typingDots')}</p>}
        <div ref={bottom} />
      </div>

      {!closed && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="relative border-t border-line bg-card p-3 pb-safe">
          {emoji && (
            <div role="group" aria-label={t('chat.emojis')} className="absolute right-3 bottom-full mb-2 grid w-72 grid-cols-7 gap-1 rounded-2xl border border-line bg-card p-3 shadow-pop">
              {EMOJIS.map((e) => <button key={e} type="button" onClick={() => setText((s) => s + e)} className="rounded-lg p-1.5 text-xl hover:bg-soft" aria-label={e}>{e}</button>)}
            </div>
          )}
          <div className="flex items-end gap-2">
            <IconButton label={t('chat.attach')} onClick={() => file.current?.click()} disabled={sendImg.isPending}><ImagePlus className="size-5" /></IconButton>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImg.mutate(f); e.target.value = ''; }} />
            <Textarea aria-label={t('chat.compose')} placeholder={t('chat.compose')} rows={1} maxLength={2000} value={text} onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }} className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl py-2.5" />
            <IconButton label={t('chat.emojis')} onClick={() => setEmoji(!emoji)} aria-expanded={emoji}><Smile className="size-5" /></IconButton>
            <Button type="submit" size="icon" aria-label={t('chat.send')} disabled={!text.trim()} loading={send.isPending}><Send className="size-5" /></Button>
          </div>
        </form>
      )}
      {conv && <ReportDialog userId={conv.user.id} open={report} onClose={() => setReport(false)} />}
    </div>
  );
}
