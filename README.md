# Hygiene Hub — Admin Dashboard

Next.js 16 admin dashboard for managing the Hygiene Hub e-commerce store.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Auth**: Supabase Auth with admin role verification
- **Database**: Supabase (PostgreSQL with RLS)
- **Charts**: Recharts
- **Styling**: Tailwind CSS v4 + Radix UI (shadcn/ui)

## Getting Started

```bash
pnpm install
cp .env.local.example .env.local
```

Set the required environment variables in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
ADMIN_TRUSTED_ORIGINS=http://localhost:3001
NEXT_PUBLIC_APP_ORIGIN=http://localhost:3001
```

```bash
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001).

## Features

### Dashboard
- Real-time sales overview (revenue, orders, AOV, customers)
- Sales trend charts (30-day daily)
- Top products by revenue
- Low stock alerts
- CSV export

### Orders
- Order list with status/payment filters
- Order detail with items and shipping info
- Update order status
- CSV export

### Products
- Full CRUD (create, edit, delete)
- Image upload to Supabase Storage
- Bulk import/export via CSV
- Category management

### Customers
- Customer list with VIP/Returning/New segmentation
- Purchase history
- Search and pagination

### Analytics
- 7D/30D/90D date range
- Revenue trend, cumulative revenue, order status distribution
- Peak order hours, top customers, top products
- Revenue by category

### Settings
- Store config (name, currency, timezone)
- Team management (invite members with roles)
- Billing and integrations
- Audit logs

### Inventory
- Stock level management
- Low stock alerts

## Project Structure

```
app/
├── page.tsx                    # Main SPA with view switching
├── dashboard/
│   ├── page.tsx                # Standalone analytics page
│   ├── products/               # Bulk import/export
│   └── email-campaigns/        # Email campaign management
├── inventory/                  # Inventory management
├── sign-in/                    # Auth pages
├── sign-up/
├── api/
│   ├── admin/                  # Admin API routes (auth required)
│   │   ├── products/           # Product CRUD + low stock
│   │   ├── orders/             # Order management
│   │   ├── customers/          # Customer data
│   │   └── config/             # Settings, profile, audit logs
│   ├── products/               # Product CRUD, import/export, upload
│   ├── orders/                 # Order management
│   └── auth/                   # Auth callback, MFA
components/
├── admin/                      # Admin-specific components
│   ├── AdminLayout.tsx         # Shell with sidebar + topbar
│   ├── DashboardView.tsx       # Dashboard with KPIs + charts
│   ├── ProductsView.tsx        # Product CRUD
│   ├── OrdersView.tsx          # Order management
│   ├── CustomersView.tsx       # Customer management
│   ├── AnalyticsView.tsx       # Analytics dashboard
│   ├── SettingsView.tsx        # Store/team/billing settings
│   └── ui.tsx                  # Admin UI primitives
├── ui/                         # shadcn/ui components
lib/
├── supabase/                   # Supabase clients (browser, server, admin)
├── admin-auth.ts               # Admin role verification
├── analytics.ts                # Dashboard analytics queries
├── emails/                     # Email templates
└── route-security.ts           # Rate limiting + trusted origins
```

## API Routes

All admin API routes require authentication + admin role via `requireAdminForApi()`.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/products` | List products |
| POST | `/api/products` | Create product |
| PUT | `/api/products/[id]` | Update product |
| DELETE | `/api/products/[id]` | Delete product |
| POST | `/api/products/upload` | Upload product image |
| GET | `/api/products/export` | Export products CSV |
| POST | `/api/products/import` | Import products CSV |
| GET | `/api/orders` | List orders |
| PUT | `/api/orders/[id]` | Update order status |
| GET | `/api/admin/products/get` | Simplified product list |
| GET | `/api/admin/products/low-stock` | Low stock products |
| GET | `/api/admin/orders/get` | Orders with items |
| GET | `/api/admin/customers/get` | Customer aggregations |
| GET/PUT | `/api/admin/config/profile` | Admin profile |
| GET/PUT | `/api/admin/config/settings` | Store settings |
| GET | `/api/admin/email-campaigns` | List campaigns |
| POST | `/api/admin/email-campaigns` | Create + send campaign |

## Auth Flow

1. User signs in at `/sign-in` via Supabase Auth
2. Proxy middleware checks auth cookie on every request
3. Dashboard/inventory routes require `profiles.role === 'admin'`
4. API routes use `requireAdminForApi()` for server-side verification
5. Non-admin users are redirected to `/sign-in`

## Related Projects

- **hygienhub-rebuild** — Customer-facing store (same Supabase project)
