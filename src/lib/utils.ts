import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(cents: number, options?: { showPlus?: boolean; abs?: boolean }): string {
  const value = (options?.abs ? Math.abs(cents) : cents) / 100;
  const formatted = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

  if (options?.showPlus && cents > 0) {
    return `+${formatted}`;
  }
  return formatted;
}

export function formatCompactCurrency(cents: number): string {
  const absCents = Math.abs(cents);
  if (absCents >= 100_000_00) {
    return `${cents < 0 ? "-" : ""}R$ ${(absCents / 100_000_00).toFixed(1)}M`;
  }
  if (absCents >= 1_000_00) {
    return `${cents < 0 ? "-" : ""}R$ ${(absCents / 1_000_00).toFixed(1)}k`;
  }
  return formatCurrency(cents);
}

export function formatDateBr(isoDate: string): string {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

export function formatMonthLabel(yearMonth: string): string {
  if (!yearMonth || yearMonth === "all") return "Todo o Período";
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  const date = new Date(year, month - 1, 1);
  const label = date.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Converte strings monetárias nos formatos BR ("1.234,56", "-R$ 45,90", "120,00 D")
 * ou US ("1234.56", "-45.90") para inteiro em centavos.
 */
export function parseMoneyToCents(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;
  if (typeof raw === "number") {
    return Math.round(raw * 100);
  }

  let str = String(raw).trim();
  if (!str) return 0;

  let isNegative = false;
  if (
    str.includes("-") ||
    (str.startsWith("(") && str.endsWith(")")) ||
    /\bD$/i.test(str) ||
    /DEB(ITO)?$/i.test(str)
  ) {
    isNegative = true;
  }

  // Remove símbolos de moeda, letras e espaços
  str = str.replace(/[^\d.,]/g, "");
  if (!str) return 0;

  const lastComma = str.lastIndexOf(",");
  const lastDot = str.lastIndexOf(".");

  let normalizedNumberStr = str;

  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // Formato BR: 1.234,56
      normalizedNumberStr = str.replace(/\./g, "").replace(",", ".");
    } else {
      // Formato US: 1,234.56
      normalizedNumberStr = str.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Apenas vírgula: 1234,56
    normalizedNumberStr = str.replace(",", ".");
  } else if (lastDot > -1) {
    // Verifica se o ponto é milhar (ex: 1.200) ou decimal (12.50)
    const parts = str.split(".");
    if (parts.length > 2) {
      normalizedNumberStr = str.replace(/\./g, "");
    }
  }

  const parsed = Number.parseFloat(normalizedNumberStr);
  if (Number.isNaN(parsed)) return 0;

  const cents = Math.round(Math.abs(parsed) * 100);
  return isNegative ? -cents : cents;
}

/**
 * Converte datas em diversos formatos bancários para YYYY-MM-DD
 */
export function normalizeDateToIso(raw: string, currentYearFallback?: number): string | null {
  if (!raw) return null;
  const clean = raw.trim().split(" ")[0].split("T")[0];

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean;
  }

  // OFX YYYYMMDD...
  const ofxMatch = clean.match(/^(\d{4})(\d{2})(\d{2})/);
  if (ofxMatch) {
    return `${ofxMatch[1]}-${ofxMatch[2]}-${ofxMatch[3]}`;
  }

  // DD/MM/YYYY ou DD-MM-YYYY ou DD.MM.YYYY
  const dmyFull = clean.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (dmyFull) {
    const d = dmyFull[1].padStart(2, "0");
    const m = dmyFull[2].padStart(2, "0");
    const y = dmyFull[3];
    return `${y}-${m}-${d}`;
  }

  // DD/MM/YY
  const dmyShort = clean.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2})$/);
  if (dmyShort) {
    const d = dmyShort[1].padStart(2, "0");
    const m = dmyShort[2].padStart(2, "0");
    const y = Number(dmyShort[3]) > 50 ? `19${dmyShort[3]}` : `20${dmyShort[3]}`;
    return `${y}-${m}-${d}`;
  }

  // DD/MM (muito comum em faturas PDF)
  const dmOnly = clean.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (dmOnly) {
    const d = dmOnly[1].padStart(2, "0");
    const m = dmOnly[2].padStart(2, "0");
    const y = currentYearFallback || new Date().getFullYear();
    return `${y}-${m}-${d}`;
  }

  // DD MMM (ex: "14 AGO", "05 NOV")
  const monthsPt: Record<string, string> = {
    JAN: "01",
    FEV: "02",
    MAR: "03",
    ABR: "04",
    MAI: "05",
    JUN: "06",
    JUL: "07",
    AGO: "08",
    SET: "09",
    OUT: "10",
    NOV: "11",
    DEZ: "12",
  };
  const dmText = raw
    .trim()
    .toUpperCase()
    .match(/^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+(\d{4}))?/);
  if (dmText) {
    const d = dmText[1].padStart(2, "0");
    const m = monthsPt[dmText[2]];
    const y = dmText[3] || String(currentYearFallback || new Date().getFullYear());
    return `${y}-${m}-${d}`;
  }

  return null;
}

export function computeTransactionDedupHash(params: {
  accountId: string;
  date: string;
  amountCents: number;
  rawDescription: string;
  externalId?: string | null;
  sequenceInFile?: number;
}): string {
  const normalizedDesc = params.rawDescription
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

  const payload = params.externalId
    ? `${params.accountId}|EXT:${params.externalId}|${params.amountCents}`
    : `${params.accountId}|${params.date}|${params.amountCents}|${normalizedDesc}|#${params.sequenceInFile ?? 0}`;

  // Pure JS deterministic 128-bit Cypher/FNV hash (works in both Browser & Node without node:crypto)
  let h1 = 0xdeadbeef ^ payload.length;
  let h2 = 0x41c6ce57 ^ payload.length;
  let h3 = 0x9e3779b9 ^ payload.length;
  let h4 = 0x85ebca6b ^ payload.length;

  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
    h3 = Math.imul(h3 ^ ch, 2246822507);
    h4 = Math.imul(h4 ^ ch, 3266489909);
  }

  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h3 = Math.imul(h3 ^ (h3 >>> 16), 2246822507) ^ Math.imul(h4 ^ (h4 >>> 13), 3266489909);
  h4 = Math.imul(h4 ^ (h4 >>> 16), 2246822507) ^ Math.imul(h3 ^ (h3 >>> 13), 3266489909);

  return [h1, h2, h3, h4]
    .map((h) => (h >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

export const INSTITUTIONS: Record<
  string,
  { label: string; color: string; badgeBg: string }
> = {
  nubank: { label: "Nubank", color: "#A855F7", badgeBg: "rgba(168, 85, 247, 0.16)" },
  inter: { label: "Banco Inter", color: "#F97316", badgeBg: "rgba(249, 115, 22, 0.16)" },
  itau: { label: "Itaú", color: "#FB923C", badgeBg: "rgba(251, 146, 60, 0.16)" },
  bradesco: { label: "Bradesco", color: "#F43F5E", badgeBg: "rgba(244, 63, 94, 0.16)" },
  bb: { label: "Banco do Brasil", color: "#FACC15", badgeBg: "rgba(250, 204, 21, 0.16)" },
  c6: { label: "C6 Bank", color: "#94A3B8", badgeBg: "rgba(148, 163, 184, 0.16)" },
  santander: { label: "Santander", color: "#EF4444", badgeBg: "rgba(239, 68, 68, 0.16)" },
  xp: { label: "XP Investimentos", color: "#EAB308", badgeBg: "rgba(234, 179, 8, 0.16)" },
  btg: { label: "BTG Pactual", color: "#38BDF8", badgeBg: "rgba(56, 189, 248, 0.16)" },
  caixa: { label: "Caixa", color: "#3B82F6", badgeBg: "rgba(59, 130, 246, 0.16)" },
  other: { label: "Outra Instituição", color: "#22D3EE", badgeBg: "rgba(34, 211, 238, 0.16)" },
};
