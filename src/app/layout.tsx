import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PrivacyProvider } from "@/components/providers/privacy-provider";

export const metadata: Metadata = {
  title: "Aurora Finance — Inteligência Financeira Local-First",
  description:
    "Painel open-source de gestão financeira pessoal, importação de extratos (OFX, CSV, PDF) e análise inteligente de gastos por categoria rodando 100% localmente em SQLite.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="bg-[#060913] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200">
        <PrivacyProvider>
          <div className="flex min-h-screen aurora-ambient-bg">
            <AppSidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
          </div>
        </PrivacyProvider>
      </body>
    </html>
  );
}

