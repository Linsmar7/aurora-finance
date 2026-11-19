import { sqlite, ensureDatabaseInitialized } from "@/db";
import type { Account, Category, CategorizationRule, ImportBatch } from "@/db/schema";

export interface CategoryExpenseBreakdownItem {
  categoryId: string;
  name: string;
  icon: string;
  color: string;
  monthlyBudgetCents: number | null;
  totalExpenseCents: number; // valor absoluto em centavos (ex: 150000 = R$ 1.500,00)
  percentageOfTotal: number; // 0 a 100
  transactionCount: number;
  averageTicketCents: number;
  budgetUsagePercent: number | null;
  topMerchants: Array<{ name: string; totalCents: number; count: number }>;
  transactions: Array<{
    id: string;
    date: string;
    cleanDescription: string;
    rawDescription: string;
    merchantName: string | null;
    amountCents: number;
    accountName: string;
    accountColor: string;
    installmentCurrent: number | null;
    installmentTotal: number | null;
  }>;
}

export interface MonthlyFlowItem {
  yearMonth: string; // YYYY-MM
  label: string; // Ex: "Out/26"
  incomeCents: number;
  expenseCents: number;
  netCents: number;
}

export interface AccountWithBalance extends Account {
  currentBalanceCents: number;
  transactionCount: number;
}

export interface DashboardData {
  selectedMonth: string; // "all" ou "YYYY-MM"
  selectedAccountId: string; // "all" ou account.id
  availableMonths: string[];
  accounts: AccountWithBalance[];
  categories: Category[];
  kpis: {
    incomeCents: number;
    expenseCents: number;
    netCents: number;
    savingsRate: number;
    totalBalanceCents: number;
    transactionCount: number;
    uncategorizedCount: number;
  };
  expensesByCategory: CategoryExpenseBreakdownItem[];
  incomesByCategory: Array<{
    categoryId: string;
    name: string;
    color: string;
    totalIncomeCents: number;
    percentage: number;
    transactionCount: number;
  }>;
  monthlyEvolution: MonthlyFlowItem[];
  topMerchants: Array<{
    merchantName: string;
    categoryName: string;
    categoryColor: string;
    totalExpenseCents: number;
    transactionCount: number;
    percentageOfExpenses: number;
  }>;
}

export function getDashboardData(params?: {
  month?: string;
  accountId?: string;
}): DashboardData {
  ensureDatabaseInitialized();

  const accountsRows = sqlite
    .prepare(
      `SELECT
        a.id,
        a.name,
        a.institution,
        a.type,
        a.initial_balance_cents as initialBalanceCents,
        a.color,
        a.closing_day as closingDay,
        a.due_day as dueDay,
        a.is_archived as isArchived,
        a.created_at as createdAt,
        COALESCE(SUM(CASE WHEN t.is_ignored = 0 THEN t.amount_cents ELSE 0 END), 0) as txSumCents,
        COUNT(t.id) as txCount
       FROM accounts a
       LEFT JOIN transactions t ON t.account_id = a.id
       WHERE a.is_archived = 0
       GROUP BY a.id
       ORDER BY a.created_at ASC`
    )
    .all() as Array<Account & { txSumCents: number; txCount: number }>;

  const accounts: AccountWithBalance[] = accountsRows.map((a) => ({
    ...a,
    currentBalanceCents: Number(a.initialBalanceCents || 0) + Number(a.txSumCents || 0),
    transactionCount: Number(a.txCount || 0),
  }));

  const categories = sqlite
    .prepare(
      `SELECT
        id,
        parent_id as parentId,
        name,
        slug,
        type,
        icon,
        color,
        monthly_budget_cents as monthlyBudgetCents,
        is_system as isSystem,
        sort_order as sortOrder
       FROM categories
       ORDER BY sort_order ASC, name ASC`
    )
    .all() as unknown as Category[];

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const monthsRows = sqlite
    .prepare(
      `SELECT DISTINCT substr(date, 1, 7) as ym
       FROM transactions
       WHERE date IS NOT NULL AND length(date) >= 7
       ORDER BY ym DESC`
    )
    .all() as Array<{ ym: string }>;

  const availableMonths = monthsRows.map((r) => r.ym).filter(Boolean);

  // Se o usuário não especificou mês, seleciona o mês mais recente com dados ou "all"
  const selectedMonth =
    params?.month && (params.month === "all" || availableMonths.includes(params.month))
      ? params.month
      : availableMonths[0] || "all";

  const selectedAccountId = params?.accountId || "all";

  // Monta filtro SQL dinâmico
  const whereClauses: string[] = ["t.is_ignored = 0"];
  const sqlParams: (string | number)[] = [];

  if (selectedMonth !== "all") {
    whereClauses.push("substr(t.date, 1, 7) = ?");
    sqlParams.push(selectedMonth);
  }

  if (selectedAccountId !== "all") {
    whereClauses.push("t.account_id = ?");
    sqlParams.push(selectedAccountId);
  }

  const whereSql = whereClauses.join(" AND ");

  const periodTransactions = sqlite
    .prepare(
      `SELECT
        t.id,
        t.account_id as accountId,
        t.category_id as categoryId,
        t.date,
        t.amount_cents as amountCents,
        t.type,
        t.raw_description as rawDescription,
        t.clean_description as cleanDescription,
        t.merchant_name as merchantName,
        t.installment_current as installmentCurrent,
        t.installment_total as installmentTotal,
        t.classification_source as classificationSource,
        a.name as accountName,
        a.color as accountColor
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE ${whereSql}
       ORDER BY t.date DESC, t.created_at DESC`
    )
    .all(...sqlParams) as Array<{
    id: string;
    accountId: string;
    categoryId: string | null;
    date: string;
    amountCents: number;
    type: string;
    rawDescription: string;
    cleanDescription: string;
    merchantName: string | null;
    installmentCurrent: number | null;
    installmentTotal: number | null;
    classificationSource: string;
    accountName: string;
    accountColor: string;
  }>;

  let incomeCents = 0;
  let expenseCents = 0;
  let uncategorizedCount = 0;

  const expenseGroups = new Map<
    string,
    {
      category: Category;
      totalExpenseCents: number;
      transactions: CategoryExpenseBreakdownItem["transactions"];
      merchantsMap: Map<string, { totalCents: number; count: number }>;
    }
  >();

  const incomeGroups = new Map<
    string,
    { category: Category; totalIncomeCents: number; count: number }
  >();

  const globalMerchantsMap = new Map<
    string,
    {
      merchantName: string;
      categoryName: string;
      categoryColor: string;
      totalExpenseCents: number;
      transactionCount: number;
    }
  >();

  for (const tx of periodTransactions) {
    const cat = tx.categoryId ? categoryMap.get(tx.categoryId) : undefined;

    if (!tx.categoryId) {
      uncategorizedCount++;
    }

    // Ignora transferências neutras/pagamento de fatura no cálculo de Receita vs Despesa
    if (cat?.type === "transfer" || tx.type === "transfer") {
      continue;
    }

    if (tx.amountCents > 0) {
      incomeCents += tx.amountCents;
      const incCat: Category = cat || {
        id: "uncategorized_income",
        parentId: null,
        name: "Receitas Sem Categoria",
        slug: "sem-categoria-receita",
        type: "income",
        icon: "HelpCircle",
        color: "#34D399",
        monthlyBudgetCents: null,
        isSystem: 1,
        sortOrder: 999,
      };
      const existing = incomeGroups.get(incCat.id) || {
        category: incCat,
        totalIncomeCents: 0,
        count: 0,
      };
      existing.totalIncomeCents += tx.amountCents;
      existing.count += 1;
      incomeGroups.set(incCat.id, existing);
    } else if (tx.amountCents < 0) {
      const absExpense = Math.abs(tx.amountCents);
      expenseCents += absExpense;

      const expCat: Category = cat || {
        id: "uncategorized",
        parentId: null,
        name: "Sem Categoria (Para Revisar)",
        slug: "sem-categoria",
        type: "expense",
        icon: "AlertCircle",
        color: "#F59E0B",
        monthlyBudgetCents: null,
        isSystem: 1,
        sortOrder: 999,
      };

      const group = expenseGroups.get(expCat.id) || {
        category: expCat,
        totalExpenseCents: 0,
        transactions: [] as CategoryExpenseBreakdownItem["transactions"],
        merchantsMap: new Map<string, { totalCents: number; count: number }>(),
      };

      group.totalExpenseCents += absExpense;
      group.transactions.push({
        id: tx.id,
        date: tx.date,
        cleanDescription: tx.cleanDescription,
        rawDescription: tx.rawDescription,
        merchantName: tx.merchantName,
        amountCents: tx.amountCents,
        accountName: tx.accountName,
        accountColor: tx.accountColor,
        installmentCurrent: tx.installmentCurrent,
        installmentTotal: tx.installmentTotal,
      });

      const mName = tx.merchantName || tx.cleanDescription;
      const mStats = group.merchantsMap.get(mName) || { totalCents: 0, count: 0 };
      mStats.totalCents += absExpense;
      mStats.count += 1;
      group.merchantsMap.set(mName, mStats);

      expenseGroups.set(expCat.id, group);

      // Top Merchants global
      const gm = globalMerchantsMap.get(mName) || {
        merchantName: mName,
        categoryName: expCat.name,
        categoryColor: expCat.color,
        totalExpenseCents: 0,
        transactionCount: 0,
      };
      gm.totalExpenseCents += absExpense;
      gm.transactionCount += 1;
      globalMerchantsMap.set(mName, gm);
    }
  }

  const expensesByCategory: CategoryExpenseBreakdownItem[] = Array.from(expenseGroups.values())
    .sort((a, b) => b.totalExpenseCents - a.totalExpenseCents)
    .map((g) => {
      const count = g.transactions.length;
      const percentageOfTotal =
        expenseCents > 0 ? Number(((g.totalExpenseCents / expenseCents) * 100).toFixed(1)) : 0;
      const budget = g.category.monthlyBudgetCents;
      const budgetUsagePercent =
        budget && budget > 0
          ? Number(((g.totalExpenseCents / budget) * 100).toFixed(1))
          : null;

      const topMerchants = Array.from(g.merchantsMap.entries())
        .map(([name, st]) => ({ name, totalCents: st.totalCents, count: st.count }))
        .sort((a, b) => b.totalCents - a.totalCents)
        .slice(0, 4);

      return {
        categoryId: g.category.id,
        name: g.category.name,
        icon: g.category.icon,
        color: g.category.color,
        monthlyBudgetCents: budget,
        totalExpenseCents: g.totalExpenseCents,
        percentageOfTotal,
        transactionCount: count,
        averageTicketCents: count > 0 ? Math.round(g.totalExpenseCents / count) : 0,
        budgetUsagePercent,
        topMerchants,
        transactions: g.transactions.slice(0, 25),
      };
    });

  const incomesByCategory = Array.from(incomeGroups.values())
    .sort((a, b) => b.totalIncomeCents - a.totalIncomeCents)
    .map((g) => ({
      categoryId: g.category.id,
      name: g.category.name,
      color: g.category.color,
      totalIncomeCents: g.totalIncomeCents,
      percentage:
        incomeCents > 0 ? Number(((g.totalIncomeCents / incomeCents) * 100).toFixed(1)) : 0,
      transactionCount: g.count,
    }));

  // Evolução mensal (últimos 12 meses registrados)
  const accountFilterSql = selectedAccountId !== "all" ? "AND t.account_id = ?" : "";
  const accountFilterParams = selectedAccountId !== "all" ? [selectedAccountId] : [];

  const monthlyRows = sqlite
    .prepare(
      `SELECT
        substr(t.date, 1, 7) as ym,
        SUM(CASE WHEN t.amount_cents > 0 AND COALESCE(c.type, t.type) != 'transfer' THEN t.amount_cents ELSE 0 END) as inc,
        SUM(CASE WHEN t.amount_cents < 0 AND COALESCE(c.type, t.type) != 'transfer' THEN ABS(t.amount_cents) ELSE 0 END) as exp
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.is_ignored = 0 ${accountFilterSql}
       GROUP BY ym
       ORDER BY ym ASC
       LIMIT 12`
    )
    .all(...accountFilterParams) as Array<{ ym: string; inc: number; exp: number }>;

  const shortMonths = [
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  const monthlyEvolution: MonthlyFlowItem[] = monthlyRows.map((r) => {
    const [y, m] = r.ym.split("-").map(Number);
    const label = m >= 1 && m <= 12 ? `${shortMonths[m - 1]}/${String(y).slice(-2)}` : r.ym;
    const inc = Number(r.inc || 0);
    const exp = Number(r.exp || 0);
    return {
      yearMonth: r.ym,
      label,
      incomeCents: inc,
      expenseCents: exp,
      netCents: inc - exp,
    };
  });

  const topMerchants = Array.from(globalMerchantsMap.values())
    .sort((a, b) => b.totalExpenseCents - a.totalExpenseCents)
    .slice(0, 8)
    .map((m) => ({
      ...m,
      percentageOfExpenses:
        expenseCents > 0 ? Number(((m.totalExpenseCents / expenseCents) * 100).toFixed(1)) : 0,
    }));

  const netCents = incomeCents - expenseCents;
  const savingsRate =
    incomeCents > 0 ? Number(((netCents / incomeCents) * 100).toFixed(1)) : 0;

  const totalBalanceCents =
    selectedAccountId === "all"
      ? accounts.reduce((acc, a) => acc + a.currentBalanceCents, 0)
      : accounts.find((a) => a.id === selectedAccountId)?.currentBalanceCents ?? 0;

  return {
    selectedMonth,
    selectedAccountId,
    availableMonths,
    accounts,
    categories,
    kpis: {
      incomeCents,
      expenseCents,
      netCents,
      savingsRate,
      totalBalanceCents,
      transactionCount: periodTransactions.length,
      uncategorizedCount,
    },
    expensesByCategory,
    incomesByCategory,
    monthlyEvolution,
    topMerchants,
  };
}

export interface TransactionsFilterParams {
  month?: string;
  accountId?: string;
  categoryId?: string;
  search?: string;
  onlyUncategorized?: boolean;
}

export function getFilteredTransactions(params: TransactionsFilterParams) {
  ensureDatabaseInitialized();

  const whereClauses: string[] = ["1 = 1"];
  const sqlParams: (string | number)[] = [];

  if (params.month && params.month !== "all") {
    whereClauses.push("substr(t.date, 1, 7) = ?");
    sqlParams.push(params.month);
  }

  if (params.accountId && params.accountId !== "all") {
    whereClauses.push("t.account_id = ?");
    sqlParams.push(params.accountId);
  }

  if (params.onlyUncategorized || params.categoryId === "uncategorized") {
    whereClauses.push("t.category_id IS NULL");
  } else if (params.categoryId && params.categoryId !== "all") {
    whereClauses.push("t.category_id = ?");
    sqlParams.push(params.categoryId);
  }

  if (params.search && params.search.trim()) {
    whereClauses.push(
      "(UPPER(t.clean_description) LIKE ? OR UPPER(t.raw_description) LIKE ? OR UPPER(COALESCE(t.merchant_name, '')) LIKE ?)"
    );
    const q = `%${params.search.trim().toUpperCase()}%`;
    sqlParams.push(q, q, q);
  }

  const rows = sqlite
    .prepare(
      `SELECT
        t.id,
        t.account_id as accountId,
        t.category_id as categoryId,
        t.date,
        t.amount_cents as amountCents,
        t.type,
        t.raw_description as rawDescription,
        t.clean_description as cleanDescription,
        t.merchant_name as merchantName,
        t.installment_current as installmentCurrent,
        t.installment_total as installmentTotal,
        t.classification_source as classificationSource,
        t.confidence_score as confidenceScore,
        t.is_reviewed as isReviewed,
        t.is_ignored as isIgnored,
        a.name as accountName,
        a.institution as accountInstitution,
        a.color as accountColor,
        c.name as categoryName,
        c.color as categoryColor,
        c.icon as categoryIcon
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE ${whereClauses.join(" AND ")}
       ORDER BY t.date DESC, t.created_at DESC
       LIMIT 1000`
    )
    .all(...sqlParams) as Array<{
    id: string;
    accountId: string;
    categoryId: string | null;
    date: string;
    amountCents: number;
    type: string;
    rawDescription: string;
    cleanDescription: string;
    merchantName: string | null;
    installmentCurrent: number | null;
    installmentTotal: number | null;
    classificationSource: string;
    confidenceScore: number;
    isReviewed: number;
    isIgnored: number;
    accountName: string;
    accountInstitution: string;
    accountColor: string;
    categoryName: string | null;
    categoryColor: string | null;
    categoryIcon: string | null;
  }>;

  return rows;
}

export function getImportBatchesHistory(): Array<ImportBatch & { accountName: string }> {
  ensureDatabaseInitialized();
  return sqlite
    .prepare(
      `SELECT
        b.id,
        b.account_id as accountId,
        b.filename,
        b.file_type as fileType,
        b.file_hash as fileHash,
        b.total_rows as totalRows,
        b.imported_count as importedCount,
        b.duplicate_count as duplicateCount,
        b.created_at as createdAt,
        a.name as accountName
       FROM import_batches b
       JOIN accounts a ON a.id = b.account_id
       ORDER BY b.created_at DESC
       LIMIT 30`
    )
    .all() as Array<ImportBatch & { accountName: string }>;
}

export function getRulesAndCategories() {
  ensureDatabaseInitialized();
  const categories = sqlite
    .prepare(
      `SELECT
        id,
        parent_id as parentId,
        name,
        slug,
        type,
        icon,
        color,
        monthly_budget_cents as monthlyBudgetCents,
        is_system as isSystem,
        sort_order as sortOrder
       FROM categories
       ORDER BY sort_order ASC, name ASC`
    )
    .all() as unknown as Category[];

  const rules = sqlite
    .prepare(
      `SELECT
        r.id,
        r.name,
        r.match_type as matchType,
        r.pattern,
        r.min_amount_cents as minAmountCents,
        r.max_amount_cents as maxAmountCents,
        r.target_category_id as targetCategoryId,
        r.target_merchant_name as targetMerchantName,
        r.priority,
        r.is_active as isActive,
        r.hit_count as hitCount,
        r.created_at as createdAt,
        c.name as categoryName,
        c.color as categoryColor
       FROM categorization_rules r
       JOIN categories c ON c.id = r.target_category_id
       ORDER BY r.priority ASC, r.name ASC`
    )
    .all() as Array<CategorizationRule & { categoryName: string; categoryColor: string }>;

  const settingsRows = sqlite.prepare("SELECT key, value FROM app_settings").all() as Array<{
    key: string;
    value: string;
  }>;
  const settings = Object.fromEntries(settingsRows.map((s) => [s.key, s.value]));

  return { categories, rules, settings };
}
