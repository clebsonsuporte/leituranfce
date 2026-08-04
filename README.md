# Fiscal Dashboard

Sistema completo de gestão fiscal para NF-e e NFC-e brasileiras.

## Requisitos

- Node.js 20+
- npm 7+
- PostgreSQL 15+

## Quick Start

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp apps/backend/.env.example apps/backend/.env
# Edite apps/backend/.env com suas credenciais do PostgreSQL
```

Arquivo `apps/backend/.env`:
```
DATABASE_URL="postgresql://postgres:senha@localhost:5432/fiscal_dashboard"
JWT_SECRET="troque-por-um-segredo-forte-aqui"
JWT_REFRESH_SECRET="troque-por-outro-segredo-forte"
PORT=3001
NODE_ENV=development
```

### 3. Configurar banco de dados

```bash
cd apps/backend
npm run db:push      # Cria as tabelas diretamente
# Ou para migrations versionadas:
npm run db:migrate
cd ../..
```

### 4. Iniciar em desenvolvimento

```bash
# Na raiz do projeto (inicia backend + frontend juntos):
npm run dev
```

- **Backend**: http://localhost:3001
- **Frontend**: http://localhost:5173
- **Prisma Studio**: `cd apps/backend && pnpm db:studio`

## Captura automática de XMLs pelo Google Drive

O sistema pode monitorar uma pasta do Google Drive (mesma estrutura do dashboard antigo: uma subpasta por cliente) e importar XMLs novos automaticamente, sem upload manual. Isso usa uma **conta de serviço** do Google — não pede login do usuário.

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto (ou use um existente).
2. Ative a **Google Drive API**: [console.cloud.google.com/apis/library/drive.googleapis.com](https://console.cloud.google.com/apis/library/drive.googleapis.com).
3. Crie uma conta de serviço em **IAM e administrador → Contas de serviço → Criar conta de serviço**. Não precisa conceder papéis de projeto.
4. Na conta de serviço criada, aba **Chaves → Adicionar chave → Criar nova chave → JSON**. Isso baixa um arquivo `.json` — guarde-o **fora do repositório**, por exemplo em `~/.secrets/fiscal-dashboard/gdrive-service-account.json`.
5. Copie o **e-mail da conta de serviço** (algo como `nome@projeto.iam.gserviceaccount.com`).
6. No Google Drive, abra a pasta "XML-Clientes" → **Compartilhar** → cole o e-mail da conta de serviço → papel **Leitor**.
7. Em `apps/backend/.env`, defina:
   ```
   GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY_PATH="/caminho/completo/para/gdrive-service-account.json"
   GOOGLE_DRIVE_ROOT_FOLDER_ID="id-da-pasta-XML-Clientes"
   ```
   (o ID da pasta é o trecho final da URL: `drive.google.com/drive/folders/<ID>`)
8. Reinicie o backend e ative o monitoramento na tela de Importação (card "Google Drive").

## Credenciais padrão

- **Email**: admin@fiscal.com
- **Senha**: Admin@123

## Estrutura

```
fiscal-dashboard/
├── apps/
│   ├── backend/        # Fastify + Prisma + PostgreSQL
│   └── frontend/       # React + Vite + Tailwind
└── packages/           # Shared packages (futuro)
```

## Funcionalidades

- Importação de XMLs de NF-e e NFC-e (arrastar e soltar)
- Dashboard com KPIs fiscais e gráficos interativos
- Gestão de empresas e usuários
- Análise de produtos por NCM/CFOP
- Relatórios em PDF, Excel e CSV
- Alertas automáticos (sequência, divergências, duplicatas)
- Filtros globais por empresa e competência
