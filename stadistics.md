# Planificación del Módulo de Estadísticas

---

## 1. Layout General de la Vista
- Contenedor principal dividido en dos columnas con padding interno y fondo uniforme.
- **Columna Izquierda (≈65%)**: área de visualización con cuatro pestañas persistentes (con las mismo estilo de pestañas con el mismo estilo las cuales se usan en Home, Consultas, Caja, Inventario). Cada pestaña muestra una cuadrícula 2x2 que aloja una gráfica activa.
- **Columna Derecha (≈35%)**: panel desplazable con una lista compacta de métricas (no sólo títulos). Cada tarjeta/entrada muestra:
  - Título (línea superior).
  - Temporalidades disponibles debajo (Diaria, Semanal, Mensual, Anual) — la activa marcada.
  - Tipos de visualización soportados debajo (Línea, Barra, Pastel, Heatmap) como etiquetas o iconos.
  - Descripción breve y etiqueta de categoría en formato compacto.
  - Diseño en forma de lista apilada para scroll rápido y selección inmediata.
- Bidireccional Drag & Drop: arrastrar una tarjeta desde la lista al slot activo (vacío u ocupado); si se reemplaza una gráfica, la anterior vuelve como tarjeta a la lista. Resaltar destinos válidos, mostrar placeholder y soporte por teclado/ARIA.
- Persistencia de estado: almacenar composición por pestaña por usuario (localStorage + opción de backend) incluyendo título, temporalidad y tipo de visualización para restauración.

## 2. Comportamiento de Drag & Drop
- Slots de la cuadrícula en la columna izquierda muestran placeholder con CTA cuando están vacíos.
- Al iniciar un drag, destacar slots válidos con borde principal.
- Al soltar:
  - Guardar la métrica seleccionada en el slot de la pestaña activa.
  - Emitir evento para cargar datos y renderizar la gráfica correspondiente.
  - Actualizar la lista derecha removiendo la tarjeta usada; si había gráfica previa, reincorporarla.
- Tres puntos (kebab menu) en cada gráfica para elegir tipo de visualización compatible (línea, barra, pastel, heatmap) y acciones (exportar, duplicar, devolver a lista).

## 3. Métricas / KPIs Disponibles
- Ingresos Totales: diario, semanal, mensual, por servicio.
- Caja por turno/empleado: cierres por caja/turno, discrepancias.
- Pacientes: nuevos vs recurrentes, registros por periodo.
- Consultas: cantidad por tipo/servicio/doctor, tiempo medio de atención.
- No-shows / Cancelaciones: tasa por periodo, por doctor.
- Productividad: consultas por hora, ingresos por hora.
- Inventario: consumo por ítem, alertas de stock bajo.
- Cohortes / Retención: retención por cohortes mensuales.
- Tendencias y comparativas: YoY, MoM, vs objetivo.

## 4. API Backend (Server)
- GET /api/stats/summary?from=&to=&group=day|month
- GET /api/stats/revenue-by-service?from=&to=&serviceId
- GET /api/stats/patients-trend?from=&to=&type=new|returning
- GET /api/stats/no-shows?from=&to&group=doctor|day
- GET /api/stats/inventory-alerts
- POST /api/stats/refresh-cache (admin)

  Nota: los endpoints que acepten el parámetro `group` deben soportar las granularidades: `day`, `week`, `month`, `year` (p. ej. `group=day|week|month|year`).

## 5. Consideraciones Técnicas (MongoDB)
- Pipelines de agregación empleando $match, $group, $sort, $project, $lookup.
- Índices en campos críticos: fecha, servicioId, doctorId, patientId.
- Materialized views o Redis para métricas de alta frecuencia.
- Ejemplo (ingresos por día): $match rango fechas → $group por día (string formato %Y-%m-%d) sumando amount → $sort ascendente.

## 6. Arquitectura Frontend (Client/src/features/statistics)
- Dashboard.tsx: contenedor principal, gestión de tabs izquierda y panel derecho.
- SummaryCards.tsx: KPIs resumidos superiores.
- Filters.tsx: rango de fechas, servicio, doctor, sucursal.
- Charts/
  - LineChart.tsx, BarChart.tsx, PieChart.tsx, Heatmap.tsx (ECharts o Recharts).
  - Wrapper que recibe tipo de visualización desde kebab menu.
- ExportButton.tsx: descarga CSV/PDF por métrica.
- store.ts (redux/zustand): cache de filtros, datos de métricas, layout por pestaña.

## 7. UX y Visualización
- Top bar: selectores de rango, filtros y cards KPI.
- Zona central: hasta 3 gráficos destacados en la pestaña activa (según layout 2x2).
- Zona inferior: tabla detallada por métrica seleccionada con paginación, export y enlaces a expediente/consulta.
- Feedback optimista en drag & drop y carga (skeleton loaders).

## 8. Performance y Pruebas
- Limitar resultados y aplicar paginación en endpoints.
- Tests unitarios para pipelines de agregación (fixtures Mongo) y mocks de API.
- Medir tiempo de respuesta; agregar cache TTL por métrica.
- Validar drag & drop con pruebas de interacción (React Testing Library + DnD Testing).

## 9. MVP Prioritario
1. Panel de Ingresos Totales (agregación diaria + gráfica de línea).
2. Resumen Pacientes (nuevos vs recurrentes) con card y gráfica.
3. Filtros por rango de fechas y servicio + export CSV.
4. Iteración posterior: más gráficos, tabs completas, cache avanzado.

## 10. Requisitos sobre títulos y temporalidades de las gráficas
- **Título de la gráfica:** Cada slot de gráfica debe mostrar, en la parte superior izquierda, el título claro de la métrica (ej.: "Pacientes", "EH", "Ingreso pacientes anual").
- **Temporalidad visible:** A la derecha del título debe mostrarse la temporalidad actualmente seleccionada ("Diaria", "Semanal", "Mensual", "Anual").
- **Dropdown de selección:** Al hacer clic sobre la etiqueta de temporalidad se desplegará un dropdown con las opciones: `Diaria`, `Semanal`, `Mensual`, `Anual`. La opción activa debe estar marcada.
- **Comportamiento al cambiar:** Al seleccionar una nueva temporalidad se debe:
  - emitir un evento que solicite los datos con la nueva granularidad (p. ej. `group=day|week|month|year`),
  - recargar/actualizar los datos de la gráfica correspondiente,
  - mostrar un loader pequeño mientras se actualizan los datos,
  - mantener el estado seleccionado (para persistencia local y/o backend si aplica).
- **Accesibilidad y usabilidad:** El dropdown debe ser accesible por teclado, con atributos ARIA apropiados y foco visible.
- **Ejemplo de flujo:** el usuario ve "Ingreso pacientes" — "Mensual"; hace clic en "Mensual", selecciona "Diaria" → la gráfica solicita `GET /api/stats/patients-trend?from=...&to=...&group=day` y re-renderiza con la nueva temporalidad.

Estos requisitos deben incluirse en el diseño de `Charts/` y en las pruebas de integración para validar que la selección de temporalidad recarga correctamente las métricas.
