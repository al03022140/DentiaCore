# Planeación del Módulo de Consultas (Agenda y Ejecución)

Este documento define la estructura, diseño y flujo de trabajo para el módulo de **Consultas**, basándose en la robustez y estilo del módulo de Caja. El objetivo es gestionar el flujo clínico diario, desde la visualización de la agenda hasta la ejecución de la consulta en el detalle del paciente.

---

## 1. Distribución Visual (Layout)

La pantalla principal de Consultas se divide en dos columnas principales (Izquierda y Derecha), reorganizando la información para priorizar la lista de seguimiento en la derecha y los detalles operativos en la izquierda.

### A. Columna Izquierda (40% - 50% del ancho)
Esta columna se enfoca en el paciente actual y los detalles específicos.

#### Panel Superior: "Siguiente Paciente" (Highlight)
Un área destacada que muestra inminentemente quién es el próximo en ser atendido.
- **Tarjeta Grande**:
    - **Foto/Avatar**: Grande para rápida identificación.
    - **Nombre del Paciente**: Texto prominente.
    - **Hora**: Hora programada de la consulta.
    - **Motivo Principal**: Ej. "Limpieza General", "Revisión de Implante".
    - **Estado**: "En espera", "Confirmado".
    - **Acción Rápida**: Botón "Iniciar Consulta Ahora" (Lleva directamente al *Patient Detail* en modo consulta).

#### Panel Inferior: "Detalle de la Consulta Seleccionada"
Al hacer clic en cualquier consulta de la lista (derecha), este panel muestra la información profunda.
- **Encabezado del Paciente**: Resumen rápido (Edad, Alergias críticas).
- **Línea de Tiempo (Historial Relevante)**:
    - "Lo que se ha hecho": Un resumen cronológico inverso de las últimas intervenciones.
    - Ej: *Hace 2 semanas: Colocación de Implante (Dr. X)*.
- **Plan para esta Consulta ("A realizar hoy")**:
    - Lista de procedimientos o acciones planificadas para esta cita específica.
    - Ej: "Retirar puntos", "Revisión de cicatrización".
- **Acciones**: Botón para ir al detalle completo del paciente.

### B. Columna Derecha (50% - 60% del ancho)
Esta columna contiene la **Agenda Completa del Día**.

#### Panel: "Lista de Consultas"
Una lista vertical completa que permite ver el flujo del día de un vistazo.
- **Sección Superior: "Próximas Consultas"**
    - Lista cronológica de los pacientes que faltan por atender hoy.
    - Cada ítem muestra: Hora, Nombre, Motivo breve.
- **Sección Inferior: "Consultas Realizadas"**
    - Lista de pacientes ya atendidos en el día.
    - Estilo visual diferenciado (ej. opacidad reducida) para indicar que ya pasaron.
    - Indicador de estado: "Completada", "Cancelada".

---

## 2. Flujos de Trabajo Críticos

### A. Flujo de Inicio de Consulta
1.  **Selección**: El doctor ve al "Siguiente Paciente" en el panel superior izquierdo o selecciona uno de la lista.
2.  **Revisión**: Mira el panel derecho para recordar qué se le hizo la última vez y qué toca hacer hoy.
3.  **Acción**: Hace clic en "Iniciar Consulta".
4.  **Navegación**: El sistema redirige a la vista **Patient Detail** (`/patient/:id`).

### B. Flujo de Ejecución (Dentro de Patient Detail)
Una vez en el detalle del paciente, la experiencia debe adaptarse al contexto de "Consulta Activa".

1.  **Modo Consulta Activa**:
    - Debería haber una sección o indicador visual de que se está atendiendo la cita de hoy.
2.  **Gestión de la Consulta Actual**:
    - **Checklist de Planificación**: Mostrar los ítems que se planearon ("A realizar hoy") con opción de marcarlos como hechos.
    - **Nuevos Procedimientos**: Agregar tratamientos al Odontograma/Periodontograma o notas de evolución.
3.  **Planificación Futura**:
    - Antes de terminar, un campo para definir: "¿Qué se hará en la próxima cita?". Esto alimentará el panel derecho de la futura consulta.
4.  **Finalizar Consulta**:
    - Botón para cerrar la consulta.
    - Cambia el estado de la cita a "Completada".
    - (Opcional) Redirige a Caja para el cobro o vuelve a la lista de Consultas.

---

## 3. Modelo de Datos (Backend)

Para soportar esta funcionalidad, necesitamos robustecer el modelo `Appointment` y asegurar la trazabilidad.

### Actualización del Modelo: `Appointment`
El modelo actual es básico. Se propone expandirlo:

```javascript
const appointmentSchema = new mongoose.Schema({
    // ... campos existentes (paciente_id, doctor_id, fecha_hora) ...

    // Estado ampliado para mejor control del flujo
    estado: {
        type: String,
        enum: ["Pendiente", "Confirmada", "En Progreso", "Completada", "Cancelada", "No Asistió"],
        default: "Pendiente"
    },

    // Planificación (Lo que se planeó hacer en esta cita)
    // Se llena cuando se crea la cita (generalmente al final de la cita anterior)
    planificacion: [{
        accion: String, // Ej: "Retirar puntos"
        completado: { type: Boolean, default: false }
    }],

    // Resultado (Lo que realmente se hizo, resumen)
    // Notas de evolución o resumen clínico de la sesión
    notas_evolucion: {
        type: String,
        trim: true
    },
    
    // Vinculación con tratamientos (Opcional pero recomendado)
    // IDs de los tratamientos que se realizaron efectivamente en esta cita
    tratamientos_realizados: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Treatment'
    }]

}, { timestamps: true });
```

### Consultas Necesarias (Queries)

1.  **`getDailyAppointments(date)`**:
    - Devuelve todas las citas de una fecha específica.
    - Ordenadas por hora.
    - Separadas en frontend o backend por estado (Pendientes vs Completadas).

2.  **`getPatientHistory(patientId)`**:
    - Devuelve las últimas N citas del paciente con estado "Completada".
    - Incluye `notas_evolucion` y `tratamientos_realizados` para mostrar en el panel derecho ("Lo que se ha hecho").

---

## 4. Resumen de Implementación

1.  **Backend**:
    - Actualizar Schema `Appointment` (agregar `planificacion`, `notas_evolucion`, nuevos estados).
    - Crear endpoints para obtener agenda del día y historial resumido.

2.  **Frontend (Nueva Vista: Consultas)**:
    - Crear layout de dos columnas.
    - Componente `NextPatientCard`.
    - Componente `AppointmentList` (agrupado por Próximas/Pasadas).
    - Componente `AppointmentDetailPanel` (Historial + Plan).

3.  **Frontend (Actualización: Patient Detail)**:
    - Integrar la lógica de "Consulta en Curso".
    - Permitir marcar ítems de la planificación como completados.
    - Permitir agendar la próxima cita definiendo su `planificacion`.
