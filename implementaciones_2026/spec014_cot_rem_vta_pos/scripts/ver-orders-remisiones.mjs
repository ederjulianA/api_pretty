/**
 * Comprueba lo que la pantalla /orders recibe del backend para cada tipo de documento.
 * Sirve para verificar que las remisiones aparecen con Estado=Activo y que "facturada" se ve
 * por la columna `documentos` ("Cruzada con"), no por el estado.
 *
 *   cd api_pretty && DOTENV_CONFIG_PATH=.env.pruebas node -r dotenv/config \
 *     implementaciones_2026/spec014_cot_rem_vta_pos/scripts/ver-orders-remisiones.mjs
 * Solo lee, y solo por HTTP contra el backend local en :3001.
 */
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import axios from 'axios';
const token = jwt.sign({ usu_cod: 'EDER', usu_nom: 'EDERALVAREZ', rol_id: 1, rol_nombre: 'ADMIN' },
  crypto.createHash('sha256').update(process.env.JWT_SECRET).digest(), { expiresIn: '2h' });
const api = axios.create({ baseURL: 'http://localhost:3001/api', headers: { 'x-access-token': token }, validateStatus: () => true });
const pedir = async (estado, fue_cod) => {
  const r = await api.get('/ordenes', { params: {
    FechaDesde: '2026-09-01', FechaHasta: '2026-09-30', fac_est_fac: estado, fue_cod,
    PageNumber: 1, PageSize: 100 } });
  return r.data?.ordenes ?? [];
};
for (const [etiqueta, estado, fue] of [['REMISIONES · Activo','A',6], ['REMISIONES · Inactivo','I',6], ['FACTURAS · Activo','A',1]]) {
  const filas = await pedir(estado, fue);
  console.log(`\n${etiqueta}: ${filas.length} filas`);
  for (const f of filas.slice(0, 6))
    console.log(`   ${f.fac_nro}  ${String(f.fac_fec).slice(0,10)}  woo=${f.fac_nro_woo ?? '-'}  estado=${f.fac_est_fac}  cruzada_con=${f.documentos || '-'}  total=${f.total_pedido}`);
  if (filas.length > 6) console.log(`   … y ${filas.length - 6} más`);
}
