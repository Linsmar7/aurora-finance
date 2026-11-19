import { extractText } from "unpdf";
import { normalizeDateToIso, parseMoneyToCents } from "@/lib/utils";
import type { ParsedRawTransaction } from "./ofx-parser";

export interface PdfParseResult {
  detectedBank: string;
  extractedTextPreview: string;
  transactions: ParsedRawTransaction[];
}

export async function parsePdfBuffer(
  buffer: Uint8Array,
  options?: { isCreditCardBill?: boolean }
): Promise<PdfParseResult> {
  const { text } = await extractText(buffer, { mergePages: true });
  const fullText = Array.isArray(text) ? text.join("\n") : String(text || "");

  const upper = fullText.toUpperCase();
  let detectedBank = "other";
  if (/NUBANK|NU PAGAMENTOS/.test(upper)) detectedBank = "nubank";
  else if (/BANCO INTER|INTERMEDIUM/.test(upper)) detectedBank = "inter";
  else if (/ITAU|ITAÚ/.test(upper)) detectedBank = "itau";
  else if (/BRADESCO/.test(upper)) detectedBank = "bradesco";
  else if (/BANCO DO BRASIL|OUROCARD/.test(upper)) detectedBank = "bb";
  else if (/C6 BANK/.test(upper)) detectedBank = "c6";
  else if (/SANTANDER/.test(upper)) detectedBank = "santander";

  // Detecta ano de referência no documento
  const yearMatch = fullText.match(/\b(202[0-9])\b/);
  const fallbackYear = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();

  const isCreditCard =
    options?.isCreditCardBill ??
    /FATURA|VENCIMENTO DA FATURA|PAGAMENTO MINIMO|LIMITE TOTAL/i.test(fullText);

  const lines = fullText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 8);

  const transactions: ParsedRawTransaction[] = [];

  // Padrões comuns em extratos e faturas PDF no Brasil:
  // 1) "15/08/2026 COMPRA CARTAO IFOOD -45,90" ou "15/08 IFOOD 01/03 R$ 45,90"
  // 2) "15 AGO Uber *Trip R$ 24,90"
  const lineRegex1 =
    /^(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?)\s+(.+?)\s+(-?(?:R\$\s*)?[\d.]+,\d{2}\s*[DC+-]?)$/i;

  const lineRegex2 =
    /^(\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+\d{4})?)\s+(.+?)\s+(-?(?:R\$\s*)?[\d.]+,\d{2}\s*[DC+-]?)$/i;

  const ignorePatterns =
    /^(?:SALDO\s+ANTERIOR|SALDO\s+FINAL|SALDO\s+DO\s+DIA|TOTAL\s+DA\s+FATURA|TOTAL\s+A\s+PAGAR|PAGAMENTO\s+MINIMO|RESUMO\s+DA\s+FATURA|LIMITE\s+DISPONIVEL|ENCARGOS\s+ROTATIVOS)/i;

  for (const line of lines) {
    const match = line.match(lineRegex1) || line.match(lineRegex2);
    if (!match) continue;

    const [, rawDatePart, rawDescPart, rawAmountPart] = match;
    const cleanDesc = rawDescPart.replace(/\s+/g, " ").trim();

    if (ignorePatterns.test(cleanDesc)) continue;

    const isoDate = normalizeDateToIso(rawDatePart, fallbackYear);
    if (!isoDate) continue;

    let amountCents = parseMoneyToCents(rawAmountPart);
    if (amountCents === 0) continue;

    // Em faturas de cartão PDF, gastos geralmente aparecem como valores positivos (ex: "R$ 49,90")
    if (
      isCreditCard &&
      amountCents > 0 &&
      !rawAmountPart.includes("+") &&
      !/PAGAMENTO|CREDITO|ESTORNO|DESCONTO/i.test(cleanDesc)
    ) {
      amountCents = -Math.abs(amountCents);
    }

    transactions.push({
      date: isoDate,
      rawDescription: cleanDesc,
      amountCents,
      externalId: null,
    });
  }

  return {
    detectedBank,
    extractedTextPreview: fullText.slice(0, 1200),
    transactions,
  };
}

