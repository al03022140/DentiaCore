const express = require('express');
const noteTemplateController = require('../controllers/noteTemplateController');
const authorize = require('../middlewares/authorize');
const { writeLimiter, readLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

router.get('/me', readLimiter, authorize(['notes.template.manage', 'notes.template.use']), noteTemplateController.getMyTemplates);
router.post('/', writeLimiter, authorize(['notes.template.manage']), noteTemplateController.createTemplate);
router.patch('/:id', writeLimiter, authorize(['notes.template.manage']), noteTemplateController.updateTemplate);
router.delete('/:id', writeLimiter, authorize(['notes.template.manage']), noteTemplateController.deleteTemplate);

module.exports = router;
