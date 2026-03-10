const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const Patient = require('../models/patient');
const Appointment = require('../models/appointment');
const Tratamiento = require('../models/treatment');

// ─── Helpers ────────────────────────────────────────────

const GRANULARITY_FORMATS = {
  day: '%Y-%m-%d',
  week: '%Y-W%V',
  month: '%Y-%m',
  year: '%Y'
};

// Fallback defensivo: el frontend ya traduce a inglés (day/week/month/year)
// vía GRANULARITY_API_MAP, pero se mantiene por si la API se consume externamente.
const GRANULARITY_MAP = {
  diaria: 'day',
  semanal: 'week',
  mensual: 'month',
  anual: 'year'
};

const normalizeGranularity = raw => GRANULARITY_MAP[raw] || raw || 'month';

const parseDateRange = (from, to) => {
  const now = new Date();
  const end = to ? new Date(to) : now;
  const start = from
    ? new Date(from)
    : new Date(end.getFullYear() - 1, end.getMonth(), end.getDate());

  end.setHours(23, 59, 59, 999);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const buildDateGroup = (dateField, format) => ({
  $dateToString: { format, date: dateField }
});

// ─── 1. Resumen general ─────────────────────────────────

exports.getSummary = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const dateFilter = { $gte: start, $lte: end };

    const [revenueTrend, totalPatients, totalAppointments, appointmentsByStatus] = await Promise.all([
      // Ingresos agrupados por periodo
      CashMovement.aggregate([
        { $match: { date: dateFilter, type: 'INCOME' } },
        { $group: {
          _id: buildDateGroup('$date', fmt),
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),

      // Total pacientes en rango
      Patient.countDocuments({ createdAt: dateFilter, deletedAt: null }),

      // Total citas en rango
      Appointment.countDocuments({ fecha_hora: dateFilter, deletedAt: null }),

      // Citas por estado
      Appointment.aggregate([
        { $match: { fecha_hora: dateFilter, deletedAt: null } },
        { $group: { _id: '$estado', count: { $sum: 1 } } }
      ])
    ]);

    const statusMap = {};
    appointmentsByStatus.forEach(item => { statusMap[item._id] = item.count; });

    res.json({
      period: { from: start, to: end, granularity },
      revenue: {
        labels: revenueTrend.map(item => item._id),
        data: revenueTrend.map(item => item.total),
        totalAmount: revenueTrend.reduce((sum, item) => sum + item.total, 0),
        totalMovements: revenueTrend.reduce((sum, item) => sum + item.count, 0)
      },
      patients: { total: totalPatients },
      appointments: {
        total: totalAppointments,
        byStatus: statusMap
      }
    });
  } catch (error) {
    console.error('Error en getSummary:', error);
    res.status(500).json({ message: 'Error al obtener resumen de estadisticas.' });
  }
};

// ─── 2. Ingresos por servicio / concepto ────────────────

exports.getRevenueByService = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const pipeline = [
      { $match: { date: { $gte: start, $lte: end }, type: 'INCOME' } },
      { $group: {
        _id: {
          period: buildDateGroup('$date', fmt),
          concept: '$concept'
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.period': 1 } }
    ];

    const result = await CashMovement.aggregate(pipeline);

    // Agrupar por concepto para gráficas
    const byService = {};
    const labelsSet = new Set();

    result.forEach(item => {
      const concept = item._id.concept || 'Sin concepto';
      const period = item._id.period;
      labelsSet.add(period);
      if (!byService[concept]) {
        byService[concept] = {};
      }
      byService[concept][period] = item.total;
    });

    const labels = Array.from(labelsSet).sort();
    const datasets = Object.entries(byService).map(([concept, periodMap]) => ({
      label: concept,
      data: labels.map(label => periodMap[label] || 0)
    }));

    res.json({ labels, datasets, granularity });
  } catch (error) {
    console.error('Error en getRevenueByService:', error);
    res.status(500).json({ message: 'Error al obtener ingresos por servicio.' });
  }
};

// ─── 3. Tendencia de pacientes (nuevos vs recurrentes) ──

exports.getPatientsTrend = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    // Pacientes nuevos por periodo (basado en createdAt)
    const newPatients = await Patient.aggregate([
      { $match: { createdAt: { $gte: start, $lte: end }, deletedAt: null } },
      { $group: {
        _id: buildDateGroup('$createdAt', fmt),
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Pacientes recurrentes: los que tienen citas en el rango pero fueron creados ANTES del rango
    const returningPatients = await Appointment.aggregate([
      { $match: { fecha_hora: { $gte: start, $lte: end }, deletedAt: null } },
      { $lookup: {
        from: 'patients',
        localField: 'paciente_id',
        foreignField: '_id',
        as: 'patientInfo'
      }},
      { $unwind: '$patientInfo' },
      { $match: { 'patientInfo.createdAt': { $lt: start } } },
      { $group: {
        _id: {
          period: buildDateGroup('$fecha_hora', fmt),
          patient: '$paciente_id'
        }
      }},
      { $group: {
        _id: '$_id.period',
        count: { $sum: 1 }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Unificar labels
    const labelsSet = new Set();
    newPatients.forEach(item => labelsSet.add(item._id));
    returningPatients.forEach(item => labelsSet.add(item._id));
    const labels = Array.from(labelsSet).sort();

    const newMap = {};
    newPatients.forEach(item => { newMap[item._id] = item.count; });
    const retMap = {};
    returningPatients.forEach(item => { retMap[item._id] = item.count; });

    res.json({
      labels,
      datasets: [
        {
          label: 'Nuevos',
          data: labels.map(label => newMap[label] || 0)
        },
        {
          label: 'Recurrentes',
          data: labels.map(label => retMap[label] || 0)
        }
      ],
      granularity,
      totals: {
        new: newPatients.reduce((sum, item) => sum + item.count, 0),
        returning: returningPatients.reduce((sum, item) => sum + item.count, 0)
      }
    });
  } catch (error) {
    console.error('Error en getPatientsTrend:', error);
    res.status(500).json({ message: 'Error al obtener tendencia de pacientes.' });
  }
};

// ─── 4. No-shows y cancelaciones ────────────────────────

exports.getNoShows = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const pipeline = [
      { $match: {
        fecha_hora: { $gte: start, $lte: end },
        deletedAt: null,
        estado: { $in: ['Cancelada', 'Pasada'] }
      }},
      { $group: {
        _id: {
          period: buildDateGroup('$fecha_hora', fmt),
          status: '$estado'
        },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.period': 1 } }
    ];

    const result = await Appointment.aggregate(pipeline);

    // Total citas en el rango (para calcular tasas)
    const totalInRange = await Appointment.countDocuments({
      fecha_hora: { $gte: start, $lte: end },
      deletedAt: null
    });

    const labelsSet = new Set();
    const cancelledMap = {};
    const passedMap = {};

    result.forEach(item => {
      const period = item._id.period;
      labelsSet.add(period);
      if (item._id.status === 'Cancelada') {
        cancelledMap[period] = item.count;
      } else {
        passedMap[period] = item.count;
      }
    });

    const labels = Array.from(labelsSet).sort();

    res.json({
      labels,
      datasets: [
        {
          label: 'Canceladas',
          data: labels.map(label => cancelledMap[label] || 0)
        },
        {
          label: 'No asistieron (Pasada)',
          data: labels.map(label => passedMap[label] || 0)
        }
      ],
      granularity,
      totalAppointments: totalInRange,
      cancelledTotal: Object.values(cancelledMap).reduce((s, v) => s + v, 0),
      passedTotal: Object.values(passedMap).reduce((s, v) => s + v, 0)
    });
  } catch (error) {
    console.error('Error en getNoShows:', error);
    res.status(500).json({ message: 'Error al obtener no-shows.' });
  }
};

// ─── 5. Rendimiento de caja por turno ───────────────────

exports.getCashboxPerformance = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    // Sesiones cerradas en el rango
    const sessions = await BoxSession.aggregate([
      { $match: {
        startTime: { $gte: start, $lte: end },
        status: 'CLOSED'
      }},
      { $group: {
        _id: buildDateGroup('$startTime', fmt),
        sessionCount: { $sum: 1 },
        totalInitial: { $sum: '$initialAmount' },
        totalFinal: { $sum: { $ifNull: ['$finalAmount', 0] } }
      }},
      { $sort: { _id: 1 } }
    ]);

    // Movimientos agrupados por periodo y método de pago
    const movements = await CashMovement.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: {
        _id: {
          period: buildDateGroup('$date', fmt),
          type: '$type',
          method: '$paymentMethod'
        },
        total: { $sum: '$amount' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.period': 1 } }
    ]);

    const labels = sessions.map(s => s._id);

    // Calcular discrepancias (diferencia entre final e initial + ingresos - gastos)
    const discrepancies = sessions.map(session => {
      const expected = session.totalFinal;
      const diff = expected - session.totalInitial;
      return { period: session._id, diff: Math.round(diff * 100) / 100 };
    });

    res.json({
      labels,
      datasets: [
        {
          label: 'Sesiones cerradas',
          data: sessions.map(s => s.sessionCount)
        },
        {
          label: 'Monto inicial total',
          data: sessions.map(s => s.totalInitial)
        },
        {
          label: 'Monto final total',
          data: sessions.map(s => s.totalFinal)
        }
      ],
      discrepancies,
      movements: movements.map(m => ({
        period: m._id.period,
        type: m._id.type,
        method: m._id.method,
        total: m.total,
        count: m.count
      })),
      granularity
    });
  } catch (error) {
    console.error('Error en getCashboxPerformance:', error);
    res.status(500).json({ message: 'Error al obtener rendimiento de caja.' });
  }
};

// ─── 6. Productividad (citas e ingresos por hora) ──────

exports.getProductivity = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const [appointmentsByPeriod, revenueByPeriod] = await Promise.all([
      Appointment.aggregate([
        { $match: { fecha_hora: { $gte: start, $lte: end }, deletedAt: null, estado: { $in: ['Confirmada', 'Pasada'] } } },
        { $group: {
          _id: buildDateGroup('$fecha_hora', fmt),
          count: { $sum: 1 }
        }},
        { $sort: { _id: 1 } }
      ]),
      CashMovement.aggregate([
        { $match: { date: { $gte: start, $lte: end }, type: 'INCOME' } },
        { $group: {
          _id: buildDateGroup('$date', fmt),
          total: { $sum: '$amount' }
        }},
        { $sort: { _id: 1 } }
      ])
    ]);

    const labelsSet = new Set();
    appointmentsByPeriod.forEach(item => labelsSet.add(item._id));
    revenueByPeriod.forEach(item => labelsSet.add(item._id));
    const labels = Array.from(labelsSet).sort();

    const apptMap = {};
    appointmentsByPeriod.forEach(item => { apptMap[item._id] = item.count; });
    const revMap = {};
    revenueByPeriod.forEach(item => { revMap[item._id] = item.total; });

    res.json({
      labels,
      datasets: [
        {
          label: 'Citas atendidas',
          data: labels.map(label => apptMap[label] || 0)
        },
        {
          label: 'Ingresos',
          data: labels.map(label => revMap[label] || 0)
        }
      ],
      granularity
    });
  } catch (error) {
    console.error('Error en getProductivity:', error);
    res.status(500).json({ message: 'Error al obtener productividad.' });
  }
};

// ─── 7. Ganancias Netas (ingresos - gastos) ──────────────

exports.getNetEarnings = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const movements = await CashMovement.aggregate([
      { $match: { date: { $gte: start, $lte: end } } },
      { $group: {
        _id: {
          period: buildDateGroup('$date', fmt),
          type: '$type'
        },
        total: { $sum: '$amount' }
      }},
      { $sort: { '_id.period': 1 } }
    ]);

    const labelsSet = new Set();
    const incomeMap = {};
    const expenseMap = {};

    movements.forEach(item => {
      labelsSet.add(item._id.period);
      if (item._id.type === 'INCOME') incomeMap[item._id.period] = item.total;
      else expenseMap[item._id.period] = item.total;
    });

    const labels = Array.from(labelsSet).sort();

    res.json({
      labels,
      datasets: [
        { label: 'Ingresos', data: labels.map(l => incomeMap[l] || 0) },
        { label: 'Gastos', data: labels.map(l => expenseMap[l] || 0) },
        { label: 'Ganancia Neta', data: labels.map(l => (incomeMap[l] || 0) - (expenseMap[l] || 0)) }
      ],
      granularity
    });
  } catch (error) {
    console.error('Error en getNetEarnings:', error);
    res.status(500).json({ message: 'Error al obtener ganancias netas.' });
  }
};

// ─── 8. Tratamientos en Proceso vs Finalizados ──────────

exports.getTreatmentStatus = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to);

    const result = await Tratamiento.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: '$tratamientos' },
      { $match: { 'tratamientos.fecha': { $gte: start, $lte: end } } },
      { $group: {
        _id: {
          period: buildDateGroup('$tratamientos.fecha', fmt),
          estado: '$tratamientos.estado'
        },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.period': 1 } }
    ]);

    const labelsSet = new Set();
    const statusMap = { 'Pendiente': {}, 'En proceso': {}, 'Finalizado': {} };

    result.forEach(item => {
      labelsSet.add(item._id.period);
      if (statusMap[item._id.estado] !== undefined) {
        statusMap[item._id.estado][item._id.period] = item.count;
      }
    });

    const labels = Array.from(labelsSet).sort();

    res.json({
      labels,
      datasets: [
        { label: 'Pendiente', data: labels.map(l => statusMap['Pendiente'][l] || 0) },
        { label: 'En Proceso', data: labels.map(l => statusMap['En proceso'][l] || 0) },
        { label: 'Finalizado', data: labels.map(l => statusMap['Finalizado'][l] || 0) }
      ],
      granularity
    });
  } catch (error) {
    console.error('Error en getTreatmentStatus:', error);
    res.status(500).json({ message: 'Error al obtener estado de tratamientos.' });
  }
};

// ─── 9. Pacientes sin visita reciente ─────────────────

exports.getInactivePatients = async (req, res) => {
  try {
    const now = new Date();
    const thresholds = [30, 60, 90, 180];

    const counts = await Promise.all(thresholds.map(async days => {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - days);

      // IDs con al menos una cita reciente
      const recentIds = await Appointment.distinct('paciente_id', {
        fecha_hora: { $gte: cutoff },
        deletedAt: null
      });

      // IDs con alguna cita histórica antes del corte (tienen historial pero ya no vienen)
      const historicIds = await Appointment.distinct('paciente_id', {
        fecha_hora: { $lt: cutoff },
        deletedAt: null
      });

      const recentSet = new Set(recentIds.map(id => id.toString()));
      const inactive = historicIds.filter(id => !recentSet.has(id.toString()));
      return inactive.length;
    }));

    res.json({
      labels: thresholds.map(d => `+${d} días sin visita`),
      datasets: [{ label: 'Pacientes inactivos', data: counts }],
      granularity: 'snapshot'
    });
  } catch (error) {
    console.error('Error en getInactivePatients:', error);
    res.status(500).json({ message: 'Error al obtener pacientes inactivos.' });
  }
};

// ─── 10. Tratamientos Más Comunes ────────────────────

exports.getMostCommonTreatments = async (req, res) => {
  try {
    const { from, to } = req.query;
    const { start, end } = parseDateRange(from, to);

    const result = await Tratamiento.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: '$tratamientos' },
      { $match: { 'tratamientos.fecha': { $gte: start, $lte: end } } },
      { $group: {
        _id: '$tratamientos.descripcion',
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      labels: result.map(r => r._id),
      datasets: [{ label: 'Cantidad', data: result.map(r => r.count) }],
      granularity: 'snapshot'
    });
  } catch (error) {
    console.error('Error en getMostCommonTreatments:', error);
    res.status(500).json({ message: 'Error al obtener tratamientos comunes.' });
  }
};

// ─── 11. Tiempo Promedio de Tratamiento ────────────────

exports.getTreatmentDuration = async (req, res) => {
  try {
    const { from, to } = req.query;
    const { start, end } = parseDateRange(from, to);

    // Por cada documento de tratamiento, toma el createdAt como inicio
    // y la fecha del sub-tratamiento Finalizado como fin
    const result = await Tratamiento.aggregate([
      { $match: { deletedAt: null } },
      { $unwind: '$tratamientos' },
      { $match: {
        'tratamientos.estado': 'Finalizado',
        'tratamientos.fecha': { $gte: start, $lte: end }
      }},
      { $project: {
        descripcion: '$tratamientos.descripcion',
        duracionDias: {
          $divide: [
            { $subtract: ['$tratamientos.fecha', '$createdAt'] },
            1000 * 60 * 60 * 24
          ]
        }
      }},
      { $match: { duracionDias: { $gt: 0 } } },
      { $group: {
        _id: '$descripcion',
        avgDias: { $avg: '$duracionDias' },
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    res.json({
      labels: result.map(r => r._id),
      datasets: [{ label: 'Días promedio', data: result.map(r => Math.round(r.avgDias)) }],
      granularity: 'snapshot'
    });
  } catch (error) {
    console.error('Error en getTreatmentDuration:', error);
    res.status(500).json({ message: 'Error al obtener duración de tratamientos.' });
  }
};

