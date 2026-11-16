import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Bus,
  Camera,
  Car,
  Coffee,
  Coins,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Headphones,
  Heart,
  HeartPulse,
  House,
  Landmark,
  Laptop,
  Mountain,
  PawPrint,
  PiggyBank,
  Pill,
  Plane,
  Receipt,
  Rocket,
  Shapes,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  Star,
  Tag,
  TreePalm,
  TrendingUp,
  Utensils,
  Wallet,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { AccountType, ColorKey } from "./api/types";

export const ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  coffee: Coffee,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  bus: Bus,
  car: Car,
  bike: Bike,
  fuel: Fuel,
  receipt: Receipt,
  house: House,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  "heart-pulse": HeartPulse,
  pill: Pill,
  "graduation-cap": GraduationCap,
  "book-open": BookOpen,
  "gamepad-2": Gamepad2,
  film: Film,
  headphones: Headphones,
  plane: Plane,
  "tree-palm": TreePalm,
  mountain: Mountain,
  camera: Camera,
  gift: Gift,
  shirt: Shirt,
  baby: Baby,
  "paw-print": PawPrint,
  dumbbell: Dumbbell,
  heart: Heart,
  star: Star,
  sparkles: Sparkles,
  rocket: Rocket,
  briefcase: Briefcase,
  laptop: Laptop,
  coins: Coins,
  "hand-coins": HandCoins,
  "trending-up": TrendingUp,
  "piggy-bank": PiggyBank,
  wallet: Wallet,
  banknote: Banknote,
  landmark: Landmark,
  shapes: Shapes,
  tag: Tag,
};

export const CATEGORY_ICON_KEYS = Object.keys(ICONS).filter((k) => !["landmark", "wallet", "banknote"].includes(k));

export const GOAL_ICON_KEYS = [
  "piggy-bank", "laptop", "smartphone", "plane", "tree-palm", "mountain", "house", "car", "bike",
  "graduation-cap", "heart", "gift", "camera", "gamepad-2", "headphones", "rocket", "star", "sparkles",
];

export function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? Tag;
}

export const COLORS: ColorKey[] = ["lavender", "mint", "peach", "butter", "sky", "rose", "sage", "sand"];

export const COLOR_LABEL: Record<ColorKey, string> = {
  lavender: "Lavender",
  mint: "Mint",
  peach: "Peach",
  butter: "Butter",
  sky: "Sky",
  rose: "Rose",
  sage: "Sage",
  sand: "Sand",
};

export function tone(color: ColorKey | string) {
  const c = (COLORS as string[]).includes(color) ? color : "lavender";
  return {
    tint: `var(--${c}-tint)`,
    strong: `var(--${c}-strong)`,
    ink: `var(--${c}-ink)`,
  };
}

export const ACCOUNT_TYPES: { value: AccountType; label: string; icon: LucideIcon; color: ColorKey; hint: string }[] = [
  { value: "bank", label: "Bank", icon: Landmark, color: "sky", hint: "Rekening tabungan atau giro" },
  { value: "ewallet", label: "E-wallet", icon: Smartphone, color: "lavender", hint: "Dompet digital" },
  { value: "cash", label: "Tunai", icon: Banknote, color: "sage", hint: "Uang di dompet" },
];

export function accountMeta(type: AccountType) {
  return ACCOUNT_TYPES.find((t) => t.value === type) ?? ACCOUNT_TYPES[0];
}
