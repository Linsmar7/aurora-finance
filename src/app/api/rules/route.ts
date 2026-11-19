import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";
import { classifyTransactionsPipeline } from "@/lib/categorizer/engine";

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();

    // Ação especial: Re-executar motor de regras em todas as transações existentes sem categoria (ou todas exceto manuais)
    if (body.action === "reprocess") {
      const targetRows = sqlite
        .prepare(
          `SELECT id, raw_description as rawDescription, amount_cents as amountCents
           FROM transactions
           WHERE category_id IS NULL OR classification_source != 'manual'`
        )
        .all() as Array<{ id: string; rawDescription: string; amountCents: number }>;

      if (targetRows.length === 0) {
        return NextResponse.json({ success: true, updatedCount: 0 });
      }

      const classified = await classifyTransactionsPipeline(
        targetRows.map((r) => ({
          rawDescription: r.rawDescription,
          amountCents: r.amountCents,
        }))
      );

      let updatedCount = 0;
      const updateStmt = sqlite.prepare(
        `UPDATE transactions
         SET category_id = ?,
             clean_description = ?,
             merchant_name = ?,
             classification_source = ?,
             confidence_score = ?,
             is_reviewed = 1
         WHERE id = ?`
      );

      sqlite.exec("BEGIN TRANSACTION;");
      try {
        for (let i = 0; i < targetRows.length; i++) {
          const cls = classified[i];
          if (cls && cls.categoryId) {
            updateStmt.run(
              cls.categoryId,
              cls.cleanDescription,
              cls.merchantName,
              cls.source,
              cls.confidence,
              targetRows[i].id
            );
            updatedCount++;
          }
        }
        sqlite.exec("COMMIT;");
      } catch (err) {
        sqlite.exec("ROLLBACK;");
        throw err;
      }

      return NextResponse.json({ success: true, updatedCount });
    }

    const name = (body.name || "").trim();
    const matchType = body.matchType || "contains";
    const pattern = (body.pattern || "").trim();
    const targetCategoryId = body.targetCategoryId;
    const targetMerchantName = body.targetMerchantName ? String(body.targetMerchantName).trim() : null;
    const priority = Number(body.priority || 20);

    if (!name || !pattern || !targetCategoryId) {
      return NextResponse.json(
        { error: "Nome, padrão de busca e categoria alvo são obrigatórios." },
        { status: 400 }
      );
    }

    const id = `rule_${crypto.randomUUID().slice(0, 8)}`;
    sqlite
      .prepare(
        `INSERT INTO categorization_rules (
          id, name, match_type, pattern, target_category_id, target_merchant_name, priority, is_active, hit_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?)`
      )
      .run(
        id,
        name,
        matchType,
        pattern,
        targetCategoryId,
        targetMerchantName,
        priority,
        new Date().toISOString()
      );

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar regra." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ID da regra não informado." }, { status: 400 });
    }

    sqlite.prepare("DELETE FROM categorization_rules WHERE id = ?").run(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover regra." },
      { status: 500 }
    );
  }
}
