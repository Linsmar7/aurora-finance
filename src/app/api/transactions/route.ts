import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";
import { sanitizeBankDescription } from "@/lib/categorizer/engine";
import { computeTransactionDedupHash } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();
    const accountId: string = body.accountId;
    const date: string = body.date;
    const rawDescription: string = (body.description || "").trim();
    const amountCents: number = Number(body.amountCents || 0);
    const categoryId: string | null = body.categoryId || null;

    if (!accountId || !date || !rawDescription || amountCents === 0) {
      return NextResponse.json(
        { error: "Conta, data, descrição e valor são obrigatórios." },
        { status: 400 }
      );
    }

    const sanitized = sanitizeBankDescription(rawDescription);
    const now = new Date().toISOString();
    const id = `tx_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const dedupHash = computeTransactionDedupHash({
      accountId,
      date,
      amountCents,
      rawDescription,
      sequenceInFile: Date.now(),
    });

    const catRow = categoryId
      ? (sqlite.prepare("SELECT type FROM categories WHERE id = ?").get(categoryId) as
          | { type: string }
          | undefined)
      : undefined;

    const txType =
      catRow?.type === "transfer"
        ? "transfer"
        : amountCents >= 0
          ? "income"
          : "expense";

    sqlite
      .prepare(
        `INSERT INTO transactions (
          id, account_id, category_id, date, competence_date, amount_cents, type,
          raw_description, clean_description, merchant_name, installment_current,
          installment_total, dedup_hash, classification_source, confidence_score,
          is_reviewed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1.0, 1, ?)`
      )
      .run(
        id,
        accountId,
        categoryId,
        date,
        date,
        amountCents,
        txType,
        rawDescription,
        sanitized.cleanDescription,
        sanitized.merchantName,
        sanitized.installmentCurrent,
        sanitized.installmentTotal,
        dedupHash,
        now
      );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar transação." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();

    // Suporta edição individual ou em lote (ids: string[])
    const ids: string[] = Array.isArray(body.ids)
      ? body.ids
      : body.id
        ? [body.id]
        : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Nenhuma transação selecionada." }, { status: 400 });
    }

    const categoryId: string | null | undefined = body.categoryId;
    const applyToSimilar: boolean = Boolean(body.applyToSimilar);
    const createRule: boolean = Boolean(body.createRule);
    const isIgnored: number | undefined =
      body.isIgnored !== undefined ? (body.isIgnored ? 1 : 0) : undefined;

    let updatedCount = 0;
    let createdRuleId: string | null = null;

    if (categoryId !== undefined) {
      const catRow = categoryId
        ? (sqlite.prepare("SELECT type FROM categories WHERE id = ?").get(categoryId) as
            | { type: string }
            | undefined)
        : undefined;

      const placeholders = ids.map(() => "?").join(",");
      const updateStmt = sqlite.prepare(
        `UPDATE transactions
         SET category_id = ?,
             type = CASE WHEN ? = 'transfer' THEN 'transfer' WHEN amount_cents >= 0 THEN 'income' ELSE 'expense' END,
             classification_source = 'manual',
             confidence_score = 1.0,
             is_reviewed = 1
         WHERE id IN (${placeholders})`
      );

      updateStmt.run(categoryId, catRow?.type || "expense", ...ids);
      updatedCount += ids.length;

      // Aprendizado Inteligente: aplica para transações similares e cria regra futura
      if (categoryId && (applyToSimilar || createRule) && ids.length >= 1) {
        const refTx = sqlite
          .prepare(
            "SELECT raw_description as rawDescription, clean_description as cleanDescription, merchant_name as merchantName FROM transactions WHERE id = ?"
          )
          .get(ids[0]) as
          | { rawDescription: string; cleanDescription: string; merchantName: string | null }
          | undefined;

        if (refTx) {
          const patternCandidate = (refTx.merchantName || refTx.cleanDescription)
            .replace(/\(\d+\/\d+\)/g, "")
            .trim();

          if (patternCandidate.length >= 3) {
            if (applyToSimilar) {
              const simStmt = sqlite.prepare(
                `UPDATE transactions
                 SET category_id = ?,
                     type = CASE WHEN ? = 'transfer' THEN 'transfer' WHEN amount_cents >= 0 THEN 'income' ELSE 'expense' END,
                     classification_source = 'rule',
                     confidence_score = 1.0,
                     is_reviewed = 1
                 WHERE UPPER(clean_description) LIKE ? OR UPPER(COALESCE(merchant_name, '')) = ?`
              );
              const res = simStmt.run(
                categoryId,
                catRow?.type || "expense",
                `%${patternCandidate.toUpperCase()}%`,
                patternCandidate.toUpperCase()
              );
              updatedCount = Number(res.changes || updatedCount);
            }

            if (createRule) {
              createdRuleId = `rule_${crypto.randomUUID().slice(0, 8)}`;
              sqlite
                .prepare(
                  `INSERT INTO categorization_rules (
                    id, name, match_type, pattern, target_category_id, target_merchant_name, priority, is_active, hit_count, created_at
                  ) VALUES (?, ?, 'contains', ?, ?, ?, 15, 1, 1, ?)`
                )
                .run(
                  createdRuleId,
                  `Regra: ${patternCandidate}`,
                  patternCandidate.toUpperCase(),
                  categoryId,
                  patternCandidate,
                  new Date().toISOString()
                );
            }
          }
        }
      }
    }

    if (isIgnored !== undefined) {
      const placeholders = ids.map(() => "?").join(",");
      sqlite
        .prepare(`UPDATE transactions SET is_ignored = ? WHERE id IN (${placeholders})`)
        .run(isIgnored, ...ids);
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      createdRuleId,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar transação." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const ids = idsParam ? idsParam.split(",").filter(Boolean) : id ? [id] : [];

    if (ids.length === 0) {
      return NextResponse.json({ error: "Nenhum ID informado." }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    sqlite.prepare(`DELETE FROM transactions WHERE id IN (${placeholders})`).run(...ids);

    return NextResponse.json({ success: true, deletedCount: ids.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir transações." },
      { status: 500 }
    );
  }
}
