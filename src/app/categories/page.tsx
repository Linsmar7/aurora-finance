import React from "react";
import { getRulesAndCategories } from "@/lib/finance/queries";
import { CategoriesClient } from "@/components/categories/categories-client";

export const dynamic = "force-dynamic";

export default function CategoriesPage() {
  const { categories, rules } = getRulesAndCategories();
  return <CategoriesClient categories={categories} rules={rules} />;
}

