import { sqlite, ensureDatabaseInitialized } from "@/db";
import type { CategorizationRule, Category } from "@/db/schema";

export interface SanitizedTransactionInfo {
  cleanDescription: string;
  merchantName: string;
  normalizedKey: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
}

export interface ClassificationResult {
  categoryId: string | null;
  categoryName?: string;
  merchantName: string;
  cleanDescription: string;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  source: "rule" | "history" | "ai" | "uncategorized";
  confidence: number;
}

/**
 * Extrai parcelas (ex: "02/10", "PARC 3/12") e limpa prefixos bancários ruidosos
 */
export function sanitizeBankDescription(raw: string): SanitizedTransactionInfo {
  let text = (raw || "").trim();

  // Detecta parcelas no formato 02/12, 3/10, PARC 01/06 (evitando datas como 31/12 se seguidas de ano, mas capturando final de string)
  let installmentCurrent: number | null = null;
  let installmentTotal: number | null = null;

  const parcMatch =
    text.match(/(?:PARC(?:ELA)?\s*)?(\d{1,2})\s*\/\s*(\d{1,2})(?:\b|$)/i) ||
    text.match(/(\d{1,2})\s+DE\s+(\d{1,2})\b/i);

  if (parcMatch) {
    const cur = Number.parseInt(parcMatch[1], 10);
    const tot = Number.parseInt(parcMatch[2], 10);
    if (cur >= 1 && tot >= 2 && cur <= tot && tot <= 72) {
      installmentCurrent = cur;
      installmentTotal = tot;
    }
  }

  // Remove prefixos comuns de extratos brasileiros
  const noisePrefixes = [
    /^COMPRA\s+(?:NO\s+)?CARTAO(?:\s+DE\s+DEBITO|\s+DEB|\s+CRED)?\s*[-–:]?\s*/i,
    /^COMPRA\s+DEBITO\s*[-–:]?\s*/i,
    /^PIX\s+(?:ENVIADO|RECEBIDO|TRANSF|TRANSFERENCIA)\s*[-–:]?\s*/i,
    /^TRANSFERENCIA\s+PIX\s+(?:ENVIADA|RECEBIDA)?\s*[-–:]?\s*/i,
    /^PAGAMENTO\s+EFETUADO\s*[-–:]?\s*/i,
    /^DEB(?:ITO)?\s+AUT(?:OMATICO)?\s*[-–:]?\s*/i,
    /^ TED\s+[-–:]?\s*/i,
    /^DOC\s+[-–:]?\s*/i,
    /^SISPAG\s*[-–:]?\s*/i,
  ];

  for (const regex of noisePrefixes) {
    text = text.replace(regex, "");
  }

  // Limpa prefixos de gateways mantendo a marca quando relevante
  text = text
    .replace(/^(?:PAG\*|MP\s*\*|MERCADOPAGO\*|PAGSEGURO\*|STONE\*|CIELO\*|SUMUP\*|EBN\*|DL\*)/i, "")
    .replace(/\b(?:BRASIL|SAO PAULO|RIO DE JANEIRO|CURITIBA|BELO HORIZONTE|BRA|BR)\s*$/i, "")
    .replace(/\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s*$/, "") // Remove data solta no fim
    .replace(/\s+/g, " ")
    .trim();

  if (!text) {
    text = raw.trim() || "Transação";
  }

  // Nome do estabelecimento sem o marcador de parcela
  const withoutInstallment = text
    .replace(/(?:-\s*)?(?:PARC(?:ELA)?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const merchantCandidate = prettifyMerchantName(withoutInstallment || text);
  const normalizedKey = (withoutInstallment || text)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

  const cleanDescription =
    installmentCurrent && installmentTotal
      ? `${merchantCandidate} (${installmentCurrent}/${installmentTotal})`
      : merchantCandidate;

  return {
    cleanDescription,
    merchantName: merchantCandidate,
    normalizedKey: normalizedKey || "UNKNOWN",
    installmentCurrent,
    installmentTotal,
  };
}

function prettifyMerchantName(rawClean: string): string {
  const upper = rawClean.toUpperCase();
  if (/IFD\*|IFOOD/.test(upper)) return "iFood";
  if (/^UBER\b|UBER\s*\*|UBER DO BRASIL/.test(upper)) return "Uber";
  if (/^99APP|^99\s*\*/.test(upper)) return "99 App";
  if (/NETFLIX/.test(upper)) return "Netflix";
  if (/SPOTIFY/.test(upper)) return "Spotify";
  if (/MERCADOLIVRE|MERCADO LIVRE/.test(upper)) return "Mercado Livre";
  if (/AMAZON\s*PRIME/.test(upper)) return "Amazon Prime";
  if (/AMAZON/.test(upper)) return "Amazon";
  if (/DROGASIL/.test(upper)) return "Drogasil";
  if (/DROGA\s*RAIA/.test(upper)) return "Droga Raia";
  if (/CARREFOUR/.test(upper)) return "Carrefour";
  if (/PAO DE ACUCAR/.test(upper)) return "Pão de Açúcar";
  if (/ASSAI/.test(upper)) return "Assaí Atacadista";
  if (/SMART\s*FIT/.test(upper)) return "Smart Fit";

  // Capitalização inteligente (Title Case preservando siglas curtas)
  return rawClean
    .split(" ")
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 2 && /^[A-Z0-9]+$/.test(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

/**
 * Similaridade de Dice / Bigramas (0.0 a 1.0) rápida e 100% local
 */
export function computeStringSimilarity(a: string, b: string): number {
  const s1 = a.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const s2 = b.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }

  return (2.0 * intersection) / (s1.length - 1 + (s2.length - 1));
}

function matchesRule(
  rule: CategorizationRule,
  rawDescription: string,
  cleanDescription: string,
  amountCents: number
): boolean {
  const absAmount = Math.abs(amountCents);
  if (rule.minAmountCents !== null && absAmount < rule.minAmountCents) return false;
  if (rule.maxAmountCents !== null && absAmount > rule.maxAmountCents) return false;

  const targetText = `${rawDescription} ${cleanDescription}`.toUpperCase();
  const pattern = rule.pattern.trim();
  if (!pattern) return false;

  switch (rule.matchType) {
    case "exact":
      return (
        rawDescription.toUpperCase() === pattern.toUpperCase() ||
        cleanDescription.toUpperCase() === pattern.toUpperCase()
      );
    case "starts_with":
      return (
        rawDescription.toUpperCase().startsWith(pattern.toUpperCase()) ||
        cleanDescription.toUpperCase().startsWith(pattern.toUpperCase())
      );
    case "regex":
      try {
        const regex = new RegExp(pattern, "i");
        return regex.test(targetText);
      } catch {
        return targetText.includes(pattern.toUpperCase());
      }
    case "contains":
    default:
      return targetText.includes(pattern.toUpperCase());
  }
}

/**
 * Classifica um lote de transações passando pelas Camadas 1 (Regras), 2 (Histórico Local) e 3 (IA opcional)
 */
export async function classifyTransactionsPipeline(
  items: Array<{ rawDescription: string; amountCents: number; originalCategoryHint?: string | null }>
): Promise<ClassificationResult[]> {
  ensureDatabaseInitialized();

  // Carrega categorias, regras ativas e memória de estabelecimentos/transações
  const categoriesRows = sqlite
    .prepare(
      `SELECT id, parent_id as parentId, name, slug, type, icon, color, monthly_budget_cents as monthlyBudgetCents
       FROM categories`
    )
    .all() as unknown as Category[];

  const categoryById = new Map(categoriesRows.map((c) => [c.id, c]));

  const rulesRows = sqlite
    .prepare(
      `SELECT id, name, match_type as matchType, pattern,
              min_amount_cents as minAmountCents, max_amount_cents as maxAmountCents,
              target_category_id as targetCategoryId, target_merchant_name as targetMerchantName,
              priority, is_active as isActive, hit_count as hitCount, created_at as createdAt
       FROM categorization_rules
       WHERE is_active = 1
       ORDER BY priority ASC, hit_count DESC`
    )
    .all() as unknown as CategorizationRule[];

  const historicalMemory = sqlite
    .prepare(
      `SELECT raw_description as rawDescription, clean_description as cleanDescription,
              merchant_name as merchantName, category_id as categoryId
       FROM transactions
       WHERE category_id IS NOT NULL
       GROUP BY clean_description, category_id
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all() as Array<{
    rawDescription: string;
    cleanDescription: string;
    merchantName: string | null;
    categoryId: string;
  }>;

  const results: ClassificationResult[] = [];
  const unresolvedIndices: number[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sanitized = sanitizeBankDescription(item.rawDescription);

    // Se for valor positivo (entrada) e contiver SALARIO / REMUNERACAO / PIX RECEBIDO
    if (item.amountCents > 0) {
      const upper = item.rawDescription.toUpperCase();
      if (/SALARIO|REMUNERACAO|PRO-LABORE|PROLABORE|PAGTO SALARIO/.test(upper)) {
        const salCat = categoryById.get("cat_salario");
        results.push({
          categoryId: salCat ? salCat.id : null,
          categoryName: salCat?.name,
          merchantName: sanitized.merchantName,
          cleanDescription: sanitized.cleanDescription,
          installmentCurrent: sanitized.installmentCurrent,
          installmentTotal: sanitized.installmentTotal,
          source: "rule",
          confidence: 0.98,
        });
        continue;
      }
      if (/RENDIMENTO|DIVIDENDO|JCP|TESOURO|CDB|LCI|LCA|FUNDO/.test(upper)) {
        const rendCat = categoryById.get("cat_rendimentos");
        results.push({
          categoryId: rendCat ? rendCat.id : null,
          categoryName: rendCat?.name,
          merchantName: sanitized.merchantName,
          cleanDescription: sanitized.cleanDescription,
          installmentCurrent: sanitized.installmentCurrent,
          installmentTotal: sanitized.installmentTotal,
          source: "rule",
          confidence: 0.95,
        });
        continue;
      }
    }

    // CAMADA 1: Regras Determinísticas
    let matchedRule: CategorizationRule | null = null;
    for (const rule of rulesRows) {
      if (matchesRule(rule, item.rawDescription, sanitized.cleanDescription, item.amountCents)) {
        matchedRule = rule;
        break;
      }
    }

    if (matchedRule) {
      const cat = categoryById.get(matchedRule.targetCategoryId);
      const finalMerchant = matchedRule.targetMerchantName || sanitized.merchantName;
      results.push({
        categoryId: matchedRule.targetCategoryId,
        categoryName: cat?.name,
        merchantName: finalMerchant,
        cleanDescription:
          sanitized.installmentCurrent && sanitized.installmentTotal
            ? `${finalMerchant} (${sanitized.installmentCurrent}/${sanitized.installmentTotal})`
            : sanitized.cleanDescription,
        installmentCurrent: sanitized.installmentCurrent,
        installmentTotal: sanitized.installmentTotal,
        source: "rule",
        confidence: 1.0,
      });
      continue;
    }

    // CAMADA 2: Memória Histórica e Similaridade Local
    let bestHistoryMatch: { categoryId: string; merchantName: string | null; score: number } | null =
      null;

    for (const hist of historicalMemory) {
      const score = Math.max(
        computeStringSimilarity(sanitized.cleanDescription, hist.cleanDescription),
        computeStringSimilarity(item.rawDescription, hist.rawDescription)
      );
      if (score >= 0.82 && (!bestHistoryMatch || score > bestHistoryMatch.score)) {
        bestHistoryMatch = {
          categoryId: hist.categoryId,
          merchantName: hist.merchantName,
          score,
        };
      }
    }

    if (bestHistoryMatch) {
      const cat = categoryById.get(bestHistoryMatch.categoryId);
      results.push({
        categoryId: bestHistoryMatch.categoryId,
        categoryName: cat?.name,
        merchantName: bestHistoryMatch.merchantName || sanitized.merchantName,
        cleanDescription: sanitized.cleanDescription,
        installmentCurrent: sanitized.installmentCurrent,
        installmentTotal: sanitized.installmentTotal,
        source: "history",
        confidence: Number(bestHistoryMatch.score.toFixed(2)),
      });
      continue;
    }

    // Dica de categoria original vinda do CSV (ex: fatura Nubank/C6)
    if (item.originalCategoryHint) {
      const hintUpper = item.originalCategoryHint
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

      const hintMap: Array<{ pattern: RegExp; catId: string }> = [
        { pattern: /RESTAURANTE|ALIMENTA|IFOOD|LANCHE/, catId: "cat_alimentacao" },
        { pattern: /SUPERMERCADO|MERCADO/, catId: "cat_supermercado" },
        { pattern: /TRANSPORTE|UBER|VIAGEM|POSTO/, catId: "cat_transporte" },
        { pattern: /CASA|MORADIA|CONTA/, catId: "cat_moradia" },
        { pattern: /SAUDE|FARMACIA|DROGARIA/, catId: "cat_saude" },
        { pattern: /SERVICO|ASSINATURA|STREAMING/, catId: "cat_assinaturas" },
        { pattern: /EDUCACAO|CURSO|LIVRO/, catId: "cat_educacao" },
        { pattern: /LAZER|ENTRETENIMENTO/, catId: "cat_lazer" },
        { pattern: /ELETRONICO|VESTUARIO|COMPRA|SHOPPING/, catId: "cat_compras" },
      ];

      const matchedHint = hintMap.find((h) => h.pattern.test(hintUpper));
      if (matchedHint && categoryById.has(matchedHint.catId)) {
        const cat = categoryById.get(matchedHint.catId)!;
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          merchantName: sanitized.merchantName,
          cleanDescription: sanitized.cleanDescription,
          installmentCurrent: sanitized.installmentCurrent,
          installmentTotal: sanitized.installmentTotal,
          source: "rule",
          confidence: 0.85,
        });
        continue;
      }
    }

    // Caso seja entrada genérica ainda sem categoria
    if (item.amountCents > 0) {
      const recCat = categoryById.get("cat_outras_receitas");
      results.push({
        categoryId: recCat?.id ?? null,
        categoryName: recCat?.name,
        merchantName: sanitized.merchantName,
        cleanDescription: sanitized.cleanDescription,
        installmentCurrent: sanitized.installmentCurrent,
        installmentTotal: sanitized.installmentTotal,
        source: "rule",
        confidence: 0.7,
      });
      continue;
    }

    // Pendente para Camada 3 (IA) ou Inbox
    results.push({
      categoryId: null,
      categoryName: undefined,
      merchantName: sanitized.merchantName,
      cleanDescription: sanitized.cleanDescription,
      installmentCurrent: sanitized.installmentCurrent,
      installmentTotal: sanitized.installmentTotal,
      source: "uncategorized",
      confidence: 0,
    });
    unresolvedIndices.push(i);
  }

  // CAMADA 3: IA Local (Ollama) ou BYOK Cloud (se configurada pelo usuário)
  if (unresolvedIndices.length > 0) {
    try {
      const aiPredictions = await tryClassifyWithConfiguredAi(
        unresolvedIndices.map((idx) => ({
          index: idx,
          description: results[idx].cleanDescription,
          amountCents: items[idx].amountCents,
        })),
        categoriesRows
      );

      for (const pred of aiPredictions) {
        const cat = categoryById.get(pred.categoryId);
        if (cat && results[pred.index]) {
          results[pred.index] = {
            ...results[pred.index],
            categoryId: cat.id,
            categoryName: cat.name,
            merchantName: pred.cleanMerchant || results[pred.index].merchantName,
            source: "ai",
            confidence: pred.confidence ?? 0.8,
          };
        }
      }
    } catch {
      // Se IA estiver offline ou não configurada, mantém como 'uncategorized' para revisão no Inbox
    }
  }

  return results;
}

function getAppSettingsMap(): Record<string, string> {
  const rows = sqlite.prepare("SELECT key, value FROM app_settings").all() as Array<{
    key: string;
    value: string;
  }>;
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Anonimiza CPFs, CNPJs e números longos antes de enviar descrições para IA
 */
function anonymizeForAi(text: string): string {
  return text
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[CNPJ]")
    .replace(/\b\d{6,}\b/g, "[NUM]");
}

async function tryClassifyWithConfiguredAi(
  unresolved: Array<{ index: number; description: string; amountCents: number }>,
  categories: Category[]
): Promise<Array<{ index: number; categoryId: string; cleanMerchant?: string; confidence?: number }>> {
  const settings = getAppSettingsMap();
  const provider = settings.ai_provider || "none"; // none | ollama | gemini | openai
  if (provider === "none" || unresolved.length === 0) {
    return [];
  }

  const batch = unresolved.slice(0, 40).map((u) => ({
    index: u.index,
    description: anonymizeForAi(u.description),
    type: u.amountCents < 0 ? "expense" : "income",
  }));

  const categoriesList = categories.map((c) => `${c.id}: ${c.name} (${c.type})`).join("\n");

  const prompt = `Você é o classificador financeiro do Aurora Finance.
Classifique cada transação abaixo em uma das categorias disponíveis.
Categorias disponíveis:
${categoriesList}

Transações (JSON):
${JSON.stringify(batch)}

Responda APENAS um JSON válido no formato:
{"items": [{"index": number, "categoryId": "id_da_categoria", "cleanMerchant": "Nome Limpo", "confidence": 0.85}]}`;

  if (provider === "ollama") {
    const baseUrl = settings.ollama_url || "http://localhost:11434";
    const model = settings.ollama_model || "llama3.2";
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        format: "json",
        stream: false,
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { response?: string };
    if (!data.response) return [];
    const parsed = JSON.parse(data.response) as {
      items?: Array<{ index: number; categoryId: string; cleanMerchant?: string; confidence?: number }>;
    };
    return Array.isArray(parsed.items) ? parsed.items : [];
  }

  if (provider === "gemini" && settings.gemini_api_key) {
    const model = settings.gemini_model || "gemini-2.0-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
      settings.gemini_api_key
    )}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) return [];
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed.items) ? parsed.items : [];
  }

  if (provider === "openai" && settings.openai_api_key) {
    const model = settings.openai_model || "gpt-4o-mini";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.openai_api_key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content;
    if (!rawText) return [];
    const parsed = JSON.parse(rawText);
    return Array.isArray(parsed.items) ? parsed.items : [];
  }

  return [];
}

