import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { sqlite, ensureDatabaseInitialized, DB_FILE_PATH } from "@/db";

export async function GET(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "sqlite";
    const dateSlug = new Date().toISOString().slice(0, 10);

    if (format === "json") {
      const accounts = sqlite.prepare("SELECT * FROM accounts").all();
      const categories = sqlite.prepare("SELECT * FROM categories").all();
      const transactions = sqlite.prepare("SELECT * FROM transactions ORDER BY date DESC").all();
      const rules = sqlite.prepare("SELECT * FROM categorization_rules").all();

      const payload = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          app: "Aurora Finance",
          accounts,
          categories,
          transactions,
          rules,
        },
        null,
        2
      );

      return new NextResponse(payload, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="aurora-finance-${dateSlug}.json"`,
        },
      });
    }

    // Faz checkpoint do WAL para garantir que todo o estado esteja consolidado no arquivo .db
    sqlite.exec("PRAGMA wal_checkpoint(FULL);");
    const dbBuffer = fs.readFileSync(DB_FILE_PATH);

    return new NextResponse(dbBuffer, {
      headers: {
        "Content-Type": "application/x-sqlite3",
        "Content-Disposition": `attachment; filename="aurora-backup-${dateSlug}.db"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao gerar backup." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();
    const settings: Record<string, string> = body.settings || {};
    const now = new Date().toISOString();

    const upsert = sqlite.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    );

    for (const [k, v] of Object.entries(settings)) {
      upsert.run(k, String(v ?? ""), now);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao salvar configurações." },
      { status: 500 }
    );
  }
}
