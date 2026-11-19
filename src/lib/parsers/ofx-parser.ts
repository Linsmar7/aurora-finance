import { normalizeDateToIso, parseMoneyToCents } from "@/lib/utils";

export interface ParsedRawTransaction {
  date: string; // YYYY-MM-DD
  rawDescription: string;
  amountCents: number;
  externalId: string | null;
  originalCategoryHint?: string | null;
}

export interface OfxParseResult {
  detectedBank: string;
  accountNumberHint: string | null;
  transactions: ParsedRawTransaction[];
}

function extractOfxTag(block: string, tagName: string): string | null {
  // Suporta XML (<TAG>val</TAG>) e SGML OFX 1.x (<TAG>val\r\n)
  const xmlRegex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const xmlMatch = block.match(xmlRegex);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }

  const sgmlRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, "i");
  const sgmlMatch = block.match(sgmlRegex);
  if (sgmlMatch) {
    return sgmlMatch[1].trim();
  }

  return null;
}

export function parseOfxContent(content: string): OfxParseResult {
  const org = extractOfxTag(content, "ORG") || "";
  const bankId = extractOfxTag(content, "BANKID") || "";
  const acctId = extractOfxTag(content, "ACCTID");
  const upperMeta = `${org} ${bankId}`.toUpperCase();

  let detectedBank = "other";
  if (/NU PAGAMENTOS|NUBANK|0260|260/.test(upperMeta)) detectedBank = "nubank";
  else if (/INTER|0077|077/.test(upperMeta)) detectedBank = "inter";
  else if (/ITAU|0341|341/.test(upperMeta)) detectedBank = "itau";
  else if (/BRADESCO|0237|237/.test(upperMeta)) detectedBank = "bradesco";
  else if (/BRASIL|0001|001/.test(upperMeta)) detectedBank = "bb";
  else if (/C6|0336|336/.test(upperMeta)) detectedBank = "c6";
  else if (/SANTANDER|0033|033/.test(upperMeta)) detectedBank = "santander";
  else if (/CAIXA|0104|104/.test(upperMeta)) detectedBank = "caixa";
  else if (/BTG|0208|208/.test(upperMeta)) detectedBank = "btg";

  const transactions: ParsedRawTransaction[] = [];

  // Divide por blocos <STMTTRN>
  const blocks = content.split(/<STMTTRN>/i).slice(1);

  for (const rawBlock of blocks) {
    const block = rawBlock.split(/<\/STMTTRN>/i)[0] || rawBlock;
    const dtPosted = extractOfxTag(block, "DTPOSTED");
    const trnAmt = extractOfxTag(block, "TRNAMT");
    const fitId = extractOfxTag(block, "FITID");
    const memo = extractOfxTag(block, "MEMO");
    const name = extractOfxTag(block, "NAME");
    const trnType = extractOfxTag(block, "TRNTYPE");

    if (!dtPosted || !trnAmt) continue;

    const isoDate = normalizeDateToIso(dtPosted);
    if (!isoDate) continue;

    let amountCents = parseMoneyToCents(trnAmt);
    if (amountCents === 0) continue;

    // Alguns OFX usam TRNTYPE=DEBIT mas enviam TRNAMT sem sinal negativo
    if (trnType && /^DEBIT|PAYMENT|ATM|POS|FEE|SRVCHG$/i.test(trnType) && amountCents > 0 && !trnAmt.includes("+")) {
      // Só inverte se o arquivo inteiro não usar sinais negativos
      if (!content.includes("<TRNAMT>-")) {
        amountCents = -Math.abs(amountCents);
      }
    }

    let rawDescription = "";
    if (memo && name && memo.toUpperCase() !== name.toUpperCase()) {
      rawDescription = memo.length >= name.length ? memo : `${name} - ${memo}`;
    } else {
      rawDescription = memo || name || "Lançamento OFX";
    }

    transactions.push({
      date: isoDate,
      rawDescription: rawDescription.replace(/\s+/g, " ").trim(),
      amountCents,
      externalId: fitId || null,
    });
  }

  return {
    detectedBank,
    accountNumberHint: acctId,
    transactions,
  };
}

