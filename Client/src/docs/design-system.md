# DentiaCore — Design System

> Fuente: **MediCare Admin Dashboard UI KIT**
> Figma: `figma.com/design/DXqn10kdViIi9kWXPqYHvd`
> Nodo de referencia: `6207-11879` (Shift Schedule)

---

## 1. Paleta de Colores

### 1.1 Colores Base

| Token                      | Valor (Light)         | Uso                                  |
|----------------------------|-----------------------|--------------------------------------|
| `--figma-color-dark`       | `#030213`             | Botones primarios, badges "Active"   |
| `--figma-color-dark-text`  | `#0a0a0a`             | Texto de headings, números           |
| `--figma-text-primary`     | `#0a0a0a`             | Texto principal                      |
| `--figma-text-secondary`   | `#717182`             | Texto secundario, descripciones      |
| `--figma-text-on-dark`     | `#ffffff`             | Texto sobre fondos oscuros           |

### 1.2 Fondos

| Token                      | Valor (Light)         | Uso                                  |
|----------------------------|-----------------------|--------------------------------------|
| `--figma-bg-page`          | `#f5f5f7`             | Fondo general de la página           |
| `--figma-bg-card`          | `#ffffff`             | Cards, contenedores, paneles         |
| `--figma-bg-neutral`       | `#ececf0`             | Tab bar, avatares                    |
| `--figma-bg-neutral-alt`   | `#eceef2`             | Badge "Scheduled"                    |
| `--figma-bg-input`         | `#f3f3f5`             | Inputs, date pickers                 |

### 1.3 Bordes

| Token                        | Valor                  | Uso                                |
|------------------------------|------------------------|------------------------------------|
| `--figma-border-default`     | `rgba(0,0,0,0.1)`     | Borde de cards, list items, badges |
| `--figma-border-transparent` | `rgba(0,0,0,0)`       | Borde invisible (estado inactivo)  |

### 1.4 Estados Semánticos

| Estado      | Background               | Texto                         |
|-------------|--------------------------|-------------------------------|
| **Active**  | `--figma-color-active-bg` (#030213) | `--figma-color-active-text` (#fff) |
| **Scheduled** | `--figma-color-scheduled-bg` (#eceef2) | `--figma-color-scheduled-text` (#030213) |

### 1.5 Iconos por Categoría

| Categoría | Color token            | Hex       |
|-----------|------------------------|-----------|
| Morning   | `--figma-icon-morning` | `#f59e0b` |
| Evening   | `--figma-icon-evening` | `#ef4444` |
| Night     | `--figma-icon-night`   | `#3b82f6` |

---

## 2. Tipografía

### Font Family
```
Inter (400 Regular, 500 Medium, 600 Semibold, 700 Bold)
```
> En DentiaCore se usa **Montserrat**. Mapear los pesos de Inter a Montserrat:
> Inter Regular → Montserrat Light/Regular, Inter Medium → Montserrat Medium, etc.

### Escala Tipográfica

| Nombre           | Token CSS                   | Size  | Weight  | Line-Height | Tracking  | Uso                              |
|------------------|-----------------------------|-------|---------|-------------|-----------|----------------------------------|
| **Stat**         | `--figma-text-stat`         | 24px  | Bold    | 32px        | 0.07px    | Números grandes en stat cards    |
| **Heading LG**   | `--figma-text-heading-lg`   | 18px  | Regular | 28px        | -0.44px   | Títulos de sección (Morning Shift) |
| **Heading MD**   | `--figma-text-heading-md`   | 16px  | Medium  | 16px        | -0.31px   | Subtítulos (Shift Schedule)      |
| **Body**         | `--figma-text-body`         | 16px  | Medium  | 24px        | -0.31px   | Nombres de personal              |
| **Body Regular** | `--figma-text-body-regular` | 16px  | Regular | 24px        | —         | Descripciones largas             |
| **Label**        | `--figma-text-label`        | 14px  | Medium  | 20px        | -0.15px   | Headers de card, botones, tabs   |
| **Caption**      | `--figma-text-caption`      | 14px  | Regular | 20px        | -0.15px   | Info secundaria, horarios        |
| **Small**        | `--figma-text-small`        | 12px  | Medium  | 16px        | —         | Badges, time ranges              |
| **Small Regular**| `--figma-text-small-regular`| 12px  | Regular | 16px        | —         | Subtextos, fechas                |

---

## 3. Espaciado

### Sistema de Espaciado

| Token              | Valor  | Uso                                      |
|--------------------|--------|------------------------------------------|
| `--figma-space-2xs`| 6px    | Gaps en grids internos                   |
| `--figma-space-xs` | 8px    | Gap entre botones, elementos inline      |
| `--figma-space-sm` | 9px    | Padding interno de tabs/badges           |
| `--figma-space-md` | 12px   | Gap entre list items                     |
| `--figma-space-base`| 13px  | Padding lateral de list items            |
| `--figma-space-lg` | 16px   | Gap entre cards en grid, gap en badges   |
| `--figma-space-xl` | 18px   | Padding vertical de headers              |
| `--figma-space-2xl`| 24px   | Padding general de contenedores, secciones|

### Gaps entre Componentes

| Token                 | Valor | Uso                                |
|-----------------------|-------|------------------------------------|
| `--figma-gap-card-grid` | 16px  | Gap entre stat cards (grid 4 col)  |
| `--figma-gap-section`   | 24px  | Gap entre secciones principales    |
| `--figma-gap-list-item`| 12px  | Gap entre filas de lista           |
| `--figma-gap-inline`   | 8px   | Gap entre elementos en una línea   |
| `--figma-gap-badge`    | 16px  | Gap entre horario y badge          |

---

## 4. Border Radius

| Token              | Valor  | Uso                                       |
|--------------------|--------|-------------------------------------------|
| `--figma-radius-sm`| 8px    | Botones, badges, inputs, date pickers     |
| `--figma-radius-md`| 10px   | List items, filas de tabla                |
| `--figma-radius-lg`| 14px   | Cards, contenedores, tab bar              |
| `--figma-radius-full`| 9999px | Avatares circulares                     |

---

## 5. Sombras

| Token                  | Valor                                                        | Uso           |
|------------------------|--------------------------------------------------------------|---------------|
| `--figma-shadow-card`  | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`  | Cards, paneles|
| `--figma-shadow-elevated`| `0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)` | Modales, dropdowns |

---

## 6. Patrones de Componentes

### 6.1 Stat Card

```
┌─────────────────────────┐
│  Heading (Label, 14px)  │  ← padding: 24px
│                         │
│  Number (Stat, 24px)    │
│  Subtitle (Small, 12px) │
└─────────────────────────┘
```

**Propiedades:**
- Background: `--figma-bg-card`
- Border: `1px solid var(--figma-border-default)`
- Border radius: `--figma-radius-lg` (14px)
- Padding: `--figma-space-2xl` (24px)
- Grid: 4 columnas, gap `--figma-gap-card-grid` (16px)
- Height: 156px

**CSS Pattern:**
```css
.stat-card {
  background: var(--figma-bg-card);
  border: var(--figma-stat-card-border);
  border-radius: var(--figma-stat-card-radius);
  padding: var(--figma-stat-card-padding);
}
.stat-card__title { font: var(--figma-text-label); color: var(--figma-text-primary); }
.stat-card__value { font: var(--figma-text-stat); color: var(--figma-text-primary); }
.stat-card__subtitle { font: var(--figma-text-small-regular); color: var(--figma-text-secondary); }
```

---

### 6.2 Botón Primario

```
┌─────────────────────┐
│  [+]  Add Shift     │  ← bg oscuro, texto blanco
└─────────────────────┘
```

**Propiedades:**
- Background: `--figma-color-dark` (#030213)
- Color texto: `--figma-text-on-dark` (white)
- Font: `--figma-text-label` (Inter Medium 14px)
- Height: `--figma-btn-height` (36px)
- Border radius: `--figma-radius-sm` (8px)
- Padding: `--figma-btn-padding` (8px 16px)
- Icono: 16x16px a la izquierda

**CSS Pattern:**
```css
.btn-figma-primary {
  background: var(--figma-color-active-bg);
  color: var(--figma-color-active-text);
  font: var(--figma-text-label);
  height: var(--figma-btn-height);
  padding: var(--figma-btn-padding);
  border: none;
  border-radius: var(--figma-btn-radius);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: var(--figma-gap-inline);
}
```

---

### 6.3 Botón Secundario / Ghost

```
┌─────────────────────┐
│  Date Picker        │  ← bg neutral, sin borde visible
└─────────────────────┘
```

**Propiedades:**
- Background: `--figma-bg-input` (#f3f3f5)
- Border: `1px solid transparent`
- Height: 36px
- Border radius: `--figma-radius-sm` (8px)

---

### 6.4 Badge / Status Chip

**Active:**
```
┌──────────┐
│  Active  │  ← bg oscuro, texto blanco
└──────────┘
```
- Background: `--figma-color-active-bg`
- Color: `--figma-color-active-text`
- Font: `--figma-text-small`
- Height: `--figma-badge-height` (22px)
- Padding: `--figma-badge-padding` (3px 9px)
- Radius: `--figma-badge-radius` (8px)

**Scheduled:**
```
┌──────────────┐
│  Scheduled   │  ← bg neutral, texto oscuro
└──────────────┘
```
- Background: `--figma-color-scheduled-bg`
- Color: `--figma-color-scheduled-text`
- Mismo tamaño y forma

**CSS Pattern:**
```css
.badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: var(--figma-badge-height);
  padding: var(--figma-badge-padding);
  border-radius: var(--figma-badge-radius);
  font: var(--figma-text-small);
  white-space: nowrap;
}
.badge--active {
  background: var(--figma-color-active-bg);
  color: var(--figma-color-active-text);
}
.badge--scheduled {
  background: var(--figma-color-scheduled-bg);
  color: var(--figma-color-scheduled-text);
}
```

---

### 6.5 Tab Bar (Segmented Control)

```
┌─────────────────────────────────────────────┐
│ [ List View ]  Grid View    Calendar View   │
└─────────────────────────────────────────────┘
```

**Container:**
- Background: `--figma-bg-neutral` (#ececf0)
- Height: `--figma-tab-height` (36px)
- Radius: `--figma-radius-lg` (14px)

**Tab activo:**
- Background: `--figma-bg-card` (white)
- Border: `1px solid transparent`
- Radius: `--figma-radius-lg` (14px)
- Height: `--figma-tab-inner-height` (29px)

**Tab inactivo:**
- Background: transparent
- Border: `1px solid transparent`

**Texto de tabs:** `--figma-text-label` (Inter Medium 14px)

---

### 6.6 Avatar (Iniciales)

```
  ┌─────┐
  │ DSJ │  ← Círculo con iniciales
  └─────┘
```

**Propiedades:**
- Size: `--figma-avatar-size` (40x40px)
- Background: `--figma-bg-neutral` (#ececf0)
- Border radius: `--figma-avatar-radius` (circle)
- Font: `--figma-text-body-regular` (Inter Regular 16px)
- Color: `--figma-text-primary`
- Text align: center

---

### 6.7 List Item (Staff Row)

```
┌───────────────────────────────────────────────────────────────┐
│ [Avatar]  Name                              Time    [Badge]   │
│           Role • Department                 Date              │
└───────────────────────────────────────────────────────────────┘
```

**Propiedades:**
- Border: `1px solid var(--figma-border-default)`
- Radius: `--figma-list-item-radius` (10px)
- Height: `--figma-list-item-height` (70px)
- Padding: `--figma-list-item-padding` (1px 13px)
- Layout: flex, justify-between, align-center
- Gap entre avatar y texto: 12px
- Gap entre hora y badge: `--figma-gap-badge` (16px)

**Tipografía interna:**
- Nombre: `--figma-text-body` (16px Medium)
- Rol: `--figma-text-caption` (14px Regular) color `--figma-text-secondary`
- Horario: `--figma-text-label` (14px Medium) aligned right
- Fecha: `--figma-text-small-regular` (12px Regular) color `--figma-text-secondary`

---

### 6.8 Section Card (con header + lista)

```
┌───────────────────────────────────────────────────────────────┐
│  [Icon]  Section Title       Time Range Badge                 │
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│  [List Item 1]                                                │
│  [List Item 2]                                                │
│  [List Item 3]                                                │
└───────────────────────────────────────────────────────────────┘
```

**Container:**
- Background: `--figma-bg-card`
- Border: `1px solid var(--figma-border-default)`
- Radius: `--figma-radius-lg` (14px)

**Header:**
- Height: `--figma-section-header-height` (70px)
- Padding: `--figma-section-header-padding` (24px)
- Layout: flex, gap 8px, align-center
- Icono: 20x20px
- Título: `--figma-text-heading-lg` (18px)
- Time badge: `--figma-text-small` con border `--figma-border-default`, radius 8px

**Content area:**
- Padding: 0 24px
- Gap: `--figma-gap-list-item` (12px)

---

## 7. Layouts

### 7.1 Grid de Stat Cards
```
| Card 1 | Card 2 | Card 3 | Card 4 |
```
- `display: grid`
- `grid-template-columns: repeat(4, 1fr)`
- `gap: var(--figma-gap-card-grid)` (16px)

### 7.2 Layout Principal
```
┌────────────────────────────────────────────┐
│  [Stat Card Grid — 4 columns]             │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  Page Header + Tabs + Actions       │  │
│  │  ────────────────────────────────── │  │
│  │  [Section Card: Morning]            │  │
│  │  [Section Card: Evening]            │  │
│  │  [Section Card: Night]              │  │
│  └──────────────────────────────────────┘  │
└────────────────────────────────────────────┘
```
- Gap entre stat grid y content card: `--figma-gap-section` (24px)
- Layout general: flex column

---

## 8. Mapeo Figma → variables.css (DentiaCore)

Para integrar los tokens de Figma con las variables existentes del proyecto:

| Token Figma                  | Variable DentiaCore existente       | Acción    |
|------------------------------|-------------------------------------|-----------|
| `--figma-text-primary`       | `--color-text-strong` (#1a1a1a)     | Similar   |
| `--figma-text-secondary`     | `--color-text-secondary` (#555)     | Ajustar   |
| `--figma-bg-card`            | `--color-bg-white` (#fff)           | Idéntico  |
| `--figma-bg-page`            | `--color-bg-light` (#f9f9f9)        | Similar   |
| `--figma-bg-neutral`         | `--color-neutral-210` (#eaeaea)     | Cercano   |
| `--figma-border-default`     | `--color-black-10` (rgba 0,0,0,0.1)| Idéntico  |
| `--figma-radius-sm` (8px)    | `--border-radius-lg` (8px)          | Idéntico  |
| `--figma-radius-lg` (14px)   | `--card-border-radius` (1rem/16px)  | Cercano   |
| `--figma-btn-height` (36px)  | N/A — agregar                       | Nuevo     |
| `--figma-badge-height` (22px)| N/A — agregar                       | Nuevo     |
| `--figma-avatar-size` (40px) | N/A — agregar                       | Nuevo     |

---

## 9. Checklist de Implementación

Al crear un nuevo componente o pantalla, verificar:

- [ ] Usa tokens de `figma-tokens.css` para colores, espaciado y tipografía
- [ ] Cards tienen border `--figma-border-default` y radius `--figma-radius-lg`
- [ ] Botones primarios siguen el patrón de `--figma-color-active-bg`
- [ ] Badges usan los estilos de Active/Scheduled definidos
- [ ] Avatares son 40px circle con fondo `--figma-bg-neutral`
- [ ] Texto principal usa `--figma-text-primary`, secundario `--figma-text-secondary`
- [ ] Espaciado entre secciones es `--figma-gap-section` (24px)
- [ ] Espaciado entre items de lista es `--figma-gap-list-item` (12px)
- [ ] Soporte dark mode (los tokens se invierten automáticamente)
