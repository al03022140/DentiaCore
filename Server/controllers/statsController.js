const CashMovement = require('../models/cashMovement');
const BoxSession = require('../models/boxSession');
const Patient = require('../models/patient');
const Appointment = require('../models/appointment');
const Tratamiento = require('../models/treatment');

// ─── Helpers ────────────────────────────────────────────

const GRANULARITY_FORMATS = {
  day: '%Y-%m-%d',
  // %G = año de la semana ISO (no %Y = año calendario). En el borde de año
  // (ej. 2027-01-01) %Y daría "2027-W53" mientras isoWeekString da "2026-W53",
  // y las keys no cruzan → ingresos/citas de esa semana desaparecen. H1.
  week: '%G-W%V',
  month: '%Y-%m',
  year: '%Y'
};

// Zona horaria única para agrupar (Mongo) y etiquetar (JS). $dateToString agrupa
// en UTC por defecto mientras buildPeriodLabels/parseDateRange usan métodos
// locales de Date; si difieren, los movimientos cerca de medianoche caen en el
// bucket del día adyacente y el label del primer/último día no cruza con la key
// de Mongo (datos que desaparecen). Se fija ambos lados a la MISMA zona. H2.
// ponytail: usa la TZ del proceso; para fijar la de la clínica, exporta
//   TZ=America/Mexico_City al arrancar el server.
const REPORT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// Fallback defensivo: el frontend ya traduce a inglés (day/week/month/year)
// vía GRANULARITY_API_MAP, pero se mantiene por si la API se consume externamente.
const GRANULARITY_MAP = {
  diaria: 'day',
  semanal: 'week',
  mensual: 'month',
  anual: 'year'
};

const normalizeGranularity = raw => GRANULARITY_MAP[raw] || raw || 'month';

// Ventana por defecto según la granularidad. Con "diaria" sobre 1 año se
// generan ~365 puntos casi todos en cero — las líneas/barras quedan ilegibles.
// Estos defaults mantienen entre ~12 y ~60 puntos por gráfica.
const DEFAULT_WINDOW_BY_GRANULARITY = {
  day:   { field: 'date',  amount: 30 },
  week:  { field: 'date',  amount: 12 * 7 },
  month: { field: 'month', amount: 12 },
  year:  { field: 'year',  amount: 5 }
};

const parseDateRange = (from, to, granularity = 'month') => {
  const now = new Date();
  let end = to ? new Date(to) : now;
  // Fechas inválidas (ej. ?to=abc) caen al default en vez de NaN time.
  if (Number.isNaN(end.getTime())) end = new Date(now);

  let start = from ? new Date(from) : null;
  if (start && Number.isNaN(start.getTime())) start = null;
  if (!start) {
    const window = DEFAULT_WINDOW_BY_GRANULARITY[granularity] || DEFAULT_WINDOW_BY_GRANULARITY.month;
    start = new Date(end);
    if (window.field === 'date')  start.setDate(start.getDate() - window.amount);
    if (window.field === 'month') start.setMonth(start.getMonth() - window.amount);
    if (window.field === 'year')  start.setFullYear(start.getFullYear() - window.amount);
  }

  end.setHours(23, 59, 59, 999);
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const buildDateGroup = (dateField, format) => ({
  $dateToString: { format, date: dateField, timezone: REPORT_TZ }
});

// ISO week number (lunes-domingo, semana 1 = la que contiene el primer jueves).
// Coincide con MongoDB %V.
const isoWeekString = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
};

// Genera los labels completos del rango según la granularidad, para que
// los gráficos NO salten periodos sin datos. El llamador hace map sobre
// estos labels y rellena con 0 los que no estén en su map de resultados.
const buildPeriodLabels = (start, end, granularity) => {
  const labels = [];
  const cursor = new Date(start);
  cursor.setHours(0, 0, 0, 0);
  const stop = new Date(end);

  // Para 'week' arrancamos en el LUNES de la semana ISO de `start`. Si no y
  // `start`/`end` caen en días distintos de la semana, el cursor (+7 desde
  // `start`) puede saltar por encima de la última semana parcial sin emitir su
  // label, y las citas/ingresos de esa semana desaparecen del gráfico. H3.
  if (granularity === 'week') {
    const isoDay = cursor.getDay() || 7; // getDay: 0=dom..6=sáb; ISO lunes=1
    cursor.setDate(cursor.getDate() - (isoDay - 1));
  }

  // Tope defensivo: 5 años de días = 1825 puntos. Evita loops infinitos
  // por bugs y limita la respuesta.
  const MAX_POINTS = 1825;

  while (cursor <= stop && labels.length < MAX_POINTS) {
    if (granularity === 'day') {
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getDate()).padStart(2, '0');
      labels.push(`${yyyy}-${mm}-${dd}`);
      cursor.setDate(cursor.getDate() + 1);
    } else if (granularity === 'week') {
      labels.push(isoWeekString(cursor));
      cursor.setDate(cursor.getDate() + 7);
    } else if (granularity === 'year') {
      labels.push(String(cursor.getFullYear()));
      cursor.setFullYear(cursor.getFullYear() + 1);
    } else {
      // month (default)
      const yyyy = cursor.getFullYear();
      const mm = String(cursor.getMonth() + 1).padStart(2, '0');
      labels.push(`${yyyy}-${mm}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Dedupe defensivo (week puede repetirse en bordes de año).
  return Array.from(new Set(labels));
};

// ─── 1. Resumen general ─────────────────────────────────

exports.getSummary = async (req, res) => {
  try {
    const { from, to, group } = req.query;
    const granularity = normalizeGranularity(group);
    const fmt = GRANULARITY_FORMATS[granularity] || GRANULARITY_FORMATS.month;
    const { start, end } = parseDateRange(from, to, granularity);

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

      // Pacientes NUEVOS en el rango (createdAt dentro), no el total histórico.
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

    const revenueMap = {};
    revenueTrend.forEach(item => { revenueMap[item._id] = item.total; });
    const summaryLabels = buildPeriodLabels(start, end, granularity);

    res.json({
      period: { from: start, to: end, granularity },
      revenue: {
        labels: summaryLabels,
        data: summaryLabels.map(l => revenueMap[l] || 0),
        totalAmount: revenueTrend.reduce((sum, item) => sum + item.total, 0),
        totalMovements: revenueTrend.reduce((sum, item) => sum + item.count, 0)
      },
      patients: { newPatients: totalPatients },
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
    const { start, end } = parseDateRange(from, to, granularity);

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
    const { start, end } = parseDateRange(from, to, granularity);

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

    const newMap = {};
    newPatients.forEach(item => { newMap[item._id] = item.count; });
    const retMap = {};
    returningPatients.forEach(item => { retMap[item._id] = item.count; });
    const labels = buildPeriodLabels(start, end, granularity);

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
    const { start, end } = parseDateRange(from, to, granularity);

    // 'NoShow' es el estado real para "no asistió". 'Pasada' se asigna
    // automáticamente a TODA cita pasada sin cerrar (incluso asistidas),
    // así que NO debe contarse aquí.
    const pipeline = [
      { $match: {
        fecha_hora: { $gte: start, $lte: end },
        deletedAt: null,
        estado: { $in: ['Cancelada', 'NoShow'] }
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

    const cancelledMap = {};
    const noShowMap = {};

    result.forEach(item => {
      const period = item._id.period;
      if (item._id.status === 'Cancelada') {
        cancelledMap[period] = item.count;
      } else {
        noShowMap[period] = item.count;
      }
    });

    const labels = buildPeriodLabels(start, end, granularity);

    res.json({
      labels,
      datasets: [
        {
          label: 'Canceladas',
          data: labels.map(label => cancelledMap[label] || 0)
        },
        {
          label: 'No asistieron',
          data: labels.map(label => noShowMap[label] || 0)
        }
      ],
      granularity,
      totalAppointments: totalInRange,
      cancelledTotal: Object.values(cancelledMap).reduce((s, v) => s + v, 0),
      noShowTotal: Object.values(noShowMap).reduce((s, v) => s + v, 0)
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
    const { start, end } = parseDateRange(from, to, granularity);

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

    const sessionMap = {};
    sessions.forEach(s => { sessionMap[s._id] = s; });
    const labels = buildPeriodLabels(start, end, granularity);

    // Calcular discrepancias (diferencia entre final e initial)
    const discrepancies = labels
      .filter(l => sessionMap[l])
      .map(l => {
        const s = sessionMap[l];
        const diff = s.totalFinal - s.totalInitial;
        return { period: l, diff: Math.round(diff * 100) / 100 };
      });

    res.json({
      labels,
      datasets: [
        {
          label: 'Sesiones cerradas',
          data: labels.map(l => sessionMap[l]?.sessionCount || 0)
        },
        {
          label: 'Monto inicial total',
          data: labels.map(l => sessionMap[l]?.totalInitial || 0)
        },
        {
          label: 'Monto final total',
          data: labels.map(l => sessionMap[l]?.totalFinal || 0)
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
    const { start, end } = parseDateRange(from, to, granularity);

    // "Atendida" = cita que YA ocurrió y no fue cancelada ni no-show. No existe
    // un estado explícito "Atendida"; 'Pasada' se auto-asigna a toda cita pasada
    // sin cerrar y 'Confirmada' incluye futuras dentro del rango. Contar
    // fecha_hora <= ahora excluyendo Cancelada/NoShow es coherente con getNoShows. H4.
    const now = new Date();
    const cappedEnd = end < now ? end : now;

    const [appointmentsByPeriod, revenueByPeriod] = await Promise.all([
      Appointment.aggregate([
        { $match: { fecha_hora: { $gte: start, $lte: cappedEnd }, deletedAt: null, estado: { $nin: ['Cancelada', 'NoShow'] } } },
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

    // Mismo eje X que el resto de endpoints: labels completos del rango (los
    // periodos futuros/sin datos quedan en 0), no la unión de periodos con datos. H4.
    const labels = buildPeriodLabels(start, end, granularity);

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
    const { start, end } = parseDateRange(from, to, granularity);

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

    const incomeMap = {};
    const expenseMap = {};

    movements.forEach(item => {
      // Match explícito: si mañana se agrega un 3er tipo al enum, no debe caer
      // silenciosamente en "Gastos". L2.
      if (item._id.type === 'INCOME') incomeMap[item._id.period] = item.total;
      else if (item._id.type === 'EXPENSE') expenseMap[item._id.period] = item.total;
    });

    const labels = buildPeriodLabels(start, end, granularity);

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
    const { start, end } = parseDateRange(from, to, granularity);

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

    const statusMap = { 'Pendiente': {}, 'En proceso': {}, 'Finalizado': {} };

    result.forEach(item => {
      if (statusMap[item._id.estado] !== undefined) {
        statusMap[item._id.estado][item._id.period] = item.count;
      }
    });

    const labels = buildPeriodLabels(start, end, granularity);

    res.json({
      labels,
      datasets: [
        { label: 'Pendiente', data: labels.map(l => statusMap['Pendiente'][l] || 0) },
        { label: 'En proceso', data: labels.map(l => statusMap['En proceso'][l] || 0) },
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

    // Una sola agregación: última visita por paciente. Antes eran 8 `distinct`
    // (2 por umbral) trayendo arrays de IDs a memoria + diff en JS, repetido 4×;
    // y NO filtraba pacientes soft-deleted, así que un paciente archivado con
    // citas viejas se contaba como "inactivo". M5.
    const lastVisits = await Appointment.aggregate([
      { $match: { deletedAt: null } },
      { $group: { _id: '$paciente_id', lastVisit: { $max: '$fecha_hora' } } },
      { $lookup: { from: 'patients', localField: '_id', foreignField: '_id', as: 'patient' } },
      { $unwind: '$patient' },                 // descarta citas huérfanas (sin paciente)
      { $match: { 'patient.deletedAt': null } }, // excluye pacientes archivados
      { $project: { lastVisit: 1 } }
    ]);

    // Inactivo en umbral `days`: su última visita fue ANTES del corte (tiene
    // historial pero no asiste hace más de `days`).
    const counts = thresholds.map(days => {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - days);
      return lastVisits.filter(v => v.lastVisit < cutoff).length;
    });

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
      // $gte 0 (no $gt): una cura creada y finalizada el mismo día dura 0 días y
      // es legítima; excluirla sesgaba el promedio al alza. Sigue descartando
      // negativas (createdAt posterior a la fecha del ítem). M6.
      // ponytail: el ancla es createdAt del documento, no la fecha de inicio del
      //   ítem (no existe ese campo en el subdoc); planes largos inflan la duración.
      { $match: { duracionDias: { $gte: 0 } } },
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

// Exportados sólo para pruebas unitarias (borde de año — H1 — y semanas
// parciales — H3). No son parte de la API HTTP.
exports._internal = { buildPeriodLabels, isoWeekString, parseDateRange };

