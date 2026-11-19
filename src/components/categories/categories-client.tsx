"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
} from "lucide-react";
import type { Category, CategorizationRule } from "@/db/schema";
import { formatCurrency, parseMoneyToCents } from "@/lib/utils";
import { CategoryIcon } from "@/components/ui/category-icon";
import { usePrivacy } from "@/components/providers/privacy-provider";

const AURORA_COLORS = [
  "#34D399", // Emerald Light
  "#10B981", // Emerald
  "#22D3EE", // Cyan
  "#38BDF8", // Sky
  "#60A5FA", // Polar Blue
  "#8B5CF6", // Deep Violet
  "#A855F7", // Aurora Violet
  "#E879F9", // Boreal Magenta
  "#FB7185", // Aurora Rose
  "#FBBF24", // Solar Amber
];

export function CategoriesClient({
  categories,
  rules,
}: {
  categories: Category[];
  rules: Array<CategorizationRule & { categoryName: string; categoryColor: string }>;
}) {
  const router = useRouter();
  const { hideValues } = usePrivacy();

  // Nova Categoria
  const [catName, setCatName] = useState("");
  const [catType, setCatType] = useState<"expense" | "income">("expense");
  const [catColor, setCatColor] = useState(AURORA_COLORS[0]);
  const [catBudgetStr, setCatBudgetStr] = useState("");

  // Nova Regra Inteligente
  const [ruleName, setRuleName] = useState("");
  const [ruleMatchType, setRuleMatchType] = useState<"contains" | "regex" | "starts_with">("contains");
  const [rulePattern, setRulePattern] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState(categories[0]?.id || "");
  const [ruleMerchant, setRuleMerchant] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    const budgetCents = catBudgetStr.trim()
      ? Math.abs(parseMoneyToCents(catBudgetStr))
      : null;

    await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: catName.trim(),
        type: catType,
        color: catColor,
        icon: "Tag",
        monthlyBudgetCents: budgetCents,
      }),
    });

    setCatName("");
    setCatBudgetStr("");
    router.refresh();
  };

  const handleUpdateBudget = async (categoryId: string, rawValue: string) => {
    const budgetCents = rawValue.trim() ? Math.abs(parseMoneyToCents(rawValue)) : null;
    await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: categoryId,
        monthlyBudgetCents: budgetCents,
      }),
    });
    router.refresh();
  };

  const handleDeleteCategory = async (id: string, name: string) => {
    if (!window.confirm(`Remover a categoria "${name}"?`)) return;
    await fetch(`/api/categories?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    router.refresh();
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !rulePattern.trim() || !ruleCategoryId) return;

    await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: ruleName.trim(),
        matchType: ruleMatchType,
        pattern: rulePattern.trim(),
        targetCategoryId: ruleCategoryId,
        targetMerchantName: ruleMerchant.trim() || null,
      }),
    });

    setRuleName("");
    setRulePattern("");
    setRuleMerchant("");
    router.refresh();
  };

  const handleDeleteRule = async (id: string) => {
    await fetch(`/api/rules?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    router.refresh();
  };

  const handleReprocessNow = async () => {
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reprocess" }),
    });
    const json = await res.json();
    setStatusMessage(
      `Regras aplicadas! ${json.updatedCount || 0} transações foram categorizadas.`
    );
    setTimeout(() => setStatusMessage(null), 4000);
    router.refresh();
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-purple-400 font-semibold">
            <Sparkles className="w-4 h-4" />
            <span>Organização Inteligente & Orçamentos</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">
            Categorias, Tetos de Gastos & Regras Automáticas
          </h1>
        </div>

        <button
          type="button"
          onClick={handleReprocessNow}
          className="aurora-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs cursor-pointer"
        >
          <Wand2 className="w-4 h-4" />
          Aplicar Regras nas Transações Existentes
        </button>
      </div>

      {statusMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs font-semibold">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Coluna Esquerda: Categorias & Metas de Orçamento */}
        <div className="lg:col-span-6 space-y-5">
          <div className="aurora-card-glow p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Tag className="w-4 h-4 text-emerald-400" />
              Criar Nova Categoria
            </h2>

            <form onSubmit={handleCreateCategory} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 mb-1">Nome da Categoria</label>
                  <input
                    type="text"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    placeholder="Ex: Pets, Cafeterias, Jogos..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Tipo</label>
                  <select
                    value={catType}
                    onChange={(e) => setCatType(e.target.value as "expense" | "income")}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="expense">Despesa / Gasto</option>
                    <option value="income">Receita</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-slate-400 mb-1">
                    Teto Mensal Opcional (R$)
                  </label>
                  <input
                    type="text"
                    value={catBudgetStr}
                    onChange={(e) => setCatBudgetStr(e.target.value)}
                    placeholder="Ex: 800,00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-tabular"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 mb-1.5">Cor Aurora</label>
                  <div className="flex items-center gap-1.5">
                    {AURORA_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setCatColor(hex)}
                        className="w-5 h-5 rounded-full transition-transform cursor-pointer"
                        style={{
                          backgroundColor: hex,
                          transform: catColor === hex ? "scale(1.25)" : "scale(1)",
                          outline: catColor === hex ? "2px solid white" : "none",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="aurora-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Categoria
              </button>
            </form>
          </div>

          {/* Lista de Categorias */}
          <div className="aurora-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">
              Categorias Ativas ({categories.length})
            </h3>
            <div className="divide-y divide-slate-800/70 max-h-[540px] overflow-y-auto pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        backgroundColor: `${cat.color}20`,
                        color: cat.color,
                      }}
                    >
                      <CategoryIcon name={cat.icon} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-100 truncate">
                        {cat.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {cat.type === "expense"
                          ? "Despesa"
                          : cat.type === "income"
                            ? "Receita"
                            : "Transferência"}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {cat.type === "expense" && (
                      <input
                        type={hideValues ? "password" : "text"}
                        key={`${cat.id}_${hideValues}`}
                        defaultValue={
                          cat.monthlyBudgetCents
                            ? (cat.monthlyBudgetCents / 100).toFixed(2).replace(".", ",")
                            : ""
                        }
                        onBlur={(e) => handleUpdateBudget(cat.id, e.target.value)}
                        placeholder="Meta R$..."
                        title="Defina o teto de orçamento mensal em R$ e clique fora para salvar"
                        className="w-28 bg-slate-900 border border-slate-800 focus:border-cyan-400 rounded-lg px-2.5 py-1 text-right font-tabular text-xs text-slate-200"
                      />
                    )}
                    {cat.isSystem === 0 && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory(cat.id, cat.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita: Regras Inteligentes de Agrupamento */}
        <div className="lg:col-span-6 space-y-5">
          <div className="aurora-card-glow p-5 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              Nova Regra de Agrupamento Automático
            </h2>

            <form onSubmit={handleCreateRule} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Nome da Regra</label>
                  <input
                    type="text"
                    value={ruleName}
                    onChange={(e) => setRuleName(e.target.value)}
                    placeholder="Ex: Padaria da Esquina"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Categoria Destino</label>
                  <select
                    value={ruleCategoryId}
                    onChange={(e) => setRuleCategoryId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Tipo de Busca</label>
                  <select
                    value={ruleMatchType}
                    onChange={(e) =>
                      setRuleMatchType(e.target.value as "contains" | "regex" | "starts_with")
                    }
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="contains">Contém texto</option>
                    <option value="regex">Expressão Regular (Regex)</option>
                    <option value="starts_with">Começa com</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Padrão no Extrato
                  </label>
                  <input
                    type="text"
                    value={rulePattern}
                    onChange={(e) => setRulePattern(e.target.value)}
                    placeholder="Ex: PANIFICADORA|PADARIA"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">
                    Renomear Estabelecimento
                  </label>
                  <input
                    type="text"
                    value={ruleMerchant}
                    onChange={(e) => setRuleMerchant(e.target.value)}
                    placeholder="Ex: Padaria Real (Opcional)"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="aurora-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Salvar Regra Inteligente
              </button>
            </form>
          </div>

          {/* Lista de Regras */}
          <div className="aurora-card p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">
              Regras de Categorização Ativas ({rules.length})
            </h3>
            <div className="divide-y divide-slate-800/70 max-h-[540px] overflow-y-auto pr-1">
              {rules.map((r) => (
                <div
                  key={r.id}
                  className="py-3 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-100">{r.name}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: `${r.categoryColor}20`,
                          color: r.categoryColor,
                        }}
                      >
                        → {r.categoryName}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-tabular truncate max-w-md">
                      [{r.matchType.toUpperCase()}] {r.pattern}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteRule(r.id)}
                    className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

