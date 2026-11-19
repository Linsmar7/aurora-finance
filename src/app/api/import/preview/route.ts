import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";
import { parseOfxContent, type ParsedRawTransaction } from "@/lib/parsers/ofx-parser";
import {
  inspectCsvContent,
  extractTransactionsFromCsv,
  type CsvColumnMapping,
} from "@/lib/parsers/csv-parser";
import { parsePdfBuffer } from "@/lib/parsers/pdf-parser";
import { classifyTransactionsPipeline } from "@/lib/categorizer/engine";
import { computeTransactionDedupHash } from "@/lib/utils";

interface ProcessedFileInfo {
  filename: string;
  fileType: "ofx" | "csv" | "pdf";
  fileHash: string;
  detectedBank: string;
  totalRows: number;
}

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const formData = await req.formData();
    
    // Suporte tanto para envio de múltiplos arquivos ("files") quanto arquivo único ("file")
    let files = (formData.getAll("files") as File[]).filter((f) => f && typeof f.name === "string" && f.name.length > 0);
    if (files.length === 0) {
      const singleFile = formData.get("file") as File | null;
      if (singleFile && singleFile.name) {
        files = [singleFile];
      }
    }

    const accountId = (formData.get("accountId") as string | null) || "preview_account";
    const customMappingRaw = formData.get("csvMapping") as string | null;
    const isCreditCardBill = formData.get("isCreditCardBill") === "true";

    if (files.length === 0) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    const processedFiles: ProcessedFileInfo[] = [];
    const combinedRawTransactions: Array<
      ParsedRawTransaction & { sourceFilename: string; fileIndex: number }
    > = [];
    let overallDetectedBank = "other";
    let primaryCsvMeta: {
      headers: string[];
      sampleRows: Record<string, string>[];
      detectedPresetName: string | null;
      mapping: CsvColumnMapping;
    } | null = null;

    for (let fileIdx = 0; fileIdx < files.length; fileIdx++) {
      const file = files[fileIdx];
      const filename = file.name;
      const ext = filename.split(".").pop()?.toLowerCase() || "";
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const fileHash = crypto.createHash("sha256").update(buffer).digest("hex");

      let fileType: "ofx" | "csv" | "pdf" = "csv";
      let detectedBank = "other";
      let rawTransactions: ParsedRawTransaction[] = [];

      if (ext === "ofx" || ext === "qfx" || filename.toLowerCase().includes(".ofx")) {
        fileType = "ofx";
        // Decodifica tentando UTF-8; se houver muitos caracteres de substituição, usa Latin1
        let text = buffer.toString("utf-8");
        if (text.includes("\uFFFD")) {
          text = buffer.toString("latin1");
        }
        const parsed = parseOfxContent(text);
        detectedBank = parsed.detectedBank;
        rawTransactions = parsed.transactions;
      } else if (ext === "pdf") {
        fileType = "pdf";
        const parsed = await parsePdfBuffer(new Uint8Array(arrayBuffer), { isCreditCardBill });
        detectedBank = parsed.detectedBank;
        rawTransactions = parsed.transactions;
      } else {
        fileType = "csv";
        let text = buffer.toString("utf-8");
        if (text.includes("\uFFFD")) {
          text = buffer.toString("latin1");
        }
        const inspected = inspectCsvContent(text);
        detectedBank = inspected.detectedBank;

        let activeMapping = inspected.suggestedMapping;
        if (customMappingRaw) {
          try {
            activeMapping = { ...activeMapping, ...JSON.parse(customMappingRaw) };
          } catch {
            // Usa mapeamento sugerido
          }
        }

        rawTransactions = extractTransactionsFromCsv(inspected.rows, activeMapping);
        if (!primaryCsvMeta) {
          primaryCsvMeta = {
            headers: inspected.headers,
            sampleRows: inspected.sampleRows,
            detectedPresetName: inspected.detectedPresetName,
            mapping: activeMapping,
          };
        }
      }

      if (overallDetectedBank === "other" && detectedBank !== "other") {
        overallDetectedBank = detectedBank;
      }

      processedFiles.push({
        filename,
        fileType,
        fileHash,
        detectedBank,
        totalRows: rawTransactions.length,
      });

      for (const t of rawTransactions) {
        combinedRawTransactions.push({
          ...t,
          sourceFilename: filename,
          fileIndex: fileIdx,
        });
      }
    }

    // Classifica todas as transações pelo pipeline de 3 camadas
    const classifications = await classifyTransactionsPipeline(
      combinedRawTransactions.map((t) => ({
        rawDescription: t.rawDescription,
        amountCents: t.amountCents,
        originalCategoryHint: t.originalCategoryHint,
      }))
    );

    // Verifica hashes já existentes no banco para a conta selecionada
    const existingHashesSet = new Set<string>();
    if (accountId && accountId !== "preview_account") {
      const existingRows = sqlite
        .prepare("SELECT dedup_hash as dedupHash FROM transactions WHERE account_id = ?")
        .all(accountId) as Array<{ dedupHash: string }>;
      for (const r of existingRows) {
        existingHashesSet.add(r.dedupHash);
      }
    }

    // Contador de ocorrência idêntica para permitir 2 compras iguais legítimas no mesmo dia
    const sequenceTracker = new Map<string, number>();

    const previewItems = combinedRawTransactions.map((raw, idx) => {
      const cls = classifications[idx];
      const seqKey = `${raw.date}|${raw.amountCents}|${raw.rawDescription.toUpperCase().trim()}`;
      const seqCount = sequenceTracker.get(seqKey) || 0;
      sequenceTracker.set(seqKey, seqCount + 1);

      const dedupHash = computeTransactionDedupHash({
        accountId,
        date: raw.date,
        amountCents: raw.amountCents,
        rawDescription: raw.rawDescription,
        externalId: raw.externalId,
        sequenceInFile: seqCount,
      });

      const isDuplicate = existingHashesSet.has(dedupHash);
      if (!isDuplicate) {
        existingHashesSet.add(dedupHash);
      }

      return {
        tempId: `row_${idx}`,
        date: raw.date,
        rawDescription: raw.rawDescription,
        cleanDescription: cls.cleanDescription,
        merchantName: cls.merchantName,
        amountCents: raw.amountCents,
        categoryId: cls.categoryId,
        categoryName: cls.categoryName || null,
        classificationSource: cls.source,
        confidence: cls.confidence,
        installmentCurrent: cls.installmentCurrent,
        installmentTotal: cls.installmentTotal,
        externalId: raw.externalId,
        dedupHash,
        isDuplicate,
        sourceFilename: raw.sourceFilename,
        fileIndex: raw.fileIndex,
      };
    });

    // Ordena por data decrescente (mais recente primeiro)
    previewItems.sort((a, b) => b.date.localeCompare(a.date));

    const newCount = previewItems.filter((i) => !i.isDuplicate).length;
    const duplicateCount = previewItems.filter((i) => i.isDuplicate).length;
    const categorizedCount = previewItems.filter((i) => i.categoryId !== null).length;

    const mainFilename =
      processedFiles.length === 1
        ? processedFiles[0].filename
        : `${processedFiles.length} arquivos (${processedFiles.map((f) => f.filename).join(", ")})`;

    const mainFileType =
      processedFiles.length === 1
        ? processedFiles[0].fileType
        : processedFiles.every((f) => f.fileType === "ofx")
          ? "ofx"
          : "mixed";

    return NextResponse.json({
      files: processedFiles,
      filename: mainFilename,
      fileType: mainFileType,
      fileHash: processedFiles[0]?.fileHash || "",
      detectedBank: overallDetectedBank,
      csvMeta: primaryCsvMeta,
      summary: {
        totalRows: previewItems.length,
        newCount,
        duplicateCount,
        categorizedCount,
        uncategorizedCount: previewItems.length - categorizedCount,
        filesCount: processedFiles.length,
      },
      items: previewItems,
    });
  } catch (error) {
    console.error("[Import Preview Error]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Falha ao processar o(s) arquivo(s) bancário(s).",
      },
      { status: 500 }
    );
  }
}
