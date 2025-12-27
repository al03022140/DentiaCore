/**
 * Controlador para [ENTIDAD]
 * Sigue las convenciones de nomenclatura del proyecto
 * 
 * Convenciones:
 * - Funciones: camelCase
 * - Variables: camelCase
 * - Constantes: UPPER_SNAKE_CASE
 * - Propiedades de modelo: snake_case (español)
 */

const [Modelo] = require('../models/[modelo].js');
const mongoose = require('mongoose');
const fs = require('fs-extra');
const path = require('path');

// Constantes del controlador
const MAX_ITEMS_PER_PAGE = 50;
const DEFAULT_PAGE_SIZE = 10;

/**
 * Obtener todos los [entidades]
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.getAll[Entidades] = async (req, res) => {
    try {
        console.log('📡 Solicitando todos los [entidades]...');

        // Implementar paginación
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || DEFAULT_PAGE_SIZE, MAX_ITEMS_PER_PAGE);
        const skip = (page - 1) * limit;

        // Construir consulta
        const [entidades] = await [Modelo].find({}, { __v: 0 })
            .skip(skip)
            .limit(limit)
            .exec();

        const total = await [Modelo].countDocuments();

        if (![entidades].length) {
            console.log('⚠️ No se encontraron [entidades].');
        }

        res.status(200).json({
            [entidades],
            pagination: {
                total,
                page,
                limit,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('❌ Error al obtener [entidades]:', error);
        res.status(500).json({ 
            message: 'Error al obtener [entidades]', 
            error: error.message 
        });
    }
};

/**
 * Obtener [entidad] por ID
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.get[Entidad]ById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔍 Buscando [entidad] con ID:', id);

        if (!id) {
            return res.status(400).json({ message: 'El ID de [entidad] es obligatorio' });
        }

        // Validar formato de ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Formato de ID inválido' });
        }

        const [entidad] = await [Modelo].findById(id).exec();

        if (![entidad]) {
            console.log('⚠️ [Entidad] no encontrada.');
            return res.status(404).json({ message: '[Entidad] no encontrada' });
        }

        res.status(200).json({ [entidad]: [entidad].toObject() });
    } catch (error) {
        console.error('❌ Error al obtener [entidad]:', error);
        
        if (error.name === 'CastError') {
            return res.status(400).json({ message: 'Formato de ID inválido', error: error.message });
        }
        
        res.status(500).json({ message: 'Error al obtener [entidad]', error: error.message });
    }
};

/**
 * Crear nueva [entidad]
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.create[Entidad] = async (req, res) => {
    try {
        console.log('📥 Creando nueva [entidad]:', req.body);

        // Validaciones básicas
        if (!req.body) {
            return res.status(400).json({ message: 'Datos de [entidad] requeridos' });
        }

        // Crear nueva instancia
        const nueva[Entidad] = new [Modelo](req.body);
        
        // Guardar en base de datos
        const [entidad]Guardada = await nueva[Entidad].save();
        
        console.log('✅ [Entidad] creada exitosamente:', [entidad]Guardada._id);
        
        res.status(201).json({
            message: '[Entidad] creada exitosamente',
            [entidad]: [entidad]Guardada.toObject()
        });
    } catch (error) {
        console.error('❌ Error al crear [entidad]:', error);
        
        // Manejar errores de validación
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Error de validación', 
                errors: Object.values(error.errors).map(err => err.message)
            });
        }
        
        // Manejar errores de duplicación
        if (error.code === 11000) {
            return res.status(409).json({ 
                message: '[Entidad] ya existe', 
                error: 'Datos duplicados'
            });
        }
        
        res.status(500).json({ message: 'Error al crear [entidad]', error: error.message });
    }
};

/**
 * Actualizar [entidad]
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.update[Entidad] = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🔄 Actualizando [entidad]:', id);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Formato de ID inválido' });
        }

        const [entidad]Actualizada = await [Modelo].findByIdAndUpdate(
            id, 
            req.body, 
            { new: true, runValidators: true }
        ).exec();

        if (![entidad]Actualizada) {
            return res.status(404).json({ message: '[Entidad] no encontrada' });
        }

        console.log('✅ [Entidad] actualizada exitosamente');
        
        res.status(200).json({
            message: '[Entidad] actualizada exitosamente',
            [entidad]: [entidad]Actualizada.toObject()
        });
    } catch (error) {
        console.error('❌ Error al actualizar [entidad]:', error);
        
        if (error.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Error de validación', 
                errors: Object.values(error.errors).map(err => err.message)
            });
        }
        
        res.status(500).json({ message: 'Error al actualizar [entidad]', error: error.message });
    }
};

/**
 * Eliminar [entidad]
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 */
exports.delete[Entidad] = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('🗑️ Eliminando [entidad]:', id);

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: 'Formato de ID inválido' });
        }

        const [entidad]Eliminada = await [Modelo].findByIdAndDelete(id).exec();

        if (![entidad]Eliminada) {
            return res.status(404).json({ message: '[Entidad] no encontrada' });
        }

        console.log('✅ [Entidad] eliminada exitosamente');
        
        res.status(200).json({
            message: '[Entidad] eliminada exitosamente',
            [entidad]: [entidad]Eliminada.toObject()
        });
    } catch (error) {
        console.error('❌ Error al eliminar [entidad]:', error);
        res.status(500).json({ message: 'Error al eliminar [entidad]', error: error.message });
    }
};

/**
 * INSTRUCCIONES DE USO:
 * 
 * 1. Reemplazar [ENTIDAD] con el nombre de la entidad en mayúsculas
 * 2. Reemplazar [Entidad] con el nombre de la entidad en PascalCase
 * 3. Reemplazar [entidad] con el nombre de la entidad en camelCase
 * 4. Reemplazar [entidades] con el plural de la entidad en camelCase
 * 5. Reemplazar [Entidades] con el plural de la entidad en PascalCase
 * 6. Reemplazar [Modelo] con el nombre del modelo importado
 * 7. Reemplazar [modelo] con el nombre del archivo del modelo
 * 
 * Ejemplo para "Tratamiento":
 * - [ENTIDAD] → TRATAMIENTO
 * - [Entidad] → Tratamiento
 * - [entidad] → tratamiento
 * - [entidades] → tratamientos
 * - [Entidades] → Tratamientos
 * - [Modelo] → Treatment
 * - [modelo] → treatment
 */