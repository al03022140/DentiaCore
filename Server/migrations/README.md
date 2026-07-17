# Migraciones — DentiaCore

Cambios de esquema/datos versionados, aplicados **una sola vez** y en orden por el
runner `scripts/migrate.js`. Es la maquinaria para evolucionar la BD de cada
clínica de forma segura al actualizar.

## Cómo correr

```bash
npm run migrate:dry     # lista las pendientes, no aplica nada
npm run migrate         # toma un backup y aplica las pendientes
```

El runner registra las aplicadas en la colección `migrations`, así que re-correr
no repite ninguna. Antes de aplicar pendientes, hace un **backup automático**
(`backup-db.js`). Si el backup falla, **aborta** sin tocar datos.

## Cómo escribir una migración

Crea `Server/migrations/NNNN-descripcion.js` (NNNN = siguiente número, 4 dígitos):

```js
module.exports = {
  id: '0001-descripcion',           // DEBE ser igual al nombre de archivo sin .js
  async up(db) {
    // `db` = handle NATIVO de MongoDB (mongoose.connection.db). Usa ops crudas:
    await db.collection('patients').updateMany(
      { algunCampoViejo: { $exists: true } },
      { $rename: { algunCampoViejo: 'algunCampoNuevo' } }
    );
  },
};
```

## Reglas

- **Idempotente:** `up()` debe poder correr dos veces sin daño (filtra por lo que
  aún no está migrado). Si falla a la mitad, se corrige y se vuelve a correr.
- **Forward-only:** no hay `down()`. El rollback es **restaurar el backup previo**
  (ver `docs/server/operacion/backups-y-restauracion.md`).
- **Ops crudas, no modelos:** usa `db.collection(...)`, no los modelos Mongoose de
  la app (evita acoplarte a su versión/validaciones).
- **Trampas de Mongoose (doc 03 §14):** los renombres por alias y los getters NO
  aplican en queries ni en `.lean()`; migra el dato físico y ajusta los literales
  de query en el mismo cambio.
- **Campos firmados CONGELADOS (doc 03 §15):** NO renombres ni canonicalices
  campos de `SIGNABLE_FIELDS` (`Server/utils/integrity.js`) — romperías firmas
  NOM-024. La decisión vigente es no migrar esos campos.
- **Prueba primero en copia:** corre la migración contra un restore de la BD real
  antes de producción (doc 03 §16, runbook de día de migración).
