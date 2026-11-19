"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Database,
  Download,
  FileJson,
  Landmark,
  Plus,
  Save,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import type { AccountWithBalance } from "@/lib/finance/queries";
import { INSTITUTIONS, parseMoneyToCents } from "@/lib/utils";
import { usePrivacy } from "@/components/providers/privacy-provider";

export function SettingsClient({
  accounts,
  settings,
}: {
  accounts: AccountWithBalance[];
  settings: Record<string, string>;
}) {
  const router = useRouter();
  const { formatMoney } = usePrivacy();
  const formatCurrency = formatMoney;

  // Nova Conta
  const [accName, setAccName] = useState("");
  const [accInstitution, setAccInstitution] = useState("nubank");
  const [accType, setAccType] = useState("checking");
  const [accInitialBalance, setAccInitialBalance] = useState("");

  // Configuração de IA
  const [aiProvider, setAiProvider] = useState(settings.ai_provider || "none");
  const [ollamaUrl, setOllamaUrl] = useState(
    settings.ollama_url || "http://localhost:11434"
  );
  const [ollamaModel, setOllamaModel] = useState(
    settings.ollama_model || "llama3.2"
  );
  const [geminiApiKey, setGeminiApiKey] = useState(settings.gemini_api_key || "");
  const [openaiApiKey, setOpenaiApiKey] = useState(settings.openai_api_key || "");
  const [savedToast, setSavedToast] = useState(false);

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;

    const initialCents = accInitialBalance.trim()
      ? parseMoneyToCents(accInitialBalance)
      : 0;

    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: accName.trim(),
        institution: accInstitution,
        type: accType,
        initialBalanceCents: initialCents,
      }),
    });

    setAccName("");
    setAccInitialBalance("");
    router.refresh();
  };

  const handleDeleteAccount = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Remover a conta "${name}" e todas as transações vinculadas a ela?`
      )
    ) {
      return;
    }
    await fetch(`/api/accounts?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    router.refresh();
  };

  const handleSaveAiSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/backup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        settings: {
          ai_provider: aiProvider,
          ollama_url: ollamaUrl.trim(),
          ollama_model: ollamaModel.trim(),
          gemini_api_key: geminiApiKey.trim(),
          openai_api_key: openaiApiKey.trim(),
        },
      }),
    });
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 3000);
    router.refresh();
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1360px] mx-auto space-y-8">
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs text-cyan-400 font-semibold">
          <Database className="w-4 h-4" />
          <span>Administração Local & Privacidade</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">
          Contas Bancárias, Motor de IA & Backup SQLite
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
        {/* Coluna Esquerda: Gestão de Contas Bancárias & Cartões */}
        <div className="lg:col-span-6 space-y-5">
          <div className="aurora-card-glow p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Landmark className="w-4 h-4 text-emerald-400" />
              Cadastrar Conta Bancária ou Cartão
            </h2>

            <form onSubmit={handleCreateAccount} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">
                  Nome da Conta / Cartão
                </label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ex: Nubank Conta, Itaú Uniclass, Cartão Inter..."
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3.5 py-2 text-white"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Instituição</label>
                  <select
                    value={accInstitution}
                    onChange={(e) => setAccInstitution(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    {Object.entries(INSTITUTIONS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tipo</label>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="checking">Conta Corrente</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="savings">Poupança / Reserva</option>
                    <option value="investment">Investimentos</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">
                    Saldo Inicial (R$)
                  </label>
                  <input
                    type="text"
                    value={accInitialBalance}
                    onChange={(e) => setAccInitialBalance(e.target.value)}
                    placeholder="0,00"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-white font-tabular"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="aurora-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Conta
              </button>
            </form>
          </div>

          <div className="aurora-card p-6 space-y-3">
            <h3 className="text-sm font-bold text-slate-200">
              Suas Contas e Cartões ({accounts.length})
            </h3>
            {accounts.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                Nenhuma conta cadastrada ainda. Crie uma acima ou direto na tela de Importação.
              </p>
            ) : (
              <div className="divide-y divide-slate-800/70">
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="py-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color }}
                      />
                      <div>
                        <div className="font-semibold text-slate-100">
                          {acc.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {INSTITUTIONS[acc.institution]?.label || acc.institution} •{" "}
                          {acc.transactionCount} transações
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-tabular font-bold text-slate-100">
                        {formatCurrency(acc.currentBalanceCents)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteAccount(acc.id, acc.name)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coluna Direita: Motor Híbrido de IA + Backup do Banco SQLite */}
        <div className="lg:col-span-6 space-y-5">
          {/* Configuração de IA */}
          <div className="aurora-card-glow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Bot className="w-4 h-4 text-purple-400" />
                Motor Híbrido de Categorização Inteligente
              </h2>
              {savedToast && (
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Salvo!
                </span>
              )}
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Por padrão, o Aurora usa o motor determinístico local (Regras Regex + Histórico de Similaridade). Opcionalmente, ative um LLM para classificar estabelecimentos inéditos.
            </p>

            <form onSubmit={handleSaveAiSettings} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Camada 3 de IA (Fallback para estabelecimentos desconhecidos)
                </label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="none">
                    Apenas Motor Local (Regras + Similaridade Histórica — Sem LLM)
                  </option>
                  <option value="ollama">
                    Ollama Local (100% Offline na sua máquina)
                  </option>
                  <option value="gemini">
                    Google Gemini API (BYOK — Chave Própria)
                  </option>
                  <option value="openai">
                    OpenAI API (BYOK — Chave Própria)
                  </option>
                </select>
              </div>

              {aiProvider === "ollama" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-900/90 border border-purple-500/30">
                  <div>
                    <label className="block text-slate-400 mb-1">URL do Ollama</label>
                    <input
                      type="text"
                      value={ollamaUrl}
                      onChange={(e) => setOllamaUrl(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-tabular"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Modelo Local</label>
                    <input
                      type="text"
                      value={ollamaModel}
                      onChange={(e) => setOllamaModel(e.target.value)}
                      placeholder="llama3.2, qwen2.5, mistral..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-tabular"
                    />
                  </div>
                </div>
              )}

              {aiProvider === "gemini" && (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-cyan-500/30">
                  <label className="block text-slate-400 mb-1">
                    Chave da API Google Gemini (Salva apenas no seu SQLite local)
                  </label>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-tabular"
                  />
                </div>
              )}

              {aiProvider === "openai" && (
                <div className="p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/30">
                  <label className="block text-slate-400 mb-1">
                    Chave da API OpenAI (Salva apenas no seu SQLite local)
                  </label>
                  <input
                    type="password"
                    value={openaiApiKey}
                    onChange={(e) => setOpenaiApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-tabular"
                  />
                </div>
              )}

              <button
                type="submit"
                className="aurora-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Configurações de Inteligência
              </button>
            </form>
          </div>

          {/* Backup e Portabilidade do Banco SQL Local */}
          <div className="aurora-card p-6 space-y-4">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              Portabilidade & Backup do Banco SQL Local
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Todos os seus dados financeiros residem localmente em{" "}
              <code className="text-cyan-300 font-tabular">./data/aurora.db</code>.
              Baixe uma cópia de segurança do arquivo SQLite ou exporte em JSON a qualquer momento.
            </p>

            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href="/api/backup?format=sqlite"
                download
                className="aurora-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold"
              >
                <Download className="w-4 h-4" />
                Baixar Banco SQLite (.db)
              </a>

              <a
                href="/api/backup?format=json"
                download
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
              >
                <FileJson className="w-4 h-4 text-cyan-400" />
                Exportar Dados Completos (.json)
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

