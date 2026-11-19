"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PieChart,
  ListFilter,
  UploadCloud,
  Sparkles,
  Database,
  ShieldCheck,
  Landmark,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePrivacy } from "@/components/providers/privacy-provider";

const NAV_ITEMS = [
  {
    href: "/",
    label: "Painel & Categorias",
    description: "Visão analítica de gastos",
    icon: PieChart,
  },
  {
    href: "/transactions",
    label: "Transações & Inbox",
    description: "Extrato unificado e revisão",
    icon: ListFilter,
  },
  {
    href: "/import",
    label: "Importar Extratos",
    description: "OFX, CSV e Faturas PDF",
    icon: UploadCloud,
  },
  {
    href: "/categories",
    label: "Categorias & Regras",
    description: "Orçamentos e automação",
    icon: Sparkles,
  },
  {
    href: "/settings",
    label: "Contas, IA & Backup",
    description: "SQLite local e chaves",
    icon: Database,
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { hideValues, toggleHideValues } = usePrivacy();

  return (
    <aside className="w-64 shrink-0 border-r border-slate-800/80 bg-[#070B16]/95 flex flex-col justify-between min-h-screen sticky top-0">
      <div>
        {/* Brand Header */}
        <div className="p-5 border-b border-slate-800/70">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-400 via-cyan-400 to-purple-500 p-[1px] shadow-lg shadow-cyan-500/10">
              <div className="w-full h-full bg-[#060913] rounded-[11px] flex items-center justify-center">
                <Landmark className="w-4 h-4 text-emerald-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold tracking-tight text-slate-100 text-base">
                  Aurora
                </span>
                <span className="font-semibold text-xs uppercase tracking-wider aurora-gradient-text">
                  Finance
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Local-First SQL Analytics</p>
            </div>
          </Link>
        </div>

        {/* Botão de Ocultar Valores / Modo Privacidade */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={toggleHideValues}
            title={
              hideValues
                ? "Mostrar valores (Alt+H)"
                : "Ocultar valores monetários (Alt+H)"
            }
            className={cn(
              "w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer group",
              hideValues
                ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10"
                : "bg-slate-900/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border-slate-800/80 hover:border-slate-700"
            )}
          >
            <div className="flex items-center gap-2">
              {hideValues ? (
                <EyeOff className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Eye className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 shrink-0 transition-colors" />
              )}
              <span>{hideValues ? "Valores Ocultos" : "Ocultar Valores"}</span>
            </div>
            <span
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                hideValues
                  ? "bg-amber-400 shadow-sm shadow-amber-400 animate-pulse"
                  : "bg-slate-600 group-hover:bg-cyan-400"
              )}
            />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="p-3 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all group relative",
                  isActive
                    ? "bg-gradient-to-r from-emerald-500/15 via-cyan-500/10 to-purple-500/5 text-white border border-cyan-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/40 border border-transparent"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0 transition-colors",
                    isActive
                      ? "text-emerald-400"
                      : "text-slate-400 group-hover:text-cyan-400"
                  )}
                />
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight truncate">
                    {item.label}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer Local-First Privacy Badge */}
      <div className="p-4 m-3 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>100% Local & Open Source</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Seus extratos ficam salvos exclusivamente no arquivo{" "}
          <code className="text-cyan-300 font-tabular">data/aurora.db</code> na
          sua máquina.
        </p>
      </div>
    </aside>
  );
}

