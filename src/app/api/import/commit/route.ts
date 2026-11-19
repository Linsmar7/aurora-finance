import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";
import { computeTransactionDedupHash, INSTITUTIONS } from "@/lib/utils";

interface CommitTransactionInput {
  date: string;
  rawDescription: string;
  cleanDescription: string;
  merchantName: string;
  amountCents: number;
  categoryId: string | null;
  classificationSource: string;
  confidence: number;
  installmentCurrent: number | null;
  installmentTotal: number | null;
  externalId: string | null;
  sourceFilename?: string;
  filename?: string;
  skip?: boolean;
}

interface InputFileBatch {
  filename: string;
  fileType: string;
  fileHash: string;
}

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();

    let accountId: string = body.accountId;
    const newAccountName: string | undefined = body.newAccountName;
    const newAccountInstitution: string = body.newAccountInstitution || "other";
    const newAccountType: string = body.newAccountType || "checking";
    const items: CommitTransactionInput[] = Array.isArray(body.items) ? body.items : [];

    const filesList: InputFileBatch[] =
      Array.isArray(body.files) && body.files.length > 0
        ? body.files
        : [
            {
              filename: body.filename || "extrato",
              fileType: body.fileType || "csv",
              fileHash: body.fileHash || crypto.randomUUID(),
            },
          ];

    const now = new Date().toISOString();

    // Se o usuário pediu para criar a conta durante a importação
    if (!accountId || accountId === "new") {
      if (!newAccountName || !newAccountName.trim()) {
        return NextResponse.json(
          { error: "Informe o nome da conta bancária ou cartão para importar." },
          { status: 400 }
        );
      }
      accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const instColor = INSTITUTIONS[newAccountInstitution]?.color || "#22D3EE";

      sqlite
        .prepare(
          `INSERT INTO accounts (id, name, institution, type, initial_balance_cents, color, created_at)
           VALUES (?, ?, ?, ?, 0, ?, ?)`
        )
        .run(
          accountId,
          newAccountName.trim(),
          newAccountInstitution,
          newAccountType,
          instColor,
          now
        );
    }

    const existingHashes = new Set<string>(
      (
        sqlite
          .prepare("SELECT dedup_hash as dedupHash FROM transactions WHERE account_id = ?")
          .all(accountId) as Array<{ dedupHash: string }>
      ).map((r) => r.dedupHash)
    );

    const categoryTypes = new Map<string, string>(
      (
        sqlite.prepare("SELECT id, type FROM categories").all() as Array<{
          id: string;
          type: string;
        }>
      ).map((c) => [c.id, c.type])
    );

    const batchMap = new Map<string, string>(); // filename -> batchId
    const batchStats = new Map<
      string,
      { totalRows: number; importedCount: number; duplicateCount: number }
    >();

    let totalImported = 0;
    let totalDuplicate = 0;
    const sequenceTracker = new Map<string, number>();

    sqlite.exec("BEGIN TRANSACTION;");
    try {
      const insertBatchStmt = sqlite.prepare(`
        INSERT INTO import_batches (
          id, account_id, filename, file_type, file_hash, total_rows, imported_count, duplicate_count, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?)
      `);

      for (const f of filesList) {
        const bId = `batch_${crypto.randomUUID().slice(0, 10)}`;
        batchMap.set(f.filename, bId);
        batchStats.set(bId, { totalRows: 0, importedCount: 0, duplicateCount: 0 });
        insertBatchStmt.run(bId, accountId, f.filename, f.fileType, f.fileHash, 0, now);
      }

      // Default batch id em caso de item sem nome de arquivo correspondente
      const defaultBatchId = batchMap.values().next().value!;

      const insertTx = sqlite.prepare(`
        INSERT INTO transactions (
          id, account_id, category_id, import_batch_id, date, competence_date,
          amount_cents, type, raw_description, clean_description, merchant_name,
          installment_current, installment_total, external_id, dedup_hash,
          classification_source, confidence_score, is_reviewed, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        if (item.skip) continue;

        const targetFilename = item.sourceFilename || item.filename || "";
        const targetBatchId = (targetFilename && batchMap.get(targetFilename)) || defaultBatchId;
        const stats = batchStats.get(targetBatchId)!;
        stats.totalRows++;

        const seqKey = `${item.date}|${item.amountCents}|${item.rawDescription.toUpperCase().trim()}`;
        const seq = sequenceTracker.get(seqKey) || 0;
        sequenceTracker.set(seqKey, seq + 1);

        const dedupHash = computeTransactionDedupHash({
          accountId,
          date: item.date,
          amountCents: item.amountCents,
          rawDescription: item.rawDescription,
          externalId: item.externalId,
          sequenceInFile: seq,
        });

        if (existingHashes.has(dedupHash)) {
          totalDuplicate++;
          stats.duplicateCount++;
          continue;
        }

        existingHashes.add(dedupHash);

        const catType = item.categoryId ? categoryTypes.get(item.categoryId) : undefined;
        const txType =
          catType === "transfer"
            ? "transfer"
            : item.amountCents >= 0
              ? "income"
              : "expense";

        const txId = `tx_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
        const isReviewed = item.categoryId ? 1 : 0;

        insertTx.run(
          txId,
          accountId,
          item.categoryId || null,
          targetBatchId,
          item.date,
          item.date,
          item.amountCents,
          txType,
          item.rawDescription,
          item.cleanDescription || item.rawDescription,
          item.merchantName || null,
          item.installmentCurrent ?? null,
          item.installmentTotal ?? null,
          item.externalId ?? null,
          dedupHash,
          item.classificationSource || "uncategorized",
          item.confidence ?? 0,
          isReviewed,
          now
        );

        totalImported++;
        stats.importedCount++;
      }

      // Atualiza os contadores finais em cada lote
      const updateBatchStmt = sqlite.prepare(`
        UPDATE import_batches
        SET total_rows = ?, imported_count = ?, duplicate_count = ?
        WHERE id = ?
      `);

      for (const [bId, st] of batchStats.entries()) {
        updateBatchStmt.run(st.totalRows, st.importedCount, st.duplicateCount, bId);
      }

      sqlite.exec("COMMIT;");
    } catch (err) {
      sqlite.exec("ROLLBACK;");
      throw err;
    }

    return NextResponse.json({
      success: true,
      batchId: batchMap.values().next().value,
      batchIds: Array.from(batchMap.values()),
      accountId,
      importedCount: totalImported,
      duplicateCount: totalDuplicate,
      filesCount: filesList.length,
    });
  } catch (error) {
    console.error("[Import Commit Error]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erro ao gravar transações no banco SQLite.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const { searchParams } = new URL(req.url);
    const batchId = searchParams.get("batchId");
    if (!batchId) {
      return NextResponse.json({ error: "ID do lote não informado." }, { status: 400 });
    }

    // ON DELETE CASCADE em transactions.import_batch_id remove todas as transações daquele lote
    sqlite.prepare("DELETE FROM transactions WHERE import_batch_id = ?").run(batchId);
    sqlite.prepare("DELETE FROM import_batches WHERE id = ?").run(batchId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao desfazer lote." },
      { status: 500 }
    );
  }
}
