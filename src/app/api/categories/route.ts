import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sqlite, ensureDatabaseInitialized } from "@/db";

export async function POST(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();
    const name: string = (body.name || "").trim();
    const type: string = body.type || "expense";
    const color: string = body.color || "#22D3EE";
    const icon: string = body.icon || "Tag";
    const monthlyBudgetCents: number | null =
      body.monthlyBudgetCents !== undefined && body.monthlyBudgetCents !== null && body.monthlyBudgetCents !== ""
        ? Number(body.monthlyBudgetCents)
        : null;

    if (!name) {
      return NextResponse.json({ error: "Nome da categoria é obrigatório." }, { status: 400 });
    }

    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const id = `cat_${slug}_${crypto.randomUUID().slice(0, 4)}`;

    sqlite
      .prepare(
        `INSERT INTO categories (id, parent_id, name, slug, type, icon, color, monthly_budget_cents, is_system, sort_order)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 0, 50)`
      )
      .run(id, name, slug, type, icon, color, monthlyBudgetCents);

    return NextResponse.json({ success: true, id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao criar categoria." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    ensureDatabaseInitialized();
    const body = await req.json();
    const id: string = body.id;
    if (!id) {
      return NextResponse.json({ error: "ID da categoria é obrigatório." }, { status: 400 });
    }

    if (body.monthlyBudgetCents !== undefined) {
      const budget =
        body.monthlyBudgetCents === null || body.monthlyBudgetCents === 0
          ? null
          : Number(body.monthlyBudgetCents);
      sqlite
        .prepare("UPDATE categories SET monthly_budget_cents = ? WHERE id = ?")
        .run(budget, id);
    }

    if (body.name && body.color) {
      sqlite
        .prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?")
        .run(String(body.name).trim(), String(body.color), id);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao atualizar categoria." },
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
      return NextResponse.json({ error: "ID não informado." }, { status: 400 });
    }

    sqlite.prepare("UPDATE transactions SET category_id = NULL WHERE category_id = ?").run(id);
    sqlite.prepare("DELETE FROM categories WHERE id = ?").run(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao excluir categoria." },
      { status: 500 }
    );
  }
}
