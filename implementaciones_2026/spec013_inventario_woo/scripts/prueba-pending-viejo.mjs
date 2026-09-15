// SPEC-013 «pending → REM», caso T7: un pending con más de REM_DIAS_VENCIMIENTO días NO reserva.
// Solo entorno de pruebas (backend local :3001 + .env.pruebas). La REST de Woo no permite retroceder
// date_created de un pedido, así que la fecha se retrocede por SQL en la BD de staging (vía SSH).
import 'dotenv/config';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { poolPromise } from '../../../db.js';

const WC = axios.create({ baseURL: `${process.env.WC_URL}/wp-json/wc/v3`, auth: { username: process.env.WC_CONSUMER_KEY, password: process.env.WC_CONSUMER_SECRET }, timeout: 60000 });
const token = jwt.sign({ usu_cod: 'PRUEBA', usu_nom: 'Prueba pending', rol_id: 1, rol_nombre: 'ADMIN' }, crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: 'http://localhost:3001/api', headers: { 'x-access-token': token }, timeout: 300000 });
const q = async (t) => (await (await poolPromise).request().query(t)).recordset;
const SSH = 'ssh -i ~/.ssh/prettystore_hostinger -p 65002 u638783424@195.179.239.49';
const [remAnular, artSec, pid] = [process.argv[2], '963', 3308];

try {
  if (remAnular) {
    const r = (await api.post(`/pedidos-web/${remAnular}/anular`, { motivo: 'Limpieza de prueba T7 (pedido de prueba creado hoy)' })).data;
    console.log('anular', remAnular, '→', r.success, r.data?.estadoWoo?.estado || JSON.stringify(r).slice(0, 200));
  }
  const { data: o } = await WC.post('orders', { status: 'pending', payment_method: 'epayco', payment_method_title: 'ePayco', set_paid: false,
    billing: { first_name: 'Prueba', last_name: 'Pending T7b', email: 'prueba.pending.t7b@example.com', phone: '3000000000', address_1: 'Calle 1', city: 'Bucaramanga', state: 'SAN', country: 'CO' },
    line_items: [{ product_id: pid, quantity: 1 }], customer_note: 'SPEC-013 prueba pending T7b — no despachar' });
  console.log('pedido', o.id, o.status, o.date_created_gmt);
  // Retroceder 8 días en la BD de staging (wp-config de public_html/pruebas)
  const cfg = execSync(`${SSH} "grep -E \\"DB_(NAME|USER|PASSWORD)\\" ~/domains/prettymakeupcol.com/public_html/pruebas/wp-config.php"`).toString();
  const v = (k) => cfg.match(new RegExp(`'${k}',\\s*'([^']+)'`))[1];
  const sqlStg = `UPDATE wp_posts SET post_date=DATE_SUB(post_date, INTERVAL 8 DAY), post_date_gmt=DATE_SUB(post_date_gmt, INTERVAL 8 DAY), post_modified=NOW(), post_modified_gmt=UTC_TIMESTAMP() WHERE ID=${o.id} AND post_type='shop_order'; SELECT ID, post_status, post_date_gmt, post_modified_gmt FROM wp_posts WHERE ID=${o.id};`;
  console.log(execSync(`${SSH} "mysql -h 127.0.0.1 -u ${v('DB_USER')} -p'${v('DB_PASSWORD')}' ${v('DB_NAME')} -e \\"${sqlStg}\\"" 2>/dev/null`).toString());
  const { data: o2 } = await WC.get(`orders/${o.id}`, { params: { _fields: 'id,status,date_created_gmt,date_modified_gmt' } }); console.log('REST ve:', JSON.stringify(o2));
  const res = (await api.post('/pedidos-web/importar-ahora', {})).data.resumen; console.log('ciclo:', JSON.stringify(res.acciones), res.conError ? `errores=${res.conError}` : '');
  const f = (await q(`SELECT estado_erp, fac_nro_rem, ultima_accion FROM dbo.woo_pedidos WHERE woo_order_id=${o.id}`))[0];
  console.log('fila:', JSON.stringify(f));
  const e = (await q(`SELECT existencia FROM dbo.vwExistencias WHERE art_sec='${artSec}'`))[0].existencia;
  const w = (await WC.get(`products/${pid}`, { params: { _fields: 'stock_quantity' } })).data.stock_quantity;
  console.log(`${f?.estado_erp === 'SIN_DOC' && /abandonado/.test(f?.ultima_accion || '') ? '✔' : '✘'} T7b sin REM por abandono · paridad ERP=${e} Woo=${w} ${Number(e) === Number(w) ? '✔' : '✘'}`);
} catch (e) { console.error('FALLÓ:', e.response?.status, JSON.stringify(e.response?.data || e.message).slice(0, 600)); } finally { process.exit(0); }
