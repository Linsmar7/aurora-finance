import React from "react";
import { getDashboardData } from "@/lib/finance/queries";
import { DashboardClient } from "@/components/dashboard/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; accountId?: string }>;
}) {
  const params = await searchParams;
  const data = getDashboardData({
    month: params.month,
    accountId: params.accountId,
  });

  return <DashboardClient data={data} />;
}

