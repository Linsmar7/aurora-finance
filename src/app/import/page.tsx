import React from "react";
import { getDashboardData, getImportBatchesHistory } from "@/lib/finance/queries";
import { ImportClient } from "@/components/import/import-client";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  const { accounts, categories } = getDashboardData();
  const batches = getImportBatchesHistory();

  return (
    <ImportClient
      accounts={accounts}
      categories={categories}
      batches={batches}
    />
  );
}

