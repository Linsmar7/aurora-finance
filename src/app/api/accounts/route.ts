import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";
import { INSTITUTIONS } from "@/lib/utils";

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();
    const name = (body.name || "").trim();
    const institution = body.institution || "other";
    const type = body.type || "checking";
    const initialBalanceCents = Number(body.initialBalanceCents || 0);
    const color = body.color || INSTITUTIONS[institution]?.color || "#22D3EE";

    if (!name) {
      return NextResponse.json({ error: "Nome da conta é obrigatório." }, { status: 400 });
    }

    const id = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    sqlite
      .prepare(
        `INSERT INTO accounts (id, name, institution, type, initial_balance_cents, color, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, name, institution, type, initialBalanceCents, color, now);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar conta." },
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
      return NextResponse.json({ error: "ID da conta não informado." }, { status: 400 });
    }

    sqlite.prepare("DELETE FROM transactions WHERE account_id = ?").run(id);
    sqlite.prepare("DELETE FROM import_batches WHERE account_id = ?").run(id);
    sqlite.prepare("DELETE FROM accounts WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao remover conta." },
      { status: 500 }
    );
  }
}
