"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  Landmark,
  Layers,
  PieChart,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UploadCloud,
  Wallet,
  AlertTriangle,
  Store,
  Eye,
  EyeOff,
} from "lucide-react";
import type { DashboardData, CategoryExpenseBreakdownItem } from "@/lib/finance/queries";
import {
  cn,
  formatDateBr,
  formatMonthLabel,
  parseMoneyToCents,
} from "@/lib/utils";
import { CategoryIcon } from "@/components/ui/category-icon";
import { usePrivacy } from "@/components/providers/privacy-provider";

export function DashboardClient({ data }: { data: DashboardData }) {
  const router = useRouter();
  const { hideValues, toggleHideValues, formatMoney } = usePrivacy();
  const formatCurrency = formatMoney;
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(
    data.expensesByCategory[0]?.categoryId ?? null
  );
  const [hoveredCat, setHoveredCat] = useState<CategoryExpenseBreakdownItem | null>(null);
  const [showNewTxModal, setShowNewTxModal] = useState(false);

  // Estado do modal de lançamento rápido
  const [txAccountId, setTxAccountId] = useState<string>(data.accounts[0]?.id || "new");
  const [txNewAccountName, setTxNewAccountName] = useState("Conta Principal");
  const [txDate, setTxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [txDesc, setTxDesc] = useState("");
  const [txAmountStr, setTxAmountStr] = useState("");
  const [txType, setTxType] = useState<"expense" | "income">("expense");
  const [txCategoryId, setTxCategoryId] = useState<string>(
    data.categories.find((c) => c.type === "expense")?.id || ""
  );
  const [isSavingTx, setIsSavingTx] = useState(false);

  const handleFilterChange = (newMonth: string, newAccount: string) => {
    const params = new URLSearchParams();
    if (newMonth) params.set("month", newMonth);
    if (newAccount && newAccount !== "all") params.set("accountId", newAccount);
    router.push(`/?${params.toString()}`);
  };

  const handleQuickRecategorize = async (transactionId: string, newCategoryId: string) => {
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: transactionId,
        categoryId: newCategoryId || null,
        applyToSimilar: true,
      }),
    });
    router.refresh();
  };

  const handleCreateManualTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txDesc.trim() || !txAmountStr.trim()) return;
    setIsSavingTx(true);
    try {
      let targetAccountId = txAccountId;
      if (targetAccountId === "new" || data.accounts.length === 0) {
        const accRes = await fetch("/api/accounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: txNewAccountName.trim() || "Conta Principal",
            institution: "nubank",
            type: "checking",
          }),
        });
        const accData = await accRes.json();
        targetAccountId = accData.id;
      }

      const rawCents = Math.abs(parseMoneyToCents(txAmountStr));
      const signedCents = txType === "expense" ? -rawCents : rawCents;

      await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: targetAccountId,
          date: txDate,
          description: txDesc.trim(),
          amountCents: signedCents,
          categoryId: txCategoryId || null,
        }),
      });

      setShowNewTxModal(false);
      setTxDesc("");
      setTxAmountStr("");
      router.refresh();
    } finally {
      setIsSavingTx(false);
    }
  };

  // Cálculo dos arcos do gráfico Donut SVG
  const radius = 82;
  const circumference = 2 * Math.PI * radius;
  let cumulativePercent = 0;

  const activeCenterCat = hoveredCat;

  return (
    <div className="p-6 lg:p-8 max-w-[1440px] mx-auto space-y-7">
      {/* Header & Filtros Globais */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/80 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
              <Sparkles className="w-3 h-3" />
              Visão Analítica Boreal
            </span>
            <span className="text-xs text-slate-400 font-tabular">
              {formatMonthLabel(data.selectedMonth)}
            </span>
          </div>
          <h1 className="text-2xl lg:text-3xl font-bold tracking-tight text-white mt-1">
            Painel de Finanças & Gastos por Categoria
          </h1>
        </div>

        {/* Controles de Filtro e Ações */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Seletor de Mês */}
          <div className="flex items-center gap-2 bg-[#0C1222] border border-slate-800/90 hover:border-slate-700 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-xl px-3 py-1.5 transition-all">
            <Filter className="w-3.5 h-3.5 text-cyan-400 shrink-0 pointer-events-none" />
            <select
              value={data.selectedMonth}
              onChange={(e) => handleFilterChange(e.target.value, data.selectedAccountId)}
              className="select-naked text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-6"
            >
              <option value="all">
                Todo o Período
              </option>
              {data.availableMonths.map((ym) => (
                <option key={ym} value={ym}>
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Conta */}
          <div className="flex items-center gap-2 bg-[#0C1222] border border-slate-800/90 hover:border-slate-700 focus-within:border-cyan-500/50 focus-within:ring-1 focus-within:ring-cyan-500/30 rounded-xl px-3 py-1.5 transition-all">
            <Landmark className="w-3.5 h-3.5 text-emerald-400 shrink-0 pointer-events-none" />
            <select
              value={data.selectedAccountId}
              onChange={(e) => handleFilterChange(data.selectedMonth, e.target.value)}
              className="select-naked text-xs font-medium text-slate-200 focus:outline-none cursor-pointer pr-6"
            >
              <option value="all">
                Todas as Contas ({data.accounts.length})
              </option>
              {data.accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
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
              "inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer",
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

          <button
            type="button"
            onClick={() => setShowNewTxModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700/90 text-slate-100 border border-slate-700 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-cyan-400" />
            Lançamento Manual
          </button>

          <Link
            href="/import"
            className="aurora-btn-primary inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs shadow-md"
          >
            <UploadCloud className="w-4 h-4" />
            Importar Extrato
          </Link>
        </div>
      </div>

      {/* Alerta de Transações Sem Categoria (Inbox) */}
      {data.kpis.uncategorizedCount > 0 && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            <p className="text-xs sm:text-sm text-amber-200">
              Você possui{" "}
              <strong className="font-bold font-tabular">
                {data.kpis.uncategorizedCount}
              </strong>{" "}
              transações aguardando categorização neste período.
            </p>
          </div>
          <Link
            href="/transactions?onlyUncategorized=true"
            className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-semibold border border-amber-400/30 shrink-0 transition-colors"
          >
            Revisar no Inbox →
          </Link>
        </div>
      )}

      {/* KPIs Executivos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: Total de Gastos (Foco Principal) */}
        <div className="aurora-card-glow p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Gastos no Período
            </span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/15 border border-rose-500/30 flex items-center justify-center">
              <TrendingDown className="w-4 h-4 text-rose-400" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-rose-400 font-tabular">
            {formatCurrency(data.kpis.expenseCents)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{data.expensesByCategory.length} categorias ativas</span>
            {data.expensesByCategory[0] && (
              <span className="text-rose-300/90 truncate max-w-[150px]">
                Maior: {data.expensesByCategory[0].name}
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Receitas */}
        <div className="aurora-card-glow p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Receitas / Entradas
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-emerald-400 font-tabular">
            {formatCurrency(data.kpis.incomeCents)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Entradas líquidas</span>
            <span className="text-emerald-300/90 font-tabular">
              {data.incomesByCategory.reduce((acc, c) => acc + c.transactionCount, 0)} lançamentos
            </span>
          </div>
        </div>

        {/* Card 3: Resultado Líquido & Savings Rate */}
        <div className="aurora-card-glow p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Balanço Líquido
            </span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
              {data.kpis.netCents >= 0 ? (
                <ArrowUpRight className="w-4 h-4 text-cyan-400" />
              ) : (
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
              )}
            </div>
          </div>
          <div
            className={cn(
              "mt-3 text-2xl font-bold font-tabular",
              data.kpis.netCents >= 0 ? "text-cyan-300" : "text-rose-400"
            )}
          >
            {formatCurrency(data.kpis.netCents, { showPlus: true })}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>Taxa de Poupança</span>
            <span
              className={cn(
                "font-semibold font-tabular px-2 py-0.5 rounded-full text-[11px]",
                data.kpis.savingsRate >= 0
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-rose-500/15 text-rose-300"
              )}
            >
              {data.kpis.savingsRate}%
            </span>
          </div>
        </div>

        {/* Card 4: Saldo Consolidado */}
        <div className="aurora-card-glow p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Saldo Acumulado
            </span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
              <Wallet className="w-4 h-4 text-purple-400" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-bold text-slate-100 font-tabular">
            {formatCurrency(data.kpis.totalBalanceCents)}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{data.kpis.transactionCount} transações no filtro</span>
            <Link href="/settings" className="text-cyan-400 hover:underline">
              Gerenciar contas
            </Link>
          </div>
        </div>
      </div>

      {/* SEÇÃO PRINCIPAL: GASTOS SEPARADOS POR CATEGORIA (ESTILO VISOR FINANCE) */}
      <div className="aurora-card-glow p-6 lg:p-7 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-emerald-400" />
              <h2 className="text-lg font-bold text-white">
                Gastos Separados por Categoria
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Clique em qualquer categoria para inspecionar os lançamentos, estabelecimentos e alterar classificações.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/categories"
              className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-xs font-medium text-slate-200 border border-slate-700 transition-colors"
            >
              Configurar Categorias & Orçamentos
            </Link>
          </div>
        </div>

        {data.expensesByCategory.length === 0 ? (
          /* Estado Limpo (Sem Modo Demo) quando ainda não há despesas importadas */
          <div className="py-12 px-4 text-center max-w-xl mx-auto space-y-5">
            <div className="w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br from-emerald-500/20 via-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center">
              <FileSpreadsheet className="w-7 h-7 text-cyan-300" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">
                Banco SQLite Local Pronto — Nenhum Gasto Registrado Ainda
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                O Aurora Finance está configurado sem dados fictícios. Importe um arquivo{" "}
                <strong className="text-emerald-300">OFX</strong>,{" "}
                <strong className="text-cyan-300">CSV</strong> (Nubank, Inter, Itaú, Bradesco, BB, C6) ou{" "}
                <strong className="text-purple-300">Fatura PDF</strong> para ver seus gastos agrupados automaticamente por categoria.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              <Link
                href="/import"
                className="aurora-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold"
              >
                <UploadCloud className="w-4 h-4" />
                Importar Arquivo de Banco (OFX / CSV / PDF)
              </Link>
              <button
                type="button"
                onClick={() => setShowNewTxModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
              >
                <Plus className="w-4 h-4 text-cyan-400" />
                Adicionar Gasto Manual
              </button>
            </div>

            {/* Mostra as categorias já prontas no sistema */}
            <div className="pt-6 border-t border-slate-800/80 text-left">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 text-center">
                Categorias Brasileiras Prontas no Seu Banco Local ({data.categories.filter((c) => c.type === "expense").length})
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {data.categories
                  .filter((c) => c.type === "expense")
                  .map((cat) => (
                    <span
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-900/90 border border-slate-800 text-slate-300"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      {cat.name}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Barra de Proporção 100% Empilhada (Visor Style) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Distribuição Proporcional das Despesas</span>
                <span className="font-tabular text-slate-300 font-semibold">
                  100% = {formatCurrency(data.kpis.expenseCents)}
                </span>
              </div>
              <div className="h-3.5 w-full rounded-full bg-slate-900 overflow-hidden flex p-0.5 gap-0.5 border border-slate-800">
                {data.expensesByCategory.map((cat) => (
                  <div
                    key={cat.categoryId}
                    onMouseEnter={() => setHoveredCat(cat)}
                    onMouseLeave={() => setHoveredCat(null)}
                    onClick={() =>
                      setExpandedCategoryId(
                        expandedCategoryId === cat.categoryId ? null : cat.categoryId
                      )
                    }
                    style={{
                      width: `${Math.max(cat.percentageOfTotal, 1.5)}%`,
                      backgroundColor: cat.color,
                    }}
                    title={`${cat.name}: ${formatCurrency(cat.totalExpenseCents)} (${cat.percentageOfTotal}%)`}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all hover:opacity-90 cursor-pointer"
                  />
                ))}
              </div>
            </div>

            {/* Grid Principal: Gráfico Donut Interativo (Esquerda) + Ranking Detalhado (Direita) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              {/* Coluna Esquerda: Donut Interativo + Resumo da Categoria em Foco */}
              <div className="lg:col-span-4 aurora-card p-5 flex flex-col items-center justify-center space-y-5 lg:sticky lg:top-6">
                <div className="relative w-56 h-56 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 210 210">
                    <circle
                      cx="105"
                      cy="105"
                      r={radius}
                      fill="transparent"
                      stroke="#131c31"
                      strokeWidth="22"
                    />
                    {data.expensesByCategory.map((cat) => {
                      const strokeDasharray = `${
                        (cat.percentageOfTotal / 100) * circumference
                      } ${circumference}`;
                      const strokeDashoffset = -(cumulativePercent / 100) * circumference;
                      cumulativePercent += cat.percentageOfTotal;
                      const isHovered = activeCenterCat?.categoryId === cat.categoryId;

                      return (
                        <circle
                          key={cat.categoryId}
                          cx="105"
                          cy="105"
                          r={radius}
                          fill="transparent"
                          stroke={cat.color}
                          strokeWidth={isHovered ? "26" : "22"}
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredCat(cat)}
                          onMouseLeave={() => setHoveredCat(null)}
                          onClick={() =>
                            setExpandedCategoryId(
                              expandedCategoryId === cat.categoryId ? null : cat.categoryId
                            )
                          }
                        />
                      );
                    })}
                  </svg>

                  {/* Centro do Donut */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                    <span className="text-[11px] uppercase tracking-wider text-slate-400 truncate max-w-[130px]">
                      {activeCenterCat ? activeCenterCat.name : "Total de Gastos"}
                    </span>
                    <span className="text-lg font-bold text-white font-tabular mt-0.5">
                      {formatCurrency(
                        activeCenterCat
                          ? activeCenterCat.totalExpenseCents
                          : data.kpis.expenseCents
                      )}
                    </span>
                    <span
                      className="text-xs font-semibold font-tabular mt-0.5"
                      style={{
                        color: activeCenterCat ? activeCenterCat.color : "#34D399",
                      }}
                    >
                      {activeCenterCat
                        ? `${activeCenterCat.percentageOfTotal}% do total`
                        : `${data.expensesByCategory.length} categorias`}
                    </span>
                  </div>
                </div>

                {/* Legenda Rápida */}
                <div className="w-full space-y-2 border-t border-slate-800/80 pt-4">
                  {data.expensesByCategory.slice(0, 6).map((cat) => (
                    <button
                      key={cat.categoryId}
                      type="button"
                      onMouseEnter={() => setHoveredCat(cat)}
                      onMouseLeave={() => setHoveredCat(null)}
                      onClick={() =>
                        setExpandedCategoryId(
                          expandedCategoryId === cat.categoryId ? null : cat.categoryId
                        )
                      }
                      className="w-full flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span className="text-slate-200 truncate">{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-tabular">
                        <span className="text-slate-400">{cat.percentageOfTotal}%</span>
                        <span className="text-slate-100 font-semibold">
                          {formatCurrency(cat.totalExpenseCents)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coluna Direita: Lista Ranqueada de Categorias com Drill-Down */}
              <div className="lg:col-span-8 space-y-3">
                {data.expensesByCategory.map((cat) => {
                  const isExpanded = expandedCategoryId === cat.categoryId;

                  return (
                    <div
                      key={cat.categoryId}
                      className={cn(
                        "rounded-xl border transition-all overflow-hidden",
                        isExpanded
                          ? "bg-[#10182C] border-cyan-500/40 shadow-lg shadow-cyan-950/20"
                          : "bg-[#0B1120]/90 border-slate-800/80 hover:border-slate-700"
                      )}
                    >
                      {/* Cabeçalho da Categoria */}
                      <div
                        onClick={() =>
                          setExpandedCategoryId(isExpanded ? null : cat.categoryId)
                        }
                        onMouseEnter={() => setHoveredCat(cat)}
                        onMouseLeave={() => setHoveredCat(null)}
                        className="p-4 cursor-pointer select-none space-y-3"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{
                                backgroundColor: `${cat.color}20`,
                                border: `1px solid ${cat.color}50`,
                              }}
                            >
                              <CategoryIcon
                                name={cat.icon}
                                className="w-5 h-5"
                                style={{ color: cat.color }}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-sm sm:text-base text-white truncate">
                                  {cat.name}
                                </span>
                                <span
                                  className="text-[11px] font-bold font-tabular px-2 py-0.5 rounded-full"
                                  style={{
                                    backgroundColor: `${cat.color}22`,
                                    color: cat.color,
                                  }}
                                >
                                  {cat.percentageOfTotal}%
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 mt-0.5 font-tabular">
                                <span>{cat.transactionCount} lançamentos</span>
                                <span>•</span>
                                <span>
                                  Média: {formatCurrency(cat.averageTicketCents)}
                                </span>
                                {cat.monthlyBudgetCents && (
                                  <>
                                    <span>•</span>
                                    <span
                                      className={cn(
                                        (cat.budgetUsagePercent ?? 0) > 100
                                          ? "text-rose-400 font-semibold"
                                          : "text-cyan-300"
                                      )}
                                    >
                                      Meta: {cat.budgetUsagePercent}% de{" "}
                                      {formatCurrency(cat.monthlyBudgetCents)}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-base sm:text-lg font-bold text-slate-100 font-tabular">
                                {formatCurrency(cat.totalExpenseCents)}
                              </div>
                              {cat.topMerchants.length > 0 && (
                                <div className="text-[11px] text-slate-400 truncate max-w-[180px]">
                                  Principal: {cat.topMerchants[0].name}
                                </div>
                              )}
                            </div>
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-cyan-400" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                        </div>

                        {/* Barra de Progresso Visual da Categoria */}
                        <div className="h-2 w-full rounded-full bg-slate-900 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300"
                            style={{
                              width: `${Math.min(Math.max(cat.percentageOfTotal, 2), 100)}%`,
                              backgroundColor: cat.color,
                            }}
                          />
                        </div>

                        {/* Pílulas de Top Estabelecimentos dentro da categoria */}
                        {cat.topMerchants.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            {cat.topMerchants.map((m) => (
                              <span
                                key={m.name}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-slate-900/90 text-slate-300 border border-slate-800/90 font-tabular"
                              >
                                <span className="truncate max-w-[120px]">{m.name}</span>
                                <span className="text-slate-400">
                                  {formatCurrency(m.totalCents)}
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Drill-Down: Lista de Transações da Categoria */}
                      {isExpanded && (
                        <div className="border-t border-slate-800/90 bg-[#080D1A] px-4 py-3 space-y-2">
                          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 pb-1">
                            <span>Lançamentos em {cat.name}</span>
                            <Link
                              href={`/transactions?categoryId=${cat.categoryId}`}
                              className="text-cyan-400 hover:underline normal-case font-medium"
                            >
                              Ver todos na tabela →
                            </Link>
                          </div>

                          <div className="divide-y divide-slate-800/60 max-h-80 overflow-y-auto pr-1">
                            {cat.transactions.map((tx) => (
                              <div
                                key={tx.id}
                                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs hover:bg-slate-900/50 px-2 rounded-lg"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="font-tabular text-slate-400 shrink-0">
                                    {formatDateBr(tx.date)}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="font-medium text-slate-200 truncate">
                                      {tx.cleanDescription}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate">
                                      {tx.accountName} • {tx.rawDescription}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                                  {/* Troca rápida de categoria inline */}
                                  <select
                                    value={
                                      cat.categoryId === "uncategorized"
                                        ? ""
                                        : cat.categoryId
                                    }
                                    onChange={(e) =>
                                      handleQuickRecategorize(tx.id, e.target.value)
                                    }
                                    className="bg-slate-900 border border-slate-700/80 rounded-lg pl-2 pr-6 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-400"
                                  >
                                    <option value="">Sem categoria</option>
                                    {data.categories.map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  </select>

                                  <span className="font-tabular font-semibold text-rose-400 w-24 text-right">
                                    {formatCurrency(tx.amountCents)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Linha Analítica Secundária: Evolução Mensal & Top Estabelecimentos */}
      {data.kpis.transactionCount > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Evolução Mensal (Receitas vs Despesas) */}
          <div className="lg:col-span-7 aurora-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Fluxo de Caixa Mensal (Receitas vs Gastos)
                </h3>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5 text-emerald-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
                  Receitas
                </span>
                <span className="flex items-center gap-1.5 text-rose-300">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-400" />
                  Gastos
                </span>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              {data.monthlyEvolution.map((m) => {
                const maxVal = Math.max(
                  ...data.monthlyEvolution.map((x) => Math.max(x.incomeCents, x.expenseCents)),
                  100
                );
                const incPct = Math.round((m.incomeCents / maxVal) * 100);
                const expPct = Math.round((m.expenseCents / maxVal) * 100);

                return (
                  <div
                    key={m.yearMonth}
                    onClick={() => handleFilterChange(m.yearMonth, data.selectedAccountId)}
                    className="p-2.5 rounded-xl bg-slate-900/60 hover:bg-slate-800/60 border border-slate-800/70 cursor-pointer transition-colors space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-tabular">
                      <span className="font-semibold text-slate-200">{m.label}</span>
                      <div className="flex items-center gap-4">
                        <span className="text-emerald-400">
                          +{formatCurrency(m.incomeCents)}
                        </span>
                        <span className="text-rose-400">
                          -{formatCurrency(m.expenseCents)}
                        </span>
                        <span
                          className={cn(
                            "font-bold",
                            m.netCents >= 0 ? "text-cyan-300" : "text-rose-400"
                          )}
                        >
                          = {formatCurrency(m.netCents, { showPlus: true })}
                        </span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${incPct}%` }}
                        />
                      </div>
                      <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-rose-400 rounded-full"
                          style={{ width: `${expPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Estabelecimentos / Favorecidos */}
          <div className="lg:col-span-5 aurora-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-4 h-4 text-purple-400" />
                <h3 className="text-base font-bold text-white">
                  Maiores Estabelecimentos
                </h3>
              </div>
              <span className="text-xs text-slate-400">Agrupamento inteligente</span>
            </div>

            <div className="space-y-2.5">
              {data.topMerchants.map((m) => (
                <div
                  key={m.merchantName}
                  className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/70 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-semibold text-slate-200 truncate">
                      {m.merchantName}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: m.categoryColor }}
                      />
                      <span className="truncate">{m.categoryName}</span>
                      <span>•</span>
                      <span className="font-tabular">{m.transactionCount}x</span>
                    </div>
                  </div>
                  <div className="text-right font-tabular shrink-0">
                    <div className="text-xs sm:text-sm font-bold text-slate-100">
                      {formatCurrency(m.totalExpenseCents)}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {m.percentageOfExpenses}% dos gastos
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Lançamento Manual Rápido */}
      {showNewTxModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="aurora-card-glow w-full max-w-md p-6 space-y-5 border border-slate-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Novo Lançamento Manual</h3>
              <button
                type="button"
                onClick={() => setShowNewTxModal(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualTransaction} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setTxType("expense");
                    setTxCategoryId(
                      data.categories.find((c) => c.type === "expense")?.id || ""
                    );
                  }}
                  className={cn(
                    "py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    txType === "expense"
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                      : "text-slate-400"
                  )}
                >
                  Despesa / Gasto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxType("income");
                    setTxCategoryId(
                      data.categories.find((c) => c.type === "income")?.id || ""
                    );
                  }}
                  className={cn(
                    "py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer",
                    txType === "income"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                      : "text-slate-400"
                  )}
                >
                  Receita / Entrada
                </button>
              </div>

              {data.accounts.length > 0 ? (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Conta / Cartão</label>
                  <select
                    value={txAccountId}
                    onChange={(e) => setTxAccountId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                  >
                    {data.accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nome da sua primeira Conta ou Cartão
                  </label>
                  <input
                    type="text"
                    value={txNewAccountName}
                    onChange={(e) => setTxNewAccountName(e.target.value)}
                    placeholder="Ex: Nubank Conta, Itaú..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                    required
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Data</label>
                  <input
                    type="date"
                    value={txDate}
                    onChange={(e) => setTxDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-tabular"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Valor (R$)</label>
                  <input
                    type="text"
                    value={txAmountStr}
                    onChange={(e) => setTxAmountStr(e.target.value)}
                    placeholder="Ex: 89,90"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-tabular"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Descrição / Estabelecimento
                </label>
                <input
                  type="text"
                  value={txDesc}
                  onChange={(e) => setTxDesc(e.target.value)}
                  placeholder="Ex: Supermercado, iFood, Aluguel..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  required
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Categoria</label>
                <select
                  value={txCategoryId}
                  onChange={(e) => setTxCategoryId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="">Sem Categoria</option>
                  {data.categories
                    .filter((c) => c.type === txType)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTxModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingTx}
                  className="aurora-btn-primary px-5 py-2 rounded-xl text-xs cursor-pointer"
                >
                  {isSavingTx ? "Salvando..." : "Salvar Lançamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

