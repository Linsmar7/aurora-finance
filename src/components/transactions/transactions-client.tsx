"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  Landmark,
  ListFilter,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  Eye,
  EyeOff,
} from "lucide-react";
import type { Account, Category } from "@/db/schema";
import { cn, formatDateBr, formatMonthLabel } from "@/lib/utils";
import { CategoryIcon } from "@/components/ui/category-icon";
import { usePrivacy } from "@/components/providers/privacy-provider";

interface TransactionRow {
  id: string;
  accountId: string;
  categoryId: string | null;
  date: string;
  amountCents: number;
  type: string;
  rawDescription: string;
  cleanDescription: string;
  merchantName: string | null;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  classificationSource: string;
  confidenceScore: number;
  isReviewed: number;
  isIgnored: number;
  accountName: string;
  accountInstitution: string;
  accountColor: string;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
}

export function TransactionsClient({
  transactions,
  accounts,
  categories,
  availableMonths,
  filters,
}: {
  transactions: TransactionRow[];
  accounts: Account[];
  categories: Category[];
  availableMonths: string[];
  filters: {
    month: string;
    accountId: string;
    categoryId: string;
    search: string;
    onlyUncategorized: boolean;
  };
}) {
  const router = useRouter();
  const { hideValues, toggleHideValues, formatMoney } = usePrivacy();
  const formatCurrency = formatMoney;
  const [searchInput, setSearchInput] = useState(filters.search);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [smartLearnEnabled, setSmartLearnEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);

  const updateUrlFilters = (next: Partial<typeof filters>) => {
    const merged = { ...filters, ...next };
    const params = new URLSearchParams();
    if (merged.month && merged.month !== "all") params.set("month", merged.month);
    if (merged.accountId && merged.accountId !== "all")
      params.set("accountId", merged.accountId);
    if (merged.categoryId && merged.categoryId !== "all")
      params.set("categoryId", merged.categoryId);
    if (merged.search) params.set("search", merged.search);
    if (merged.onlyUncategorized) params.set("onlyUncategorized", "true");
    router.push(`/transactions?${params.toString()}`);
  };

  const handleCategoryChange = async (txId: string, newCatId: string) => {
    const res = await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: txId,
        categoryId: newCatId || null,
        applyToSimilar: smartLearnEnabled,
        createRule: smartLearnEnabled,
      }),
    });
    const data = await res.json();
    if (data.updatedCount > 1) {
      setToastMessage(
        `Categoria aplicada a ${data.updatedCount} transações similares e regra criada!`
      );
      setTimeout(() => setToastMessage(null), 4000);
    }
    router.refresh();
  };

  const handleBulkCategorize = async () => {
    if (selectedIds.length === 0 || !bulkCategoryId) return;
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        categoryId: bulkCategoryId,
        applyToSimilar: false,
      }),
    });
    setSelectedIds([]);
    router.refresh();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Excluir ${selectedIds.length} transações selecionadas?`)) return;
    await fetch(`/api/transactions?ids=${selectedIds.join(",")}`, {
      method: "DELETE",
    });
    setSelectedIds([]);
    router.refresh();
  };

  const handleReprocessAllRules = async () => {
    setIsReprocessing(true);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reprocess" }),
      });
      const json = await res.json();
      setToastMessage(
        `Motor inteligente re-executado: ${json.updatedCount || 0} transações classificadas!`
      );
      setTimeout(() => setToastMessage(null), 4000);
      router.refresh();
    } finally {
      setIsReprocessing(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === transactions.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(transactions.map((t) => t.id));
    }
  };

  const totalFilteredExpenses = transactions
    .filter((t) => t.amountCents < 0 && t.type !== "transfer")
    .reduce((acc, t) => acc + Math.abs(t.amountCents), 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
            <ListFilter className="w-4 h-4" />
            <span>Explorador Unificado & Inbox de Categorização</span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">
            Transações ({transactions.length})
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200 cursor-pointer">
            <input
              type="checkbox"
              checked={smartLearnEnabled}
              onChange={(e) => setSmartLearnEnabled(e.target.checked)}
              className="rounded border-purple-500 bg-slate-950"
            />
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            <span>Aprendizado 1-Clique (Agrupar similares + criar regra)</span>
          </label>

          <button
            type="button"
            disabled={isReprocessing}
            onClick={handleReprocessAllRules}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 cursor-pointer"
          >
            <Wand2 className="w-3.5 h-3.5" />
            {isReprocessing ? "Classificando..." : "Re-aplicar Regras Inteligentes"}
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="aurora-card p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-center">
        {/* Busca por texto */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateUrlFilters({ search: searchInput });
          }}
          className="relative lg:col-span-2"
        >
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar estabelecimento, descrição original ou Pix..."
            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
          />
        </form>

        {/* Filtro de Mês */}
        <div className="flex items-center gap-2 bg-[#0C1222] border border-slate-800/90 hover:border-slate-700 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-xl px-3 py-1.5 transition-all">
          <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0 pointer-events-none" />
          <select
            value={filters.month}
            onChange={(e) => updateUrlFilters({ month: e.target.value })}
            className="select-naked text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-6"
          >
            <option value="all">Todos os Meses</option>
            {availableMonths.map((ym) => (
              <option key={ym} value={ym}>
                {formatMonthLabel(ym)}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Categoria */}
        <div className="flex items-center gap-2 bg-[#0C1222] border border-slate-800/90 hover:border-slate-700 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-xl px-3 py-1.5 transition-all">
          <Tag className="w-3.5 h-3.5 text-purple-400 shrink-0 pointer-events-none" />
          <select
            value={filters.onlyUncategorized ? "uncategorized" : filters.categoryId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "uncategorized") {
                updateUrlFilters({ categoryId: "all", onlyUncategorized: true });
              } else {
                updateUrlFilters({ categoryId: val, onlyUncategorized: false });
              }
            }}
            className="select-naked text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-6"
          >
            <option value="all">Todas as Categorias</option>
            <option value="uncategorized">⚠️ Sem Categoria (Inbox)</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro de Conta */}
        <div className="flex items-center gap-2 bg-[#0C1222] border border-slate-800/90 hover:border-slate-700 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-xl px-3 py-1.5 transition-all">
          <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0 pointer-events-none" />
          <select
            value={filters.accountId}
            onChange={(e) => updateUrlFilters({ accountId: e.target.value })}
            className="select-naked text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-6"
          >
            <option value="all">Todas as Contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Botãozin de Ocultar Valores */}
        <button
          type="button"
          onClick={toggleHideValues}
          title={
            hideValues
              ? "Mostrar valores (Alt+H)"
              : "Ocultar valores monetários (Alt+H)"
          }
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
            hideValues
              ? "bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25 shadow-sm shadow-amber-500/10"
              : "bg-[#0C1222] hover:bg-slate-800/80 text-slate-300 border-slate-800/90 hover:border-slate-700"
          )}
        >
          {hideValues ? (
            <EyeOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          ) : (
            <Eye className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          )}
          <span>{hideValues ? "Valores Ocultos" : "Ocultar Valores"}</span>
        </button>
      </div>

      {/* Barra de Ações em Lote */}
      {selectedIds.length > 0 && (
        <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/35 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-cyan-200">
            <CheckSquare className="w-4 h-4 text-cyan-400" />
            <span>{selectedIds.length} transações selecionadas</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkCategoryId}
              onChange={(e) => setBulkCategoryId(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white"
            >
              <option value="">Escolher categoria em lote...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkCategorize}
              className="aurora-btn-primary px-3.5 py-1.5 rounded-lg text-xs cursor-pointer"
            >
              Aplicar Categoria
            </button>
            <button
              type="button"
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Excluir
            </button>
          </div>
        </div>
      )}

      {/* Tabela de Transações */}
      <div className="aurora-card overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <span>
            Exibindo <strong className="text-slate-200">{transactions.length}</strong> lançamentos
          </span>
          <span className="font-tabular">
            Soma de Gastos Filtrados:{" "}
            <strong className="text-rose-400">
              {formatCurrency(totalFilteredExpenses)}
            </strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      transactions.length > 0 &&
                      selectedIds.length === transactions.length
                    }
                    onChange={toggleSelectAll}
                    className="rounded border-slate-700 bg-slate-900"
                  />
                </th>
                <th className="py-3 px-3">Data</th>
                <th className="py-3 px-3">Estabelecimento & Descrição</th>
                <th className="py-3 px-3">Conta</th>
                <th className="py-3 px-3">Categoria</th>
                <th className="py-3 px-3">Classificação</th>
                <th className="py-3 px-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    Nenhuma transação encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const isSelected = selectedIds.includes(tx.id);
                  return (
                    <tr
                      key={tx.id}
                      className={cn(
                        "hover:bg-slate-900/60 transition-colors",
                        isSelected && "bg-cyan-500/5"
                      )}
                    >
                      <td className="py-2.5 px-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() =>
                            setSelectedIds((prev) =>
                              prev.includes(tx.id)
                                ? prev.filter((id) => id !== tx.id)
                                : [...prev, tx.id]
                            )
                          }
                          className="rounded border-slate-700 bg-slate-900"
                        />
                      </td>
                      <td className="py-2.5 px-3 font-tabular text-slate-300 whitespace-nowrap">
                        {formatDateBr(tx.date)}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-100">
                            {tx.cleanDescription}
                          </span>
                          {tx.installmentCurrent && tx.installmentTotal && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-tabular bg-purple-500/15 text-purple-300 border border-purple-500/30">
                              {tx.installmentCurrent}/{tx.installmentTotal}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-md">
                          {tx.rawDescription}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: tx.accountColor }}
                          />
                          {tx.accountName}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          {tx.categoryColor && (
                            <span
                              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `${tx.categoryColor}20`,
                                color: tx.categoryColor,
                              }}
                            >
                              <CategoryIcon name={tx.categoryIcon} className="w-3.5 h-3.5" />
                            </span>
                          )}
                          <select
                            value={tx.categoryId || ""}
                            onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
                            className={cn(
                              "bg-slate-900 border rounded-lg pl-2.5 pr-6 py-1 text-xs focus:outline-none focus:border-cyan-400",
                              tx.categoryId
                                ? "border-slate-700/80 text-slate-200"
                                : "border-amber-500/50 text-amber-300 bg-amber-500/10"
                            )}
                          >
                            <option value="">⚠️ Sem Categoria</option>
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-medium",
                            tx.classificationSource === "rule"
                              ? "bg-purple-500/15 text-purple-300"
                              : tx.classificationSource === "manual"
                                ? "bg-emerald-500/15 text-emerald-300"
                                : tx.classificationSource === "history"
                                  ? "bg-cyan-500/15 text-cyan-300"
                                  : tx.classificationSource === "ai"
                                    ? "bg-amber-500/15 text-amber-300"
                                    : "bg-slate-800 text-slate-400"
                          )}
                        >
                          {tx.classificationSource === "rule"
                            ? "Regra"
                            : tx.classificationSource === "manual"
                              ? "Manual"
                              : tx.classificationSource === "history"
                                ? "Histórico"
                                : tx.classificationSource === "ai"
                                  ? "IA"
                                  : "Pendente"}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "py-2.5 px-3 text-right font-tabular font-bold whitespace-nowrap",
                          tx.amountCents >= 0 ? "text-emerald-400" : "text-rose-400"
                        )}
                      >
                        {formatCurrency(tx.amountCents, { showPlus: true })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

