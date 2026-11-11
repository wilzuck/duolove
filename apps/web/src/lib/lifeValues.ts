import { Anchor, Bird, Compass, Flower2, Gift, Handshake, HeartHandshake, House, Laugh, MessageCircle, Mountain, Palette, Rocket, ShieldCheck, Sparkles, Sprout, Sun, type LucideIcon } from 'lucide-react';

/** « Ce qui compte le plus pour moi » : catalogue (mêmes codes que le serveur, `LIFE_VALUES`) ; le reste est une valeur libre écrite par la personne. */
export const LIFE_VALUES = ['HONESTY', 'RESPECT', 'MINDFULNESS', 'FAMILY', 'LOYALTY', 'KINDNESS', 'HUMOR', 'AMBITION', 'FREEDOM', 'GENEROSITY', 'COMMUNICATION', 'ADVENTURE', 'CREATIVITY', 'STABILITY', 'GROWTH', 'SPIRITUALITY'] as const;
export const MAX_LIFE_VALUES = 3;
export const CUSTOM_VALUE_MAX = 24;
export const VALUE_ICONS: Record<(typeof LIFE_VALUES)[number], LucideIcon> = {
  HONESTY: ShieldCheck, RESPECT: Handshake, MINDFULNESS: Flower2, FAMILY: House, LOYALTY: Anchor, KINDNESS: HeartHandshake, HUMOR: Laugh, AMBITION: Rocket,
  FREEDOM: Bird, GENEROSITY: Gift, COMMUNICATION: MessageCircle, ADVENTURE: Compass, CREATIVITY: Palette, STABILITY: Mountain, GROWTH: Sprout, SPIRITUALITY: Sun,
};
export const isCatalogValue = (v: string): v is (typeof LIFE_VALUES)[number] => (LIFE_VALUES as readonly string[]).includes(v);
export const valueIcon = (v: string): LucideIcon => (isCatalogValue(v) ? VALUE_ICONS[v] : Sparkles);
