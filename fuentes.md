# Sistema tipográfico (tokens semánticos)

Este documento estandariza la intención del texto. Las vistas deben declarar qué es el texto (título, cuerpo, etiqueta, etc.) y no cómo se ve.

## Cómo usar

- Aplicar el token con la propiedad `font`.
- Ejemplo: `font: var(--text-heading-lg);`

## Tokens base (pantallas)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-display-hero` | Montserrat, 3rem, 700, 1.1 | `var(--color-text-dark)` | Hero principal, títulos de impacto (header principal, vista calendario) |
| `--text-display-xxl` | Montserrat, 4rem, 800, 1.1 | `var(--color-text-dark)` | Título hero extendido (Add Patient) |
| `--text-display-xl` | Montserrat, 2.5rem, 700, 1.2 | `var(--color-text-dark)` | Título principal de página (formularios, dashboards) |
| `--text-heading-xxl` | Montserrat, 2rem, 700, 1.2 | `var(--color-text-primary)` | Encabezado de layout, títulos de cabecera |
| `--text-heading-xl` | Montserrat, 1.875rem, 700, 1.2 | `var(--color-text-primary)` | Título de sección destacado en breakpoints |
| `--text-heading-lg` | Montserrat, 1.8rem, 600, 1.25 | `var(--color-text-primary)` | Subtítulo de sección / panel |
| `--text-heading-md` | Montserrat, 1.75rem, 600, 1.25 | `var(--color-text-primary)` | Subtítulo alterno en breakpoints |
| `--text-heading-sm` | Montserrat, 1.6rem, 600, 1.3 | `var(--color-text-primary)` | Título de card, módulo o panel |
| `--text-heading-xs` | Montserrat, 1.5rem, 600, 1.3 | `var(--color-text-secondary)` | Encabezado compacto |
| `--text-heading-xxs` | Montserrat, 1.4rem, 600, 1.3 | `var(--color-text-secondary)` | Encabezado secundario |
| `--text-subtitle-lg` | Montserrat, 1.3rem, 500, 1.35 | `var(--color-text-secondary)` | Subtítulos con énfasis (KPIs, resúmenes) |
| `--text-subtitle-md` | Montserrat, 1.25rem, 500, 1.35 | `var(--color-text-secondary)` | Subtítulo estándar en cards y formularios |
| `--text-body-lg` | Montserrat, 1.2rem, 400, 1.6 | `var(--color-text-primary)` | Párrafos destacados o descripciones amplias |
| `--text-body-default` | Montserrat, 1.1rem, 400, 1.6 | `var(--color-text-primary)` | Texto base de contenido general |
| `--text-body-strong` | Montserrat, 1.1rem, 600, 1.5 | `var(--color-text-primary)` | Texto base con énfasis (títulos de cards en caja) |
| `--text-body-sm` | Montserrat, 1rem, 400, 1.5 | `var(--color-text-secondary)` | Texto secundario, listas, notas en cards |
| `--text-body-xs` | Montserrat, 0.95rem, 400, 1.5 | `var(--color-text-secondary)` | Texto de inputs, botones secundarios |
| `--text-label-lg` | Montserrat, 1rem, 500, 1.4 | `var(--color-text-secondary)` | Etiquetas principales de formularios |
| `--text-label` | Montserrat, 0.95rem, 500, 1.4 | `var(--color-text-secondary)` | Etiquetas estándar, chips, metadatos |
| `--text-label-sm` | Montserrat, 0.9rem, 500, 1.4 | `var(--color-text-secondary)` | Etiquetas compactas, badges secundarios |
| `--text-label-strong` | Montserrat, 1rem, 600, 1.4 | `var(--color-text-primary)` | Etiquetas con énfasis (cabeceras de cards) |
| `--text-caption` | Montserrat, 0.88rem, 400, 1.4 | `var(--color-text-muted)` | Títulos de gráficos, notas cortas |
| `--text-caption-md` | Montserrat, 0.875rem, 400, 1.4 | `var(--color-text-muted)` | Texto secundario compacto (cards en home) |
| `--text-caption-sm` | Montserrat, 0.85rem, 400, 1.4 | `var(--color-text-muted)` | Ayudas, captions y textos de apoyo |
| `--text-caption-xs` | Montserrat, 0.8rem, 400, 1.3 | `var(--color-text-muted)` | Microcopy, leyendas pequeñas |
| `--text-overline` | Montserrat, 0.75rem, 600, 1.2 | `var(--color-text-secondary)` | Overlines, etiquetas en mayúsculas |
| `--text-micro` | Montserrat, 0.7rem, 500, 1.2 | `var(--color-text-light)` | Indicadores muy compactos |
| `--text-nano` | Montserrat, 0.625rem, 500, 1.2 | `var(--color-text-light)` | UI ultra compacta (10px) |
| `--text-pico` | Montserrat, 0.5625rem, 500, 1.2 | `var(--color-text-light)` | UI extrema (9px) |

## Tokens compactos (tablas, listados, cards densas)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-dense-lg` | Montserrat, 0.9375rem, 500, 1.35 | `var(--color-text-secondary)` | Fila destacada en tablas (15px) |
| `--text-dense-md` | Montserrat, 0.875rem, 500, 1.35 | `var(--color-text-secondary)` | Celdas estándar en tablas (14px) |
| `--text-dense-sm` | Montserrat, 0.8125rem, 500, 1.3 | `var(--color-text-muted)` | Celdas compactas (13px) |
| `--text-dense-xs` | Montserrat, 0.75rem, 500, 1.2 | `var(--color-text-muted)` | Celdas micro / badges compactos (12px) |
| `--text-dense-xxs` | Montserrat, 0.6875rem, 500, 1.2 | `var(--color-text-muted)` | Celdas ultra compactas (11px) |
| `--text-dense-xxxs` | Montserrat, 0.625rem, 500, 1.2 | `var(--color-text-light)` | Celdas mínimas (10px) |
| `--text-dense-xxxxs` | Montserrat, 0.5625rem, 500, 1.2 | `var(--color-text-light)` | Celdas mínimas extremas (9px) |

## Tokens de datos clínicos (periodontograma / grids densos)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-data-xl` | Montserrat, 24px, 700, 1.2 | `var(--color-text-primary)` | Indicadores grandes (gráficas/resúmenes) |
| `--text-data-lg` | Montserrat, 22px, 700, 1.2 | `var(--color-text-primary)` | KPIs clínicos destacados |
| `--text-data-md` | Montserrat, 20px, 600, 1.2 | `var(--color-text-primary)` | Resúmenes y cifras principales |
| `--text-data-sm` | Montserrat, 18px, 600, 1.2 | `var(--color-text-secondary)` | Subtotales, valores secundarios |
| `--text-data-xs` | Montserrat, 16px, 600, 1.2 | `var(--color-text-secondary)` | Títulos de sección en grillas |
| `--text-data-xxs` | Montserrat, 15px, 500, 1.2 | `var(--color-text-secondary)` | Etiquetas compactas |
| `--text-data-xxxs` | Montserrat, 14px, 500, 1.2 | `var(--color-text-secondary)` | Etiquetas estándar de grilla |
| `--text-data-xxxxs` | Montserrat, 13px, 500, 1.1 | `var(--color-text-secondary)` | Etiquetas micro en grillas |
| `--text-data-5xs` | Montserrat, 12px, 500, 1.1 | `var(--color-text-secondary)` | Inputs compactos |
| `--text-data-6xs` | Montserrat, 11px, 500, 1.1 | `var(--color-text-secondary)` | Etiquetas mínimas |
| `--text-data-7xs` | Montserrat, 10px, 500, 1.1 | `var(--color-text-secondary)` | Celdas mínimas |
| `--text-data-8xs` | Montserrat, 9px, 500, 1.1 | `var(--color-text-muted)` | Celdas ultra mínimas |
| `--text-data-9xs` | Montserrat, 8px, 500, 1.1 | `var(--color-text-muted)` | Micro texto (grids densos) |
| `--text-data-10xs` | Montserrat, 7px, 500, 1.1 | `var(--color-text-muted)` | Texto extremo (solo impresión/placeholder) |
| `--text-data-11xs` | Montserrat, 6px, 500, 1.1 | `var(--color-text-muted)` | Texto extremo (solo impresión) |

## Tokens fluidos (vw/clamp)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-fluid-sidebar` | Montserrat, clamp(1.2rem, 1.5vw, 1.4rem), 600, 1.3 | `var(--text-color)` | Ítems del sidebar |
| `--text-fluid-sidebar-active` | Montserrat, clamp(1.3rem, 1.6vw, 1.5rem), 700, 1.3 | `var(--text-color)` | Ítem activo del sidebar |
| `--text-fluid-sidebar-base` | Montserrat, clamp(1rem, 1vw, 1.2rem), 600, 1.3 | `var(--text-color)` | Tamaño base del sidebar |
| `--text-fluid-calendar-month` | Montserrat, clamp(1.5rem, 2.5vw, 4.5rem), 700, 1.1 | `var(--color-text-primary)` | Mes en calendario |
| `--text-fluid-calendar-day` | Montserrat, clamp(3rem, 8vw, 7rem), 700, 1 | `var(--color-text-primary)` | Número de día en calendario |
| `--text-fluid-clock` | Montserrat, clamp(3.5vw, 5vw, 8vw), 700, 1 | `var(--color-text-primary)` | Reloj principal (responsive por breakpoints) |
| `--text-fluid-kpi` | Montserrat, clamp(0.65vw, 0.85vw, 1vw), 600, 1.2 | `var(--color-text-primary)` | Tamaño base para KPIs en dashboard (ajustable por breakpoints) |

## Tokens de impresión (pt)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-print-hero` | Montserrat, 38px, 800, 1.1 | `#000` | Título impreso muy grande (ficha/expediente) |
| `--text-print-title` | Montserrat, 16pt, 700, 1.1 | `#000` | Título de impresión (periodontograma/expediente) |
| `--text-print-subtitle` | Montserrat, 12pt, 600, 1.1 | `#333` | Subtítulos en impresión |
| `--text-print-body` | Montserrat, 10pt, 500, 1.1 | `#000` | Texto general en impresión |
| `--text-print-cell-sm` | Montserrat, 6.5pt, 500, 1.1 | `#000` | Celdas pequeñas en impresión |
| `--text-print-cell-xs` | Montserrat, 6pt, 500, 1.1 | `#000` | Celdas muy pequeñas en impresión |
| `--text-print-cell-xxs` | Montserrat, 5.2pt, 500, 1.1 | `#000` | Inputs ultra compactos en impresión |
| `--text-print-cell-xxxs` | Montserrat, 5pt, 500, 1.1 | `#000` | Texto mínimo en impresión |

## Tokens de código

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-code` | source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace, 0.9rem, 400, 1.5 | `var(--color-text-primary)` | Fragmentos de código o datos monoespaciados |

## Tokens de sistema y fallback

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-system-body` | -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif, 1rem, 400, 1.5 | `var(--color-text-primary)` | Texto base legacy o fallback global |

## Tokens de canvas (UI legacy)

| Variable | Propiedades CSS (font-family, size, weight, line-height) | Color recomendado | Uso correcto |
| --- | --- | --- | --- |
| `--text-canvas-label` | Arial, 11px, 400, 1.1 | `#9a9a9a` | Etiquetas en canvas legacy |
| `--text-canvas-menu` | Montserrat, 15px, 700, 1.1 | `#000` | Menús dibujados en canvas legacy |

## Cobertura por vista (resumen)

- Add Patient: `--text-display-xl` (título 2.5rem), `--text-body-lg` (1.2rem), `--text-body-xs`/`--text-label` (inputs 0.95rem), `--text-label-sm` (botones 0.9rem), `--text-body-sm` (1rem) y `--text-heading-sm` (1.6rem si aplica títulos secundarios).
- Patient Detail: `--text-display-hero` (nombre 3rem), `--text-display-xl` (títulos de bloque 2.5rem), `--text-heading-xl`/`--text-heading-sm`, `--text-body-default`, `--text-label`.
- Home (dashboard): `--text-fluid-clock`, `--text-fluid-kpi`, `--text-fluid-calendar-month`, `--text-fluid-calendar-day`, `--text-caption-md` (0.875rem), `--text-caption-sm` (0.85rem), `--text-body-sm` (1rem).
- Caja: `--text-label-strong`/`--text-body-strong` (títulos 1.1rem semibold), `--text-display-xl` (balance 2.5rem), `--text-body-sm` (0.9rem), `--text-data-xl` (iconos 24px).
- Estadística: `--text-caption` (0.88rem), `--text-caption-xs` (0.8rem), `--text-overline` (0.75rem), `--text-body-sm` (0.9rem), `--text-label-strong` (600).
- Consultas: `--text-heading-lg`/`--text-heading-sm`, `--text-body-default`, `--text-caption-sm` (0.85rem), `--text-caption-xs` (0.8rem).

## Reglas de uso

1. No aplicar tamaños o pesos hardcodeados en vistas nuevas.
2. Para variantes responsive, ajustar el contenedor o usar tokens fluidos (`--text-fluid-*`) antes de hardcodear un tamaño.
3. Si aparece un caso no cubierto, crear un token semántico nuevo antes de hardcodear el estilo.
