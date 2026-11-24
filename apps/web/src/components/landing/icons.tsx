import {
  BookOpen,
  CalendarDays,
  EyeOff,
  FileSearch,
  FlaskConical,
  History,
  Layers,
  ListChecks,
  LockKeyhole,
  MessageCircleQuestion,
  Settings2,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';

import type { LandingIcon } from '@/content/landing/types';

const ICONS: Record<LandingIcon, LucideIcon> = {
  settings: Settings2,
  'user-check': UserCheck,
  list: ListChecks,
  'file-search': FileSearch,
  sparkles: Sparkles,
  calendar: CalendarDays,
  history: History,
  lock: LockKeyhole,
  device: Smartphone,
  'eye-off': EyeOff,
  trash: Trash2,
  layers: Layers,
  book: BookOpen,
  tag: Tag,
  message: MessageCircleQuestion,
  flask: FlaskConical,
};

export function LandingIconView({ name, className }: { name: LandingIcon; className?: string }) {
  const Icon = ICONS[name];
  return <Icon aria-hidden="true" className={className} />;
}
