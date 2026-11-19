"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  History,
  RotateCcw,
  Settings2,
  Sparkles,
  UploadCloud,
  AlertCircle,
  Files,
  X,
  Plus,
} from "lucide-react";
import type { Account, Category, ImportBatch } from "@/db/schema";
import type { CsvColumnMapping } from "@/lib/parsers/csv-parser";
import { cn, formatDateBr, INSTITUTIONS } from "@/lib/utils";
import { usePrivacy } from "@/components/providers/privacy-provider";

interface PreviewItem {
  tempId: string;
  date: string;
  rawDescription: string;
  cleanDescription: string;
  merchantName: string;
  amountCents: number;
  categoryId: string | null;
  categoryName: string | null;
  classificationSource: string;
  confidence: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  externalId: string | null;
  dedupHash: string;
  isDuplicate: boolean;
  skip?: boolean;
  sourceFilename?: string;
  fileIndex?: number;
}

export function ImportClient({
  accounts,
  categories,
  batches,
}: {
  accounts: Account[];
  categories: Category[];
  batches: Array<ImportBatch & { accountName: string }>;
}) {
  const router = useRouter();
  const { formatMoney } = usePrivacy();
  const formatCurrency = formatMoney;
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id || "new");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountInstitution, setNewAccountInstitution] = useState("nubank");
  const [newAccountType, setNewAccountType] = useState("checking");
  const [isCreditCardBill, setIsCreditCardBill] = useState(false);

  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<{
    files?: Array<{
      filename: string;
      fileType: "ofx" | "csv" | "pdf";
      fileHash: string;
      detectedBank: string;
      totalRows: number;
    }>;
    filename: string;
    fileType: "ofx" | "csv" | "pdf" | "mixed";
    fileHash: string;
    detectedBank: string;
    csvMeta: {
      headers: string[];
      sampleRows: Record<string, string>[];
      detectedPresetName: string | null;
      mapping: CsvColumnMapping;
    } | null;
    summary: {
      totalRows: number;
      newCount: number;
      duplicateCount: number;
      categorizedCount: number;
      uncategorizedCount: number;
      filesCount?: number;
    };
    items: PreviewItem[];
  } | null>(null);

  const [csvMapping, setCsvMapping] = useState<CsvColumnMapping | null>(null);
  const [showColumnMapper, setShowColumnMapper] = useState(false);

  const runPreview = async (
    filesToParse: File[],
    accId: string,
    overrideMapping?: CsvColumnMapping | null,
    creditCardFlag?: boolean
  ) => {
    if (filesToParse.length === 0) return;
    setIsLoadingPreview(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const fd = new FormData();
      filesToParse.forEach((f) => fd.append("files", f));
      fd.append("accountId", accId);
      fd.append("isCreditCardBill", String(creditCardFlag ?? isCreditCardBill));
      if (overrideMapping) {
        fd.append("csvMapping", JSON.stringify(overrideMapping));
      }

      const res = await fetch("/api/import/preview", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Falha ao analisar arquivo(s).");
      }

      setPreviewData(json);
      if (json.csvMeta?.mapping) {
        setCsvMapping(json.csvMeta.mapping);
      }

      if (accId === "new" && json.detectedBank && json.detectedBank !== "other") {
        setNewAccountInstitution(json.detectedBank);
        if (!newAccountName) {
          const instLabel = INSTITUTIONS[json.detectedBank]?.label || "Conta";
          setNewAccountName(instLabel);
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao processar arquivo(s).");
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleFilesChange = (newFiles: File[], append = false) => {
    if (!newFiles || newFiles.length === 0) return;
    const valid = newFiles.filter((f) => /\.(ofx|qfx|csv|pdf|txt)$/i.test(f.name));
    if (valid.length === 0) {
      setErrorMsg("Nenhum arquivo compatível selecionado (.OFX, .QFX, .CSV ou .PDF).");
      return;
    }

    let updatedFiles: File[];
    if (append) {
      // Evita arquivos duplicados pelo nome e tamanho
      const existingKeys = new Set(selectedFiles.map((f) => `${f.name}_${f.size}`));
      const nonDups = valid.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      updatedFiles = [...selectedFiles, ...nonDups];
    } else {
      updatedFiles = valid;
    }

    setSelectedFiles(updatedFiles);
    runPreview(updatedFiles, accountId, null, isCreditCardBill);
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const updated = selectedFiles.filter((_, idx) => idx !== indexToRemove);
    setSelectedFiles(updated);
    if (updated.length > 0) {
      runPreview(updated, accountId, csvMapping, isCreditCardBill);
    } else {
      setPreviewData(null);
    }
  };

  const handleCommitImport = async () => {
    if (!previewData) return;
    setIsCommitting(true);
    setErrorMsg(null);

    try {
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          newAccountName: accountId === "new" ? newAccountName || "Conta Principal" : undefined,
          newAccountInstitution,
          newAccountType,
          files: previewData.files || [
            {
              filename: previewData.filename,
              fileType: previewData.fileType,
              fileHash: previewData.fileHash,
            },
          ],
          filename: previewData.filename,
          fileType: previewData.fileType,
          fileHash: previewData.fileHash,
          items: previewData.items,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Erro ao gravar importação.");
      }

      const filesCount = previewData.files?.length || selectedFiles.length || 1;
      setSuccessMsg(
        `Importação concluída! ${json.importedCount} transações salvas no SQLite a partir de ${filesCount} arquivo(s) (${json.duplicateCount} duplicadas ignoradas).`
      );
      setPreviewData(null);
      setSelectedFiles([]);
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro ao confirmar importação.");
    } finally {
      setIsCommitting(false);
    }
  };

  const handleRollbackBatch = async (batchId: string, filename: string) => {
    if (!window.confirm(`Deseja desfazer a importação do arquivo "${filename}" e remover suas transações?`)) {
      return;
    }
    await fetch(`/api/import/commit?batchId=${encodeURIComponent(batchId)}`, {
      method: "DELETE",
    });
    router.refresh();
  };

  const updatePreviewItemCategory = (tempId: string, newCatId: string) => {
    if (!previewData) return;
    const catObj = categories.find((c) => c.id === newCatId);
    setPreviewData({
      ...previewData,
      items: previewData.items.map((it) =>
        it.tempId === tempId
          ? {
              ...it,
              categoryId: newCatId || null,
              categoryName: catObj?.name || null,
              classificationSource: "manual",
            }
          : it
      ),
    });
  };

  const totalSelectedBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="p-6 lg:p-8 max-w-[1360px] mx-auto space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5">
        <div className="flex items-center gap-2 text-xs text-cyan-400 font-semibold">
          <UploadCloud className="w-4 h-4" />
          <span>Motor de Importação Universal (100% Local)</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-white mt-1">
          Importar Extratos & Faturas Bancárias
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Suporte nativo a envio de <strong>múltiplos arquivos OFX / QFX</strong> de uma vez, planilhas <strong>CSV</strong> (Nubank, Inter, Itaú, Bradesco, BB, C6 ou customizado) e faturas em <strong>PDF</strong>.
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-3 text-rose-200 text-xs sm:text-sm">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-4 text-emerald-200 text-xs sm:text-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="aurora-btn-primary px-4 py-1.5 rounded-lg text-xs cursor-pointer"
          >
            Ver Gastos por Categoria →
          </button>
        </div>
      )}

      {/* Passo 1: Seleção da Conta + Upload */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Configuração da Conta Destino */}
        <div className="lg:col-span-5 aurora-card p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            1. Conta ou Cartão de Destino
          </h2>

          <div>
            <label className="block text-xs text-slate-400 mb-1.5">
              Vincular lançamentos a:
            </label>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                if (selectedFiles.length > 0) {
                  runPreview(selectedFiles, e.target.value, csvMapping, isCreditCardBill);
                }
              }}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-400"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({INSTITUTIONS[acc.institution]?.label || acc.institution})
                </option>
              ))}
              <option value="new">+ Criar Nova Conta ou Cartão...</option>
            </select>
          </div>

          {accountId === "new" && (
            <div className="p-4 rounded-xl bg-slate-900/80 border border-cyan-500/30 space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Nome da Nova Conta / Cartão
                </label>
                <input
                  type="text"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="Ex: Nubank Cartão Roxinho, Itaú Conta..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Instituição</label>
                  <select
                    value={newAccountInstitution}
                    onChange={(e) => setNewAccountInstitution(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    {Object.entries(INSTITUTIONS).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tipo</label>
                  <select
                    value={newAccountType}
                    onChange={(e) => setNewAccountType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white"
                  >
                    <option value="checking">Conta Corrente</option>
                    <option value="credit_card">Cartão de Crédito</option>
                    <option value="savings">Poupança / Reserva</option>
                    <option value="investment">Investimentos</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2.5 text-xs text-slate-300 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={isCreditCardBill}
              onChange={(e) => {
                setIsCreditCardBill(e.target.checked);
                if (selectedFiles.length > 0) {
                  runPreview(selectedFiles, accountId, csvMapping, e.target.checked);
                }
              }}
              className="rounded border-slate-700 bg-slate-900 text-cyan-500"
            />
            <span>
              Tratar valores positivos como compras (útil para faturas de cartão PDF/CSV)
            </span>
          </label>
        </div>

        {/* Zona de Upload (Drag & Drop com suporte a múltiplos arquivos) */}
        <div className="lg:col-span-7 aurora-card-glow p-6 flex flex-col justify-center">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFilesChange(Array.from(e.dataTransfer.files));
              }
            }}
            className={cn(
              "border-2 border-dashed rounded-2xl p-6 text-center transition-all bg-slate-900/40 space-y-3",
              isDragging
                ? "border-emerald-400 bg-slate-900/80 ring-2 ring-emerald-500/30 scale-[1.01]"
                : "border-cyan-500/35 hover:border-emerald-400/60 hover:bg-slate-900/60"
            )}
          >
            <div className="w-12 h-12 rounded-2xl mx-auto bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              {selectedFiles.length > 1 ? (
                <Files className="w-6 h-6 text-cyan-400" />
              ) : (
                <UploadCloud className="w-6 h-6 text-emerald-400" />
              )}
            </div>

            {selectedFiles.length === 0 ? (
              <div>
                <label
                  htmlFor="bank-file-input"
                  className="text-sm font-semibold text-white hover:text-cyan-300 cursor-pointer block"
                >
                  Arraste ou clique para selecionar múltiplos arquivos OFX / extratos
                </label>
                <p className="text-xs text-slate-400 mt-1">
                  Formatos aceitos: <strong>.OFX</strong>, <strong>.QFX</strong>,{" "}
                  <strong>.CSV</strong> ou <strong>.PDF</strong> (Envie vários de uma vez só!)
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold border-b border-slate-800 pb-2">
                  <span>
                    {selectedFiles.length === 1
                      ? "1 arquivo selecionado"
                      : `${selectedFiles.length} arquivos selecionados`}
                    {" "}
                    ({(totalSelectedBytes / 1024).toFixed(1)} KB)
                  </span>
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="bank-file-input-more"
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar mais</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFiles([]);
                        setPreviewData(null);
                      }}
                      className="text-[11px] text-slate-500 hover:text-rose-400 ml-2"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                {/* Chips de arquivos selecionados */}
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                  {selectedFiles.map((f, idx) => (
                    <div
                      key={`${f.name}_${idx}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-800/90 text-slate-200 border border-slate-700/80 group"
                    >
                      <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="truncate max-w-[160px] font-medium" title={f.name}>
                        {f.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({(f.size / 1024).toFixed(0)} KB)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveFile(idx);
                        }}
                        className="text-slate-500 hover:text-rose-400 transition-colors ml-1"
                        title="Remover arquivo"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <span className="px-2.5 py-1 rounded-md text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium">
                ⚡ Múltiplos OFX / QFX de uma só vez
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                CSV Universal
              </span>
              <span className="px-2.5 py-1 rounded-md text-[11px] bg-purple-500/10 text-purple-300 border border-purple-500/20">
                Faturas em PDF
              </span>
            </div>

            <input
              id="bank-file-input"
              type="file"
              multiple
              accept=".ofx,.qfx,.csv,.pdf,.txt"
              onChange={(e) =>
                handleFilesChange(e.target.files ? Array.from(e.target.files) : [], false)
              }
              className="hidden"
            />
            <input
              id="bank-file-input-more"
              type="file"
              multiple
              accept=".ofx,.qfx,.csv,.pdf,.txt"
              onChange={(e) =>
                handleFilesChange(e.target.files ? Array.from(e.target.files) : [], true)
              }
              className="hidden"
            />
          </div>
        </div>
      </div>

      {isLoadingPreview && (
        <div className="aurora-card p-8 text-center space-y-2">
          <div className="w-8 h-8 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mx-auto" />
          <p className="text-sm font-medium text-slate-200">
            {selectedFiles.length > 1
              ? `Analisando ${selectedFiles.length} arquivos e combinando lançamentos sem duplicidade...`
              : "Extraindo transações e classificando categorias inteligentemente..."}
          </p>
        </div>
      )}

      {/* Passo 2: Mapeador Visual de Colunas (Apenas para CSV) + Tabela de Preview */}
      {previewData && !isLoadingPreview && (
        <div className="aurora-card-glow p-6 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {previewData.files && previewData.files.length > 1 ? (
                  <Files className="w-5 h-5 text-cyan-400" />
                ) : previewData.fileType === "csv" ? (
                  <FileSpreadsheet className="w-5 h-5 text-cyan-400" />
                ) : (
                  <FileText className="w-5 h-5 text-emerald-400" />
                )}
                <h2 className="text-lg font-bold text-white">
                  Revisão Pré-Importação: {previewData.filename}
                </h2>
                {previewData.csvMeta?.detectedPresetName && (
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                    Preset: {previewData.csvMeta.detectedPresetName}
                  </span>
                )}
              </div>

              {/* Badges de cada arquivo importado se houver múltiplos */}
              {previewData.files && previewData.files.length > 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {previewData.files.map((f) => (
                    <span
                      key={f.filename}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-slate-300 border border-slate-700/80"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span className="font-medium">{f.filename}</span>
                      <span className="text-slate-400 font-mono">({f.totalRows} itens)</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-tabular pt-1">
                <span>Total lido: {previewData.summary.totalRows}</span>
                <span className="text-emerald-400 font-semibold">
                  Novos: {previewData.summary.newCount}
                </span>
                <span className="text-amber-400">
                  Duplicados ignorados: {previewData.summary.duplicateCount}
                </span>
                <span className="text-cyan-300">
                  Categorizados automaticamente: {previewData.summary.categorizedCount}/
                  {previewData.summary.totalRows}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {previewData.fileType === "csv" && previewData.csvMeta && (
                <button
                  type="button"
                  onClick={() => setShowColumnMapper(!showColumnMapper)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5 text-cyan-400" />
                  {showColumnMapper ? "Ocultar Mapeador CSV" : "Mapeador de Colunas CSV"}
                </button>
              )}

              <button
                type="button"
                disabled={isCommitting || previewData.summary.newCount === 0}
                onClick={handleCommitImport}
                className="aurora-btn-primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isCommitting
                  ? "Salvando no SQLite..."
                  : `Confirmar e Importar (${previewData.summary.newCount})`}
              </button>
            </div>
          </div>

          {/* Mapeador Dinâmico de Colunas CSV */}
          {showColumnMapper && previewData.csvMeta && csvMapping && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-cyan-500/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-300">
                  Mapeador Visual de Colunas CSV
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedFiles.length > 0) {
                      runPreview(selectedFiles, accountId, csvMapping, isCreditCardBill);
                    }
                  }}
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-xs font-semibold border border-cyan-500/40 cursor-pointer"
                >
                  Aplicar Mapeamento
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Coluna de Data</label>
                  <select
                    value={csvMapping.dateColumn}
                    onChange={(e) =>
                      setCsvMapping({ ...csvMapping, dateColumn: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    {previewData.csvMeta.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Coluna de Descrição</label>
                  <select
                    value={csvMapping.descriptionColumn}
                    onChange={(e) =>
                      setCsvMapping({ ...csvMapping, descriptionColumn: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    {previewData.csvMeta.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Coluna de Valor</label>
                  <select
                    value={csvMapping.amountColumn}
                    onChange={(e) =>
                      setCsvMapping({ ...csvMapping, amountColumn: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-2 text-white"
                  >
                    {previewData.csvMeta.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-slate-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(csvMapping.invertSignal)}
                      onChange={(e) =>
                        setCsvMapping({ ...csvMapping, invertSignal: e.target.checked })
                      }
                      className="rounded border-slate-700 bg-slate-950"
                    />
                    <span>Inverter sinal (+/-)</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Tabela de Preview das Transações */}
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-xl border border-slate-800">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900/95 text-slate-400 uppercase tracking-wider text-[11px] sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-3">Status</th>
                  {previewData.files && previewData.files.length > 1 && (
                    <th className="py-3 px-3">Arquivo</th>
                  )}
                  <th className="py-3 px-3">Data</th>
                  <th className="py-3 px-3">Estabelecimento / Descrição Limpa</th>
                  <th className="py-3 px-3">Categoria Atribuída</th>
                  <th className="py-3 px-3">Origem IA/Regra</th>
                  <th className="py-3 px-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {previewData.items.map((item) => (
                  <tr
                    key={item.tempId}
                    className={cn(
                      "hover:bg-slate-900/60 transition-colors",
                      item.isDuplicate && "opacity-45 bg-slate-950/60"
                    )}
                  >
                    <td className="py-2.5 px-3">
                      {item.isDuplicate ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Duplicado
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                          Novo
                        </span>
                      )}
                    </td>
                    {previewData.files && previewData.files.length > 1 && (
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="text-[10px] text-cyan-300 font-mono bg-cyan-950/70 border border-cyan-800/60 px-2 py-0.5 rounded-md">
                          {item.sourceFilename}
                        </span>
                      </td>
                    )}
                    <td className="py-2.5 px-3 font-tabular text-slate-300 whitespace-nowrap">
                      {formatDateBr(item.date)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-100">
                        {item.cleanDescription}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-md">
                        Original: {item.rawDescription}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <select
                        value={item.categoryId || ""}
                        onChange={(e) =>
                          updatePreviewItemCategory(item.tempId, e.target.value)
                        }
                        className="bg-slate-900 border border-slate-700 rounded-lg pl-2.5 pr-7 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                      >
                        <option value="">Sem categoria (Inbox)</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium",
                          item.classificationSource === "rule"
                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                            : item.classificationSource === "history"
                              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                              : item.classificationSource === "ai"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                : "bg-slate-800 text-slate-400"
                        )}
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        {item.classificationSource === "rule"
                          ? "Regra Smart"
                          : item.classificationSource === "history"
                            ? "Histórico"
                            : item.classificationSource === "ai"
                              ? "IA"
                              : item.classificationSource === "manual"
                                ? "Manual"
                                : "Pendente"}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "py-2.5 px-3 text-right font-tabular font-bold whitespace-nowrap",
                        item.amountCents >= 0 ? "text-emerald-400" : "text-rose-400"
                      )}
                    >
                      {formatCurrency(item.amountCents, { showPlus: true })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Histórico de Lotes Importados (Com Rollback em 1 clique) */}
      <div className="aurora-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-cyan-400" />
            <h3 className="text-base font-bold text-white">
              Histórico de Arquivos Importados
            </h3>
          </div>
          <span className="text-xs text-slate-400">
            Você pode desfazer qualquer lote com 1 clique
          </span>
        </div>

        {batches.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">
            Nenhum lote de arquivo importado até o momento.
          </p>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {batches.map((b) => (
              <div
                key={b.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200">{b.filename}</span>
                    <span className="px-2 py-0.5 rounded uppercase text-[10px] font-bold bg-slate-800 text-cyan-300">
                      {b.fileType}
                    </span>
                    <span className="text-slate-400">→ {b.accountName}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 font-tabular">
                    Importado em {new Date(b.createdAt).toLocaleString("pt-BR")} •{" "}
                    {b.importedCount} novos • {b.duplicateCount} duplicados ignorados
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRollbackBatch(b.id, b.filename)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/25 text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Desfazer Lote
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
