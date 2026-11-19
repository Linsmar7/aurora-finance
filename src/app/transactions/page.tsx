import React from "react";
import { getDashboardData, getFilteredTransactions } from "@/lib/finance/queries";
import { TransactionsClient } from "@/components/transactions/transactions-client";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    accountId?: string;
    categoryId?: string;
    search?: string;
    onlyUncategorized?: string;
  }>;
}) {
  const params = await searchParams;
  const dash = getDashboardData();

  const filters = {
    month: params.month || "all",
    accountId: params.accountId || "all",
    categoryId: params.categoryId || "all",
    search: params.search || "",
    onlyUncategorized: params.onlyUncategorized === "true",
  };

  const transactions = getFilteredTransactions(filters);

  return (
    <TransactionsClient
      transactions={transactions}
      accounts={dash.accounts}
      categories={dash.categories}
      availableMonths={dash.availableMonths}
      filters={filters}
    />
  );
}

