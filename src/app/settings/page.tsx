import React from "react";
import { getDashboardData, getRulesAndCategories } from "@/lib/finance/queries";
import { SettingsClient } from "@/components/settings/settings-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { accounts } = getDashboardData();
  const { settings } = getRulesAndCategories();

  return <SettingsClient accounts={accounts} settings={settings} />;
}

