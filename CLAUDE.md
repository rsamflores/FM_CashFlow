@AGENTS.md

# FM-CashFlow — Contexto del proyecto

## Stack
- Next.js 15 App Router + TypeScript + **Tailwind v4** (`@theme` en CSS, NO utility classes dinámicas → usar `style={{}}`)
- Supabase Postgres + RLS + Auth; cliente server en `lib/supabase/server.ts`, admin en `lib/supabase/admin.ts`
- Material Symbols Outlined (iconos), Recharts (gráficos), Zod v3 (`.issues[0]`, no `.errors[0]`)
- Moneda: USD, locale: es-SV, formato fecha: `dd/MM/yyyy`

## Scopes
- `personal` | `business` — columna en todas las tablas, filtrada por RLS vía `has_role(scope, role)`
- Switcher persiste scope en cookie `scope`
- Ingresos empresariales pueden caer en cuentas personales (efectivo)

## Modelo de datos crítico

### transactions
| Campo | Notas |
|-------|-------|
| `kind` | `income` \| `expense` |
| `is_confirmed` | false = pendiente; egresos NUNCA auto-confirman |
| `transfer_id` | UUID compartido entre ambas patas; expense=FROM, income=TO |
| `category_id` | NULLABLE (transfers e IVA no tienen categoría) |
| `affects_balance` | false = egreso externo/informativo |
| `recurring_rule_id` | FK; si pendiente y se borra tx → borrar también la regla |

### accounts
- `type`: `checking \| savings \| cash \| credit_card \| other`
- `is_tax_account`: cuenta de IVA empresarial
- `credit_limit`: solo tarjetas de crédito
- `usedByAccount[id]` = Σ expenses − Σ incomes en la tarjeta (clamp a 0)

### recurring_rules
- `category_id` NULLABLE, `to_account_id` para transferencias
- Constraint: `UNIQUE(recurring_rule_id, occurred_on, kind)` — evita duplicar ambas patas

### categories
- `is_tax_exempt`: ingresos empresariales sin IVA

## IVA (solo scope=business, kind=income)
```
ivaAmount = net × 1.11112 × 0.13
storedIncome = net + ivaAmount
```
- IVA siempre `is_confirmed: false` (pendiente)
- `confirmTransaction` en ingreso empresarial → auto-confirma transferencia IVA vinculada
- Transferencia IVA: `category_id: null`, `description: "IVA — {desc}"`
- Detectar regla IVA: `description.startsWith("IVA —")`

## Lógica `getTransactionsForMonth`
- Confirmados: filtrados por `occurred_on` del mes
- **Pendientes: SIN filtro de fecha** — siempre visibles hasta confirmación

## Pago de tarjeta de crédito
- Toggle en TransactionDialog (scope=personal, kind=expense)
- Crea `createTransfer(from=bankAccount, to=creditCard)`
- Al confirmar → income en tarjeta reduce `usedByAccount`

## Migraciones pendientes de ejecutar en Supabase
```sql
ALTER TABLE recurring_rules ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_recurring_rule_id_occurred_on_key;
ALTER TABLE transactions ADD CONSTRAINT transactions_recurring_rule_id_occurred_on_kind_key UNIQUE (recurring_rule_id, occurred_on, kind);
ALTER TABLE transactions ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_tax_exempt boolean NOT NULL DEFAULT false;
-- migrations/0004_team_email.sql (invited_email en memberships + policy profiles)
```

## Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # requerido para /settings/team (invitar usuarios)
```

## Rutas de páginas
| Ruta | Descripción |
|------|-------------|
| `/[scope]/dashboard` | KPIs, gráficos, proyección, estado tarjetas (personal) |
| `/[scope]/transactions` | Filtro por mes, pendientes siempre visibles |
| `/[scope]/accounts` | CRUD cuentas + drawer historial por cuenta |
| `/[scope]/categories` | CRUD categorías |
| `/[scope]/budgets` | Presupuestos |
| `/[scope]/recurring` | Reglas recurrentes (3 secciones: ingresos/egresos/transferencias) |
| `/[scope]/reports` | Historial mensual (meses anteriores) |
| `/settings/team` | Gestión de usuarios — invitar, cambiar rol, eliminar |

## Features pendientes (no implementadas)
- Edge Function `run-recurring` en Supabase (materialización diaria de recurrentes)
- Export Excel/PDF
- Tab Comparativo en reportes (y otros 3 tabs)
