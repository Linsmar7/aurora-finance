import React from "react";
import {
  Utensils,
  ShoppingCart,
  Home,
  Car,
  Sparkles,
  ShoppingBag,
  HeartPulse,
  Plane,
  GraduationCap,
  Receipt,
  MoreHorizontal,
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowLeftRight,
  AlertCircle,
  HelpCircle,
  Tag,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Utensils,
  ShoppingCart,
  Home,
  Car,
  Sparkles,
  ShoppingBag,
  HeartPulse,
  Plane,
  GraduationCap,
  Receipt,
  MoreHorizontal,
  Wallet,
  TrendingUp,
  ArrowDownLeft,
  ArrowLeftRight,
  AlertCircle,
  HelpCircle,
  Tag,
};

export function CategoryIcon({
  name,
  className = "w-4 h-4",
  style,
}: {
  name?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const IconComponent = (name && ICON_MAP[name]) || Tag;
  return <IconComponent className={className} style={style} />;
}

