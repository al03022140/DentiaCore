const express = require('express');
const noteTemplateController = require('../controllers/noteTemplateController');
const authorize = require('../middlewares/authorize');

const router = express.Router();

router.get('/me', authorize(['notes.template.manage', 'notes.template.use']), noteTemplateController.getMyTemplates);
router.post('/', authorize(['notes.template.manage']), noteTemplateController.createTemplate);
router.patch('/:id', authorize(['notes.template.manage']), noteTemplateController.updateTemplate);
router.delete('/:id', authorize(['notes.template.manage']), noteTemplateController.deleteTemplate);

module.exports = router;
