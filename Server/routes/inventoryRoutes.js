const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const { authorize } = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

/**
 * Rutas del módulo de Inventario — montadas en /api/inventory
 * (config/routes.js, DESPUÉS de authenticate + auditLogger: toda escritura
 * queda en el audit trail HMAC automáticamente).
 *
 * Permisos (utils/permissions.js):
 * - inventory.read    → ver catálogo, stock, alertas, kardex, kits
 * - inventory.manage  → catálogo CRUD, entradas, ajustes, kits CRUD
 * - inventory.consume → registrar/revertir consumo en una cita
 */

// ── Catálogo y stock ────────────────────────────────────────────
router.get('/items', readLimiter, authorize(['inventory.read', 'inventory.manage']), inventoryController.getItems);
router.get('/categories', readLimiter, authorize(['inventory.read', 'inventory.manage']), inventoryController.getCategories);
router.post('/items', writeLimiter, authorize(['inventory.manage']), inventoryController.createItem);
router.put('/items/:id', writeLimiter, authorize(['inventory.manage']), inventoryController.updateItem);
router.delete('/items/:id', writeLimiter, authorize(['inventory.manage']), inventoryController.deleteItem);

// ── Entradas y ajustes de stock ─────────────────────────────────
router.post('/items/:id/lots', writeLimiter, authorize(['inventory.manage']), inventoryController.addLot);
router.post('/items/:id/adjust', writeLimiter, authorize(['inventory.manage']), inventoryController.adjustStock);

// ── Kardex ──────────────────────────────────────────────────────
router.get('/items/:id/movements', readLimiter, authorize(['inventory.read', 'inventory.manage']), inventoryController.getMovements);

// ── Alertas (caducidad + stock bajo) ────────────────────────────
router.get('/alerts', readLimiter, authorize(['inventory.read', 'inventory.manage']), inventoryController.getAlerts);

// ── Consumo ligado a citas ──────────────────────────────────────
router.post('/consume', writeLimiter, authorize(['inventory.consume', 'inventory.manage']), inventoryController.consume);
router.post('/consume/revert', writeLimiter, authorize(['inventory.consume', 'inventory.manage']), inventoryController.revertConsume);

// ── Kits (plantillas por procedimiento) ─────────────────────────
router.get('/kits', readLimiter, authorize(['inventory.read', 'inventory.manage']), inventoryController.getKits);
router.post('/kits', writeLimiter, authorize(['inventory.manage']), inventoryController.createKit);
router.put('/kits/:id', writeLimiter, authorize(['inventory.manage']), inventoryController.updateKit);
router.delete('/kits/:id', writeLimiter, authorize(['inventory.manage']), inventoryController.deleteKit);

module.exports = router;
