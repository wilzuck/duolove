import { BookOpen, Camera, ChefHat, Church, Clapperboard, Cpu, Dumbbell, Gamepad2, Leaf, Music, Palette, PartyPopper, Plane, Rocket, Shirt, Sparkles, Users, type LucideIcon } from 'lucide-react';

/** Icône de chaque centre d'intérêt du catalogue (INTEREST_SLUGS) ; une étincelle pour un intérêt inconnu. */
const ICONS: Record<string, LucideIcon> = {
  music: Music, cinema: Clapperboard, cooking: ChefHat, travel: Plane, sport: Dumbbell, reading: BookOpen, dance: PartyPopper, faith: Church,
  fashion: Shirt, tech: Cpu, art: Palette, nature: Leaf, photography: Camera, gaming: Gamepad2, entrepreneurship: Rocket, family: Users,
};
export const interestIcon = (slug: string): LucideIcon => ICONS[slug] ?? Sparkles;
