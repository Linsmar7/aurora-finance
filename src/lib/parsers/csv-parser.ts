import Papa from "papaparse";
import { normalizeDateToIso, parseMoneyToCents } from "@/lib/utils";
import type { ParsedRawTransaction } from "./ofx-parser";

export interface CsvColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountColumn: string;
  creditColumn?: string | null;
  debitColumn?: string | null;
  categoryColumn?: string | null;
  externalIdColumn?: string | null;
  invertSignal?: boolean;
}

export interface CsvInspectionResult {
  headers: string[];
  rows: Record<string, string>[];
  sampleRows: Record<string, string>[];
  detectedPresetName: string | null;
  detectedBank: string;
  suggestedMapping: CsvColumnMapping;
}

function normalizeColName(col: string): string {
  return col
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Alguns bancos (ex: Inter, Bradesco, Itaú) colocam 3 a 8 linhas de cabeçalho institucional
 * antes da linha real de colunas ("Data Lançamento;Histórico;Valor").
 * Esta função remove o preâmbulo até encontrar a linha real do cabeçalho.
 */
function stripBankCsvPreamble(rawContent: string): string {
  const lines = rawContent.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const lineNorm = normalizeColName(lines[i]);
    const hasDateCol = /\b(data|date|dt\.?\s*lanc|lancamento)\b/.test(lineNorm);
    const hasValOrDesc =
      /\b(valor|amount|historico|descricao|title|lancamento|estabelecimento|credito|debito)\b/.test(
        lineNorm
      );
    const hasDelimiter = lines[i].includes(",") || lines[i].includes(";") || lines[i].includes("\t");

    if (hasDateCol && hasValOrDesc && hasDelimiter) {
      return lines.slice(i).join("\n");
    }
  }
  return rawContent;
}

export function inspectCsvContent(rawContent: string): CsvInspectionResult {
  const cleanedContent = stripBankCsvPreamble(rawContent);

  const parsed = Papa.parse<Record<string, string>>(cleanedContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const headers = (parsed.meta.fields || []).filter(Boolean);
  const rows = (parsed.data || []).filter((r) =>
    Object.values(r).some((val) => val && String(val).trim() !== "")
  );

  let detectedPresetName: string | null = null;
  let detectedBank = "other";
  let invertSignal = false;

  const normHeaders = headers.map((h) => ({ raw: h, norm: normalizeColName(h) }));

  // Detecção de Presets Conhecidos
  const hasHeader = (name: string) => normHeaders.some((h) => h.norm === normalizeColName(name));
  const getHeader = (name: string) =>
    normHeaders.find((h) => h.norm === normalizeColName(name))?.raw || "";

  if (hasHeader("date") && hasHeader("title") && hasHeader("amount")) {
    detectedPresetName = "Nubank — Fatura Cartão";
    detectedBank = "nubank";
    invertSignal = true; // Fatura Nubank traz compras positivas
  } else if (hasHeader("Data") && hasHeader("Descrição") && hasHeader("Identificador") && hasHeader("Valor")) {
    detectedPresetName = "Nubank — Extrato Conta";
    detectedBank = "nubank";
  } else if (hasHeader("Data Lançamento") && hasHeader("Valor")) {
    detectedPresetName = "Banco Inter — Extrato";
    detectedBank = "inter";
  } else if (hasHeader("Data de Compra") && hasHeader("Valor (em R$)")) {
    detectedPresetName = "C6 Bank — Fatura Cartão";
    detectedBank = "c6";
    invertSignal = true;
  }

  // Heurística inteligente para sugerir colunas
  const findCol = (patterns: RegExp[]) => {
    for (const pat of patterns) {
      const found = normHeaders.find((h) => pat.test(h.norm));
      if (found) return found.raw;
    }
    return "";
  };

  const dateColumn =
    findCol([/^data$/, /^date$/, /data.*lanc/, /data.*compra/, /data.*mov/, /^data/, /^dt/]) ||
    headers[0] ||
    "";

  const descriptionColumn =
    findCol([
      /^descricao$/,
      /^title$/,
      /^historico$/,
      /^lancamento$/,
      /estabelecimento/,
      /descricao/,
      /memo/,
      /nome/,
    ]) ||
    headers[1] ||
    "";

  const amountColumn =
    findCol([/^valor$/, /^amount$/, /valor.*r\$/, /^valor/, /^quantia$/, /^total$/]) ||
    headers[2] ||
    "";

  const creditColumn = findCol([/^credito/, /^entrada/]) || null;
  const debitColumn = findCol([/^debito/, /^saida/]) || null;
  const categoryColumn = findCol([/^categoria$/, /^category$/]) || null;
  const externalIdColumn =
    getHeader("Identificador") || findCol([/^id$/, /identificador/, /fitid/, /documento/]) || null;

  return {
    headers,
    rows,
    sampleRows: rows.slice(0, 6),
    detectedPresetName,
    detectedBank,
    suggestedMapping: {
      dateColumn,
      descriptionColumn,
      amountColumn,
      creditColumn,
      debitColumn,
      categoryColumn,
      externalIdColumn,
      invertSignal,
    },
  };
}

export function extractTransactionsFromCsv(
  rows: Record<string, string>[],
  mapping: CsvColumnMapping
): ParsedRawTransaction[] {
  const results: ParsedRawTransaction[] = [];

  for (const row of rows) {
    const rawDate = row[mapping.dateColumn];
    const rawDesc = row[mapping.descriptionColumn];
    if (!rawDate || !rawDesc) continue;

    const isoDate = normalizeDateToIso(rawDate);
    if (!isoDate) continue;

    let amountCents = 0;
    if (mapping.creditColumn && mapping.debitColumn && (row[mapping.creditColumn] || row[mapping.debitColumn])) {
      const cred = Math.abs(parseMoneyToCents(row[mapping.creditColumn]));
      const deb = Math.abs(parseMoneyToCents(row[mapping.debitColumn]));
      amountCents = cred > 0 ? cred : -deb;
    } else {
      amountCents = parseMoneyToCents(row[mapping.amountColumn]);
    }

    if (amountCents === 0) continue;

    if (mapping.invertSignal) {
      amountCents = -amountCents;
    }

    // Em faturas de cartão do Nubank, "Pagamento recebido" não deve ficar negativo após inversão
    if (mapping.invertSignal && /PAGAMENTO RECEBIDO|CREDITO DE FATURA|ESTORNO/i.test(rawDesc) && amountCents < 0) {
      amountCents = Math.abs(amountCents);
    }

    const externalId =
      mapping.externalIdColumn && row[mapping.externalIdColumn]
        ? String(row[mapping.externalIdColumn]).trim()
        : null;

    const originalCategoryHint =
      mapping.categoryColumn && row[mapping.categoryColumn]
        ? String(row[mapping.categoryColumn]).trim()
        : null;

    results.push({
      date: isoDate,
      rawDescription: String(rawDesc).replace(/\s+/g, " ").trim(),
      amountCents,
      externalId,
      originalCategoryHint,
    });
  }

  return results;
}

