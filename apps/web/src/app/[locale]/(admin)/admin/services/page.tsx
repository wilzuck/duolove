'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight, BadgeCheck, Bell, BellOff, CalendarClock, CalendarHeart, CheckCircle2, ChevronRight, Clock, Coins, CreditCard, DatabaseBackup, Eye, EyeOff, Gift, Globe2, HelpCircle, Hourglass, Image as ImageIcon,
  Heart, Lightbulb, ListChecks, Lock, Mail, MailCheck, MapPin, MessageCircle, MessageCircleQuestion, MessageSquareHeart, Moon, Newspaper, Pencil, Phone, Radio, Rocket, Search, Send, Share2, ShieldCheck, Smartphone,
  Smile, Sparkles, Star, Tag, UserPlus, Users, Video, Wallet, Zap, CloudUpload, RotateCcw, type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';
import type { FlagKey } from '@duomatch/types';
import { Badge, Card, Skeleton, Switch } from '@duomatch/ui';
import { PageHeader } from '@/components/admin/PageParts';
import { useApiError } from '@/hooks/useApiError';
import { Link } from '@/i18n/navigation';
import { api, put } from '@/lib/api';
import { useUi } from '@/lib/store';

type Icons = readonly [LucideIcon, LucideIcon, LucideIcon];
interface Service { id: string; icon: LucideIcon; flag?: FlagKey; to?: string; icons: Icons; group: 'access' | 'money' | 'social' | 'content' | 'tech' }

/** Les services de l'application : chacun a trois étapes illustrées, un lien vers son réglage et, quand il existe, son interrupteur (feature flag). */
const SERVICES: Service[] = [
  { id: 'registration_open', icon: UserPlus, flag: 'registration_open', group: 'access', icons: [UserPlus, MailCheck, BadgeCheck] },
  { id: 'access', icon: Lock, to: '/admin/access', group: 'access', icons: [Lock, Clock, CreditCard] },
  { id: 'countries', icon: Globe2, to: '/admin/countries', group: 'access', icons: [Globe2, UserPlus, Users] },
  { id: 'payments_enabled', icon: CreditCard, flag: 'payments_enabled', to: '/admin/payment', group: 'money', icons: [CreditCard, Smartphone, BadgeCheck] },
  { id: 'promo_codes', icon: Gift, flag: 'promo_codes', to: '/admin/promos', group: 'money', icons: [Gift, Tag, Wallet] },
  { id: 'boosts', icon: Rocket, flag: 'boosts', to: '/admin/plans', group: 'money', icons: [Rocket, Zap, Eye] },
  { id: 'live_match', icon: Radio, flag: 'live_match', group: 'social', icons: [Search, Send, MessageCircle] },
  { id: 'live_events', icon: CalendarClock, to: '/admin/live-events', group: 'social', icons: [CalendarClock, Bell, Radio] },
  { id: 'speed_dating', icon: Hourglass, flag: 'speed_dating', to: '/admin/speed', group: 'social', icons: [Hourglass, UserPlus, MessageCircle] },
  { id: 'super_likes', icon: Star, flag: 'super_likes', group: 'social', icons: [Star, Bell, Heart] },
  { id: 'like_comments', icon: MessageSquareHeart, flag: 'like_comments', group: 'social', icons: [Heart, MessageSquareHeart, Send] },
  { id: 'daily_picks', icon: Sparkles, flag: 'daily_picks', to: '/admin/engagement', group: 'social', icons: [Sparkles, Eye, Heart] },
  { id: 'profile_prompts', icon: HelpCircle, flag: 'profile_prompts', to: '/admin/engagement', group: 'social', icons: [HelpCircle, Pencil, Eye] },
  { id: 'daily_question', icon: MessageCircleQuestion, flag: 'daily_question', to: '/admin/engagement', group: 'social', icons: [MessageCircleQuestion, Pencil, Eye] },
  { id: 'profile_tips', icon: ListChecks, flag: 'profile_tips', group: 'social', icons: [ListChecks, Lightbulb, BadgeCheck] },
  { id: 'icebreakers', icon: Lightbulb, flag: 'icebreakers', to: '/admin/engagement', group: 'social', icons: [Lightbulb, Send, MessageCircle] },
  { id: 'message_reactions', icon: Smile, flag: 'message_reactions', group: 'social', icons: [MessageCircle, Smile, Eye] },
  { id: 'message_replies', icon: MessageCircle, flag: 'message_replies', group: 'social', icons: [MessageCircle, Pencil, Send] },
  { id: 'chat_images', icon: ImageIcon, flag: 'chat_images', group: 'social', icons: [ImageIcon, Send, MessageCircle] },
  { id: 'date_proposals', icon: CalendarHeart, flag: 'date_proposals', to: '/admin/engagement', group: 'social', icons: [CalendarHeart, MapPin, CheckCircle2] },
  { id: 'calls', icon: Phone, flag: 'calls', to: '/admin/engagement', group: 'social', icons: [Heart, Phone, Video] },
  { id: 'pause_mode', icon: Moon, flag: 'pause_mode', to: '/admin/engagement', group: 'social', icons: [Moon, EyeOff, BellOff] },
  { id: 'referral_program', icon: Share2, flag: 'referral_program', group: 'social', icons: [Share2, UserPlus, Coins] },
  { id: 'blog', icon: Newspaper, to: '/admin/blog', group: 'content', icons: [Newspaper, ImageIcon, BadgeCheck] },
  { id: 'broadcasts', icon: Mail, to: '/admin/broadcasts', group: 'content', icons: [Users, Mail, Send] },
  { id: 'backups', icon: DatabaseBackup, to: '/admin/backups', group: 'tech', icons: [DatabaseBackup, CloudUpload, RotateCcw] },
  { id: 'storage', icon: CloudUpload, to: '/admin/storage', group: 'tech', icons: [ImageIcon, CloudUpload, ShieldCheck] },
];
const GROUPS = ['access', 'money', 'social', 'content', 'tech'] as const;

interface Flag { key: FlagKey; enabled: boolean }

function Steps({ icons, labels }: { icons: Icons; labels: string[] }) {
  return (
    <ol className="flex items-start gap-1">
      {icons.map((Icon, i) => (
        <Fragment key={i}>
          {i > 0 && <li aria-hidden className="pt-3 text-muted"><ChevronRight className="size-4" /></li>}
          <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <span className="relative grid size-11 place-items-center rounded-2xl bg-linear-to-br from-brand-strong to-brand-strong-2 text-white shadow-soft"><Icon className="size-5" aria-hidden />
              <span className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full border-2 border-card bg-card text-[10px] font-extrabold text-brand-ink">{i + 1}</span></span>
            <span className="text-xs leading-tight font-semibold">{labels[i]}</span>
          </li>
        </Fragment>
      ))}
    </ol>
  );
}

export default function AdminServices() {
  const t = useTranslations();
  const qc = useQueryClient();
  const err = useApiError();
  const toast = useUi((s) => s.toast);
  const flags = useQuery({ queryKey: ['admin', 'flags'], queryFn: () => api<Flag[]>('/admin/feature-flags') });
  const access = useQuery({ queryKey: ['admin', 'access'], queryFn: () => api<{ enabled: boolean }>('/admin/access'), retry: false });
  const set = useMutation({
    mutationFn: ({ k, enabled }: { k: FlagKey; enabled: boolean }) => put(`/admin/feature-flags/${k}`, { enabled }),
    onSuccess: (_r, v) => { toast('success', t('admin.ff.saved', { name: t(`admin.ff.items.${v.k}.name` as never), state: t(v.enabled ? 'admin.ff.on' : 'admin.ff.off').toLowerCase() })); void qc.invalidateQueries({ queryKey: ['admin', 'flags'] }); },
    onError: (e) => toast('error', err(e)),
  });
  const on = (k: FlagKey) => flags.data?.find((f) => f.key === k)?.enabled;

  return (
    <div className="space-y-8">
      <PageHeader title={t('admin.services.title')} description={t('admin.services.subtitle')} />
      {flags.isLoading && <Skeleton className="h-64" />}
      {flags.data && GROUPS.map((g) => (
        <section key={g} aria-labelledby={`sv-${g}`} className="space-y-3">
          <h3 id={`sv-${g}`} className="text-sm font-semibold tracking-wide text-muted uppercase">{t(`admin.services.group.${g}`)}</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {SERVICES.filter((s) => s.group === g).map((s) => {
              const labels = t.raw(`admin.services.items.${s.id}.steps`) as string[];
              const name = s.flag ? t(`admin.ff.items.${s.flag}.name` as never) : t(`admin.services.items.${s.id}.name`);
              const enabled = s.flag ? on(s.flag) : s.id === 'access' ? access.data?.enabled : undefined;
              return (
                <Card key={s.id} className="flex flex-col gap-4 p-5">
                  <header className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-soft text-brand-ink"><s.icon className="size-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold leading-tight">{name}</h4>
                      {enabled !== undefined && <p className="text-xs text-muted">{enabled ? t('admin.ff.on') : t('admin.ff.off')}</p>}
                    </div>
                    {s.flag ? <Switch checked={!!enabled} disabled={set.isPending} onChange={(v) => set.mutate({ k: s.flag!, enabled: v })} label={name} /> : <Badge tone={enabled ? 'success' : 'neutral'}>{t('admin.services.ownSetting')}</Badge>}
                  </header>
                  <Steps icons={s.icons} labels={labels} />
                  <p className="text-sm text-muted">{s.flag ? t(`admin.ff.items.${s.flag}.off` as never) : t(`admin.services.items.${s.id}.note`)}</p>
                  {s.to && <Link href={s.to} className="mt-auto inline-flex w-fit items-center gap-1 text-sm font-semibold text-brand-ink underline-offset-2 hover:underline">{t('admin.services.open')}<ArrowRight className="size-4" aria-hidden /></Link>}
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
