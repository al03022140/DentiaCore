# Índice de auditoría — Frontend (Client)

El frontend ya está dividido por `src/features/`. Cada fila es una unidad auditable
independiente. Audita una por una; `shared/` se audita aparte porque lo consume todo.

Ruta base de todo: `Client/src/`

## Features (módulos de usuario)

| # | Módulo | Ruta URL | Entrada | Archivos | LOC | Qué hace |
|---|--------|----------|---------|---------:|----:|----------|
| 1 | **add-patient** | `/add-patient` | `features/add-patient/add-patient.jsx` | 10 | 4222 | Alta de paciente: form multi-sección (identificación, contacto, historia, hábitos, evaluación dental, mujer, emergencia) |
| 2 | **patient-list** | `/pacientes` | `features/patient-list/patient-list.jsx` | 1 | 490 | Listado/búsqueda de pacientes |
| 3 | **patient-detail** | `/patient/:id` `/patient/:id/imprimir` | `features/patient-detail/patient-detail.jsx` | 20 | 6717 | Ficha completa del paciente + impresión. Contiene odontograma y periodontograma embebidos |
| 4 | **odontogram** | (dentro de patient-detail) | `features/odontogram/components/*` | 5 | 2561 | Odontograma inicial y clínico |
| 5 | **periodontogram** | (dentro de patient-detail) | `features/periodontogram/periodontogram-design.jsx` | 16 | 7076 | Periodontograma: medición, gráficas en tiempo real, canvas, estadística |
| 6 | **consultas** | `/consultas` | `features/consultas/ConsultasPage.jsx` | 3 | 1787 | Agenda/consultas + centro de borradores + modal crear cita |
| 7 | **main-page** | `/` (home) | `features/main-page/components/*` | 4 | 1546 | Dashboard: calendario, reloj, próximo paciente, stats |
| 8 | **cash** | `/caja` | `features/cash/CashPage.jsx` | 6 | 1435 | Caja: apertura, movimientos, cargos pendientes, acciones |
| 9 | **statistics** | `/estadisticas` | `features/statistics/StatisticsPage.jsx` | 3 | 925 | Estadísticas + render de gráficas |
| 10 | **settings** | `/configuracion[/:section]` | `features/settings/SettingsPage.jsx` | 18 | 4518 | Configuración: perfil, clínica, cuentas/permisos, caja, citas, calendar, seguridad, trazabilidad, apariencia, etc. |
| 11 | **auth** | `/login` | `features/auth/LoginPage.jsx` | 1 | 142 | Login |
| 12 | **audit** | — | `features/audit/audit-timeline.css` | 0 JS | 0 | Solo CSS (timeline). Sin componente — revisar si es código muerto |

## Shared (transversal — auditar aparte)

| Carpeta | Archivos | LOC | Qué contiene |
|---------|---------:|----:|--------------|
| `shared/services` | 12 | 1401 | Llamadas API: patient, appointment, attachment, audit, cash, charge, periodontogram, settings, google, axios-instance, auth-token |
| `shared/components` | 8 | 1909 | Header, sidebar, error-boundary, firma (Wacom/SignaturePad/Badge/DoctorSignStep), LockScreen |
| `shared/utils` | 11 | 799 | date, money, formatters, logger, object-path, periodontogram-*, dataUrl, version-name, sectionDirtyGuard |
| `shared/lib/wacom-stu` | 3 | 928 | Driver firma tableta Wacom STU (WebHID) |
| `shared/schemas` + `validators` | 4 | 1137 | Schema periodontograma unificado + validador universal de dientes |
| `shared/hooks` | 4 | 362 | useDraftPersistence, useNestedFormState, useSessionKeepAlive, useSignRecord |
| `shared/contexts` | 4 | 190 | Appointment, Sidebar, Theme, UnsavedChanges |
| `shared/config` | 1 | 377 | Config periodontograma |
| `app/auth` | 3 | — | AuthContext, ProtectedRoute, permissions |

## Notas para auditar

- **Más grande primero**: periodontogram (7076), patient-detail (6717), settings (4518), add-patient (4222) — son los de mayor riesgo.
- **patient-detail** embebe **odontogram** y **periodontogram**; audítalos juntos o en ese orden.
- **audit/** no tiene JS: confirmar si la timeline se usa o es muerto.
- Cada feature toca `shared/services/*` — al auditar un módulo, mira también el service que consume.
