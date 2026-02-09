# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**API Pretty** is an enterprise inventory management and e-commerce synchronization platform that manages products, pricing, orders, and inventory while maintaining bidirectional synchronization with WooCommerce.

**Core Technology:**
- Node.js + Express REST API
- SQL Server (mssql driver with connection pooling)
- JWT authentication + bcrypt
- WooCommerce REST API integration
- Cloudinary for image management

## Common Commands

### Development
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start
# Or with PM2
pm2 start index.js --name api_pretty
pm2 logs api_pretty

# Generate PDF catalog
npm run catalog:generate

# Test database connection
npm run catalog:test-db
```

### PM2 Process Management
```bash
# View running processes
pm2 list

# Monitor in real-time
pm2 monit

# View logs
pm2 logs api_pretty

# Restart after changes
pm2 restart api_pretty

# Stop process
pm2 stop api_pretty
```

## Architecture Overview

### Directory Structure
```
/controllers/     - Business logic & request handlers
/models/          - Data access layer (SQL queries)
/routes/          - API endpoint definitions
/middlewares/     - Auth & JWT verification
/jobs/            - Background sync tasks
/utils/           - Shared utilities (pricing, articles, invoices)
/config/          - External service configuration
/poc-catalogo-pdf/ - PDF catalog generation system
```

### Database Connection
- Connection pool managed in `db.js`
- All queries use parameterized inputs to prevent SQL injection
- Use `sql.VarChar`, `sql.Decimal`, `sql.Int`, etc. for type safety
- Multi-table operations require SQL transactions

Example:
```javascript
import { poolPromise, sql } from './db.js';

const pool = await poolPromise;
const transaction = new sql.Transaction(pool);
await transaction.begin();
try {
  await transaction.request()
    .input('param', sql.VarChar(50), value)
    .query('INSERT INTO...');
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Authentication Flow
1. Login via `POST /api/auth/login` with `usu_cod` and `usu_pass`
2. bcrypt verifies password against `dbo.Usuarios` table
3. JWT token generated with 24-hour expiration
4. Token sent in `x-access-token` header for protected routes
5. Middleware (`middlewares/authMiddleware.js`) validates JWT
6. Permissions loaded from role-based system (`dbo.RolesPermisos`)

### Key Database Tables
- `dbo.Usuarios` - User accounts with hashed passwords
- `dbo.Roles` - Role definitions
- `dbo.RolesPermisos` - Module-level permissions
- `dbo.RolesPermisosAcciones` - Action-level permissions
- `dbo.articulos` - Product master data
- `dbo.articulosdetalle` - Pricing tiers (lis_pre_cod: 1=detal/retail, 2=mayor/wholesale)
- `dbo.factura` - Orders/invoices
- `dbo.facturakardes` - Order line items & inventory movements (kardex)
- `dbo.promociones` - Fixed price promotional offers
- `dbo.promociones_detalle` - Per-article promotion details
- `dbo.eventos_promocionales` - Event-based percentage discounts
- `dbo.nit` - Customer information
- `dbo.vwExistencias` - VIEW for current inventory levels

## Complex Systems

### 1. Multi-Tier Pricing System
Products have two base price tiers stored in `articulosdetalle`:
- **precio_detal** (lis_pre_cod = 1) - Retail price
- **precio_mayor** (lis_pre_cod = 2) - Wholesale price

Additional pricing layers:
- **Promotions** (`promociones`) - Fixed offer prices per article with date ranges
- **Events** (`eventos_promocionales`) - Percentage discounts for campaigns (Black Friday, etc.)

Pricing validation rules (see `utils/precioUtils.js`):
- Offer prices must be less than BOTH detal and mayor prices
- Discounts are 0-100%
- Only active articles with stock can have promotions
- Event date ranges cannot overlap

### 2. WooCommerce Bidirectional Sync

**Product Sync** (`controllers/wooSyncController.js`):
- Local products → WooCommerce via REST API
- Maps `precio_detal` → `regular_price`
- Maps `precio_mayor` → custom meta field `_precio_mayorista`
- SKU matching via `art_cod`

**Order Sync** (`jobs/syncWooOrders.js`):
- WooCommerce orders → local `factura` table
- Status normalization: WooCommerce uses hyphens (e.g., `on-hold`), local uses underscores (`on_hold`)
- Customer matching by email or creates new `nit` record
- Creates complete transaction: header + line items + kardex entries

**Critical Fields:**
- `fac_est_fac` - Internal status (A=Active, I=Inactive, C=Cancelled)
- `fac_est_woo` - WooCommerce status (pending, processing, completed, etc.)
- `fac_nro_woo` - WooCommerce order ID
- `fac_nro_origen` - References original local order if created here first

### 3. Inventory Ledger (Kardex)
All inventory movements tracked in `facturakardes` with:
- `kar_nat` - Nature: `+` (entry) or `-` (exit)
- `fac_tip_cod` - Document type (FAC=invoice, AJT=adjustment, DEV=return, etc.)
- Running balance calculated via SQL OVER clauses
- Used for audit trail and inventory reconciliation

### 4. Document Numbering
Sequential IDs per document type via `dbo.tipo_comprobantes`:
```javascript
// Example: Generate invoice number
const fac_nro = await generateFacNro(transaction); // Returns "FAC123"
```
Use UPDLOCK/HOLDLOCK for concurrency control when reading/incrementing sequences.

## Important Patterns

### Creating Orders with Multiple Line Items
Always use SQL transactions for atomicity:
```javascript
const transaction = new sql.Transaction(pool);
await transaction.begin();
try {
  // 1. Generate fac_nro
  const fac_nro = await generateFacNro(transaction);

  // 2. Insert factura header
  await transaction.request().query(`INSERT INTO factura...`);

  // 3. Insert each line item into facturakardes
  for (const item of items) {
    await transaction.request().query(`INSERT INTO facturakardes...`);
  }

  // 4. Commit all changes
  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### Applying Promotions
1. Check for active fixed-price offers in `promociones` (date range validation)
2. Check for active event discounts in `eventos_promocionales`
3. Validate against base prices using `utils/precioUtils.js` functions
4. Precedence order: Fixed offers → Event discounts → Base prices

### Working with Background Jobs
Jobs in `/jobs` directory handle scheduled tasks:
- `syncWooOrders.js` - Import orders from WooCommerce
- `updateWooOrderStatusAndStock.js` - Update inventory and sync status back
- `updateWooProductPrices.js` - Bulk price sync to WooCommerce
- `updateArticleImagesFromWoo.js` - Download product images

Can be triggered manually via API endpoints or scheduled with PM2/cron.

## Environment Configuration

Required `.env` variables:
```
# Database
DB_SERVER=your_sql_server
DB_USER=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database
DB_PORT=1433

# JWT
JWT_SECRET=your_very_secure_secret_key

# WooCommerce
WC_URL=https://your-store.com
WC_CONSUMER_KEY=ck_xxxxx
WC_CONSUMER_SECRET=cs_xxxxx

# Cloudinary (for images)
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Server
PORT=3000
```

## Recent Features (2025)

### PDF Catalog Generation
Located in `poc-catalogo-pdf/`:
- Puppeteer-based PDF generation from HTML templates
- Sharp for image optimization
- Target: 600 products in <25 MB
- Generate with: `npm run catalog:generate`

### Promotional Events System
Event-based discounts (`eventos_promocionales`):
- Separate discount percentages for retail vs wholesale
- Minimum wholesale order threshold (`monto_mayorista_minimo`)
- Date range validation prevents overlapping active events
- Auto-applies based on cart subtotal

### Enhanced Order Sync
- Improved WooCommerce state normalization
- Better error handling and logging (Winston + Loki)
- Atomic transaction handling for order creation

## Testing & Debugging

### Diagnostic Endpoints
- `GET /api/diagnostic` - System health checks
- `GET /api/woo/test` - WooCommerce connection test

### Logging
Winston configured with Loki integration:
- Request/response timing
- Error stack traces
- Query performance tracking

### Common Issues
1. **Port already in use**: `lsof -ti:3000 | xargs kill -9`
2. **SQL connection timeout**: Check firewall and DB credentials
3. **WooCommerce sync fails**: Verify `WC_*` env variables and API permissions
4. **JWT invalid**: Ensure `JWT_SECRET` is set and token not expired (24h limit)

## Documentation References

Key documentation files:
- `DOCUMENTACION_SISTEMA_AUTENTICACION.md` - Auth system details
- `DOCUMENTACION_VALIDACION_TOKEN_JWT.md` - JWT implementation
- `sistema_precios_oferta/README.md` - Pricing system documentation
- `implementacion/DOCUMENTACION_DESCUENTOS_EVENTOS.md` - Event discounts
- `pm2-commands.md` - PM2 process management
- `GUIA_INSTALACION_MACBOOK.md` - Setup instructions

## Critical Considerations

1. **Always use parameterized queries** - Never concatenate user input into SQL
2. **Wrap multi-table operations in transactions** - Ensure atomicity
3. **Validate pricing logic** - Offers must be less than both base prices
4. **Normalize WooCommerce states** - Replace hyphens with underscores
5. **Only sync active articles** - Check `art_est = 'A'` and stock > 0
6. **Test permission checks** - Verify role-based access before operations
7. **Handle concurrent order creation** - Use UPDLOCK when generating document numbers
