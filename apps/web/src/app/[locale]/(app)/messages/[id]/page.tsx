'use client';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, CalendarHeart, Check, CheckCheck, Flag, HeartCrack, ImagePlus, Lightbulb, Lock, MoreVertical, Reply, Send, ShieldAlert, Smile, SmilePlus, Trash2, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Checkbox, cn, Dialog, IconButton, Skeleton, Textarea } from '@duomatch/ui';
import { CallButtons } from '@/components/app/CallLayer';
import { DatesPanel } from '@/components/app/DatesPanel';
import { IcebreakerPanel } from '@/components/app/IcebreakerPanel';
import { ReportDialog } from '@/components/app/ReportDialog';
import { useApiError } from '@/hooks/useApiError';
import { getSocket } from '@/hooks/useRealtime';
import { keys, useConversations, useEngagementConfig, useMe } from '@/hooks/useQueries';
import { Link, useRouter } from '@/i18n/navigation';
import { ApiError, api, del, post, put, upload } from '@/lib/api';
import { formatDate, formatTime } from '@/lib/format';
import { useLocalPref } from '@/lib/prefs';
import { useUi } from '@/lib/store';
import type { ChatMessage, Paged } from '@/lib/types';
import { VerifiedBadge } from '@/components/app/VerifiedBadge';

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
  const [upsell, setUpsell] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [ideas, setIdeas] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const { data: cfg } = useEngagementConfig();
  const canReact = !!cfg?.flags.message_reactions;
  const canReply = !!cfg?.flags.message_replies;
  const canIdeas = !!cfg?.flags.icebreakers;
  const canDates = !!cfg?.flags.date_proposals;
  const [datesOpen, setDatesOpen] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  // Préférence « Entrée envoie » : mémorisée sur cet appareil uniquement (aucune donnée envoyée au serveur).
  const [enterSends, toggleEnter] = useLocalPref('duomatch.enterSends', true);
  const { data: me } = useMe();
  const canImages = !!me?.entitlement.limits.chatImages;
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
  const send = useMutation({ mutationFn: (v: { body: string; replyToId?: string }) => post<ChatMessage>(`/conversations/${id}/messages`, v), onSuccess: (m) => { append(m); void qc.invalidateQueries({ queryKey: ['conversations'] }); }, onError: (e) => toast('error', err(e)) });
  const setReactions = (messageId: string, reactions: ChatMessage['reactions']) => qc.setQueryData<{ pages: MsgPage[]; pageParams: unknown[] }>(keys.messages(id), (old) => old && { ...old, pages: old.pages.map((pg) => ({ ...pg, items: pg.items.map((x) => (x.id === messageId ? { ...x, reactions } : x)) })) });
  const react = useMutation({ mutationFn: ({ mid, emoji }: { mid: string; emoji: string | null }) => (emoji ? put<{ messageId: string; reactions: ChatMessage['reactions'] }>(`/messages/${mid}/reaction`, { emoji }) : del<{ messageId: string; reactions: ChatMessage['reactions'] }>(`/messages/${mid}/reaction`)), onSuccess: (r) => { setReactions(r.messageId, r.reactions); setPicker(null); }, onError: (e) => toast('error', err(e)) });
  const sendImg = useMutation({ mutationFn: (f: File) => upload<ChatMessage>(`/conversations/${id}/images`, f, f.name), onSuccess: append, onError: (e) => (e instanceof ApiError && e.code === 'PLAN_REQUIRED' ? setUpsell(true) : toast('error', err(e))) });
  const remove = useMutation({ mutationFn: (mid: string) => del(`/messages/${mid}`), onSuccess: () => qc.invalidateQueries({ queryKey: keys.messages(id) }), onError: (e) => toast('error', err(e)) });
  const unmatch = useMutation({ mutationFn: () => del(`/matches/${conv!.matchId}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['conversations'] }); toast('info', t('chat.unmatched')); router.replace('/messages'); } });
  const block = useMutation({ mutationFn: () => post(`/blocks/${conv!.user.id}`), onSuccess: () => { void qc.invalidateQueries(); toast('success', t('report.blocked', { name: conv!.user.displayName })); router.replace('/messages'); } });

  const submit = () => { const b = text.trim(); if (!b || send.isPending) return; setText(''); setEmoji(false); setIdeas(false); send.mutate({ body: b, ...(replyTo ? { replyToId: replyTo.id } : {}) }); setReplyTo(null); };
  // Insère à l'endroit du curseur (et non à la fin), puis remet le focus dans le champ.
  const insert = (s: string) => { const el = area.current; const at = el?.selectionStart ?? text.length; const end = el?.selectionEnd ?? at; setText((v) => v.slice(0, at) + s + v.slice(end)); requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + s.length, at + s.length); }); };
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
          <Link href={`/profile/${conv.user.id}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar src={conv.user.thumbUrl} name={conv.user.displayName} size={42} /><span className="min-w-0"><span className="flex min-w-0 items-center gap-1 font-bold"><span className="truncate">{conv.user.displayName}</span>{conv.user.verified && <VerifiedBadge size="sm" />}</span><span className="block text-xs text-muted" aria-live="polite">{typing ? t('chat.typing') : t('chat.viewProfile')}</span></span></Link>
        ) : <Skeleton className="h-10 flex-1" />}
        {cfg?.calls.enabled && !closed && conv && <CallButtons conversationId={id} name={conv.user.displayName} />}
        {canDates && conv && <IconButton label={t('dates.open')} tone="plain" onClick={() => setDatesOpen(true)}><CalendarHeart className="size-5" /></IconButton>}
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
                  <div className={cn('flex max-w-[78%] flex-col', m.mine ? 'items-end' : 'items-start')}>
                    <div onClick={() => setActive(active === m.id ? null : m.id)} className={cn('rounded-3xl px-4 py-2.5 text-[15px] shadow-sm', m.mine ? 'rounded-br-lg bg-linear-to-br from-brand-strong to-brand-strong-2 text-white' : 'rounded-bl-lg bg-card')}>
                      {m.replyTo && (
                        <blockquote className={cn('mb-1.5 rounded-xl border-l-4 px-3 py-1.5 text-xs', m.mine ? 'border-white/60 bg-white/15' : 'border-brand bg-soft')}>
                          <span className="block font-semibold">{m.replyTo.mine ? t('chat.you') : conv?.user.displayName}</span>
                          <span className="line-clamp-2 opacity-90">{m.replyTo.deleted ? t('chat.replyDeleted') : m.replyTo.body ?? (m.replyTo.hasImage ? t('chat.replyPhoto') : '')}</span>
                        </blockquote>
                      )}
                      {m.deleted ? <em className="opacity-70">{t('chat.deleted')}</em> : (<>
                        {m.attachments.map((a) => <img key={a.id} src={a.url} alt={t('chat.imageAlt')} className="mb-1 max-h-72 rounded-2xl" loading="lazy" />)}
                        {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                      </>)}
                      <p className={cn('mt-0.5 flex items-center justify-end gap-1 text-[11px]', m.mine ? 'text-white/80' : 'text-muted')}>{formatTime(m.createdAt, locale)}{m.mine && !m.deleted && (m.readAt ? <CheckCheck className="size-3.5" aria-label={t('chat.read')} /> : <Check className="size-3.5" aria-label={t('chat.sent')} />)}</p>
                    </div>
                    {canReact && m.reactions.length > 0 && (
                      <ul className="-mt-2 flex flex-wrap gap-1 px-2" aria-label={t('chat.react')}>
                        {m.reactions.map((r) => (
                          <li key={r.emoji}><button type="button" onClick={() => react.mutate({ mid: m.id, emoji: r.mine ? null : r.emoji })} aria-pressed={r.mine} aria-label={t('chat.reactedWith', { emoji: r.emoji, n: r.count })}
                            className={cn('rounded-full border bg-card px-2 py-0.5 text-xs shadow-sm', r.mine ? 'border-brand-strong' : 'border-line')}>{r.emoji}{r.count > 1 && <span className="ml-1 font-semibold">{r.count}</span>}</button></li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {!m.deleted && (
                    <div role="group" aria-label={t('chat.messageActions')} className={cn('relative flex items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100', active === m.id && 'opacity-100')}>
                      {canReply && <IconButton label={t('chat.reply')} size="sm" onClick={() => { setReplyTo(m); area.current?.focus(); }}><Reply className="size-4" /></IconButton>}
                      {canReact && <IconButton label={t('chat.react')} size="sm" aria-expanded={picker === m.id} onClick={() => setPicker(picker === m.id ? null : m.id)}><SmilePlus className="size-4" /></IconButton>}
                      {m.mine && <IconButton label={t('chat.deleteMessage')} size="sm" onClick={() => remove.mutate(m.id)}><Trash2 className="size-4" /></IconButton>}
                      {picker === m.id && (
                        <div role="group" aria-label={t('chat.react')} className={cn('absolute bottom-full z-10 mb-1 flex gap-1 rounded-full border border-line bg-card p-1.5 shadow-pop', m.mine ? 'right-0' : 'left-0')}>
                          {(cfg?.reactionEmojis ?? []).map((e) => <button key={e} type="button" onClick={() => react.mutate({ mid: m.id, emoji: e })} aria-label={t('chat.reactWith', { emoji: e })} className="rounded-full p-1.5 text-xl hover:bg-soft">{e}</button>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        {typing && <p className="mt-2 text-sm text-muted" aria-hidden>{t('chat.typingDots')}</p>}
        <div ref={bottom} />
      </div>

      {!closed && (
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="relative border-t border-line bg-card px-4 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {emoji && (
            <div role="group" aria-label={t('chat.emojis')} className="absolute right-3 bottom-full mb-2 grid w-72 grid-cols-7 gap-1 rounded-2xl border border-line bg-card p-3 shadow-pop">
              {EMOJIS.map((e) => <button key={e} type="button" onClick={() => insert(e)} className="rounded-lg p-1.5 text-xl hover:bg-soft" aria-label={e}>{e}</button>)}
            </div>
          )}
          {ideas && canIdeas && <IcebreakerPanel conversationId={id} onPick={(txt) => { setText(txt); setIdeas(false); requestAnimationFrame(() => area.current?.focus()); }} />}
          {replyTo && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-2xl bg-soft px-3 py-2 text-sm">
              <p className="min-w-0"><span className="font-semibold">{t('chat.replyingTo', { who: replyTo.mine ? t('chat.you') : conv?.user.displayName ?? '' })}</span><span className="block truncate text-muted">{replyTo.body ?? t('chat.replyPhoto')}</span></p>
              <IconButton label={t('chat.cancelReply')} size="sm" onClick={() => setReplyTo(null)}><X className="size-4" /></IconButton>
            </div>
          )}
          <div className="flex items-end gap-2">
            {canIdeas && <IconButton label={t('chat.iceOpen')} aria-expanded={ideas} onClick={() => setIdeas(!ideas)}><Lightbulb className="size-5" /></IconButton>}
            <IconButton label={canImages ? t('chat.attach') : t('chat.attachLocked')} onClick={() => (canImages ? file.current?.click() : setUpsell(true))} disabled={sendImg.isPending}>
              <span className="relative"><ImagePlus className="size-5" />{!canImages && <Lock className="absolute -right-1.5 -bottom-1.5 size-3.5 rounded-full bg-card p-0.5 text-brand-ink" aria-hidden />}</span>
            </IconButton>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" aria-hidden className="sr-only" tabIndex={-1} onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImg.mutate(f); e.target.value = ''; }} />
            <Textarea ref={area} aria-label={t('chat.compose')} placeholder={t('chat.compose')} rows={1} maxLength={2000} value={text} onChange={(e) => onType(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ((enterSends && !e.shiftKey) || e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} className="max-h-32 min-h-11 flex-1 resize-none rounded-3xl py-2.5" />
            <IconButton label={t('chat.emojis')} onClick={() => setEmoji(!emoji)} aria-expanded={emoji}><Smile className="size-5" /></IconButton>
            <Button type="submit" size="icon" aria-label={t('chat.send')} disabled={!text.trim()} loading={send.isPending}><Send className="size-5" /></Button>
          </div>
          <div className="mt-3 space-y-2">
            <Checkbox align="center" className="text-xs text-muted" label={t('chat.enterSends')} checked={enterSends} onChange={(e) => toggleEnter(e.target.checked)} />
            <p className="flex items-start gap-1.5 text-xs text-muted"><ShieldAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /><span>{t('chat.scamWarning')}</span></p>
          </div>
        </form>
      )}
      <Dialog open={upsell} onClose={() => setUpsell(false)} title={t('chat.imagePlanTitle')} closeLabel={t('common.close')}>
        <p className="text-sm">{t('chat.imagePlanText')}</p>
        <div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setUpsell(false)}>{t('common.close')}</Button><Link href="/premium"><Button>{t('chat.seePlans')}</Button></Link></div>
      </Dialog>
      {conv && <DatesPanel conversationId={id} name={conv.user.displayName} open={datesOpen} onClose={() => setDatesOpen(false)} />}
      {conv && <ReportDialog userId={conv.user.id} open={report} onClose={() => setReport(false)} />}
    </div>
  );
}
