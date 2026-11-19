# 🌌 Aurora Finance

**Aurora Finance** é uma plataforma web **Open Source** e **Local-First** para organização e análise inteligente de finanças pessoais, inspirada na clareza visual do *Visor Finance*, construída com uma identidade visual **Aurora Boreal** e banco de dados **SQLite 100% local**.

## ✨ Principais Recursos

- **📊 Gastos Separados por Categoria (Visor Style)**:
  - Gráfico Donut interativo + Barra de distribuição proporcional (`100%`).
  - Ranking detalhado de categorias com percentual sobre o total de despesas, ticket médio, quantidade de lançamentos, meta de orçamento mensal e *top estabelecimentos*.
  - *Drill-down* interativo: clique em qualquer categoria para inspecionar e reclassificar seus lançamentos diretamente no painel.
- **📥 Importação Universal de Arquivos Bancários**:
  - **OFX / QFX**: Suporte universal com deduplicação idempotente via `FITID` + hash `SHA-256`.
  - **CSV**: Presets prontos para bancos brasileiros (*Nubank*, *Banco Inter*, *Itaú*, *Bradesco*, *Banco do Brasil*, *C6 Bank*) + **Mapeador Visual Dinâmico de Colunas** para qualquer planilha.
  - **PDF**: Extração local de texto de faturas de cartão e extratos em PDF.
  - **Rollback em 1 Clique**: Desfaça qualquer lote de importação caso necessário.
- **🧠 Categorização Inteligente Híbrida (3 Camadas)**:
  1. **Sanitizador & Regras Determinísticas (`Regex` / `Contains`)**: Limpa ruídos bancários, identifica parcelas (`02/10`) e classifica instantaneamente estabelecimentos conhecidos.
  2. **Memória Histórica Local & Similaridade**: Aprende com suas decisões anteriores usando similaridade de bigramas.
  3. **IA Opcional (Ollama Local ou BYOK Gemini/OpenAI)**: Classificação em lote de estabelecimentos inéditos com anonimização automática de CPF/CNPJ.
- **🔒 100% Local & Privado**:
  - Nenhum dado financeiro sai da sua máquina. Todo o estado fica salvo em `./data/aurora.db` (SQLite em modo WAL) com backup instantâneo em `.db` ou `.json`.

## 🚀 Como Executar Localmente

```bash
git clone https://github.com/Linsmar7/aurora-finance.git
cd aurora-finance
npm install
npm run dev
```

Acesse `http://localhost:3000` no navegador. O banco SQLite (`./data/aurora.db`) e as categorias/regras padrão são inicializados automaticamente na primeira execução.

