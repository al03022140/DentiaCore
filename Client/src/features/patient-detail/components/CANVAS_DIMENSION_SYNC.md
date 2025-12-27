# Sincronización de Dimensiones del Canvas del Periodontograma

## Problema Identificado

Anteriormente, existía una discrepancia entre las dimensiones del canvas visual del periodontograma y las dimensiones utilizadas para la captura de imágenes:

- **Canvas Visual**: Dimensiones responsivas (`width: 100%`, `height: auto`, `max-width: 100%`)
- **Captura de Imagen**: Dimensiones fijas (1489 x 903.455 píxeles)

Esto causaba que las imágenes capturadas no coincidieran exactamente con lo que el usuario veía en pantalla.

## Solución Implementada

### 1. Función Auxiliar `getVisualCanvasDimensions()`

Se creó una función centralizada que:
- Obtiene las dimensiones reales del contenedor visual del periodontograma
- Resta el padding del contenedor (30px total: 15px cada lado)
- Mantiene dimensiones mínimas como respaldo (1489 x 903.455)
- Proporciona logging detallado para debugging

```javascript
const getVisualCanvasDimensions = () => {
  const periodontogramContainer = document.querySelector('.periodontogram-canvas-container');
  let canvasWidth = 1489; // Valor por defecto
  let canvasHeight = 903.455; // Valor por defecto
  
  if (periodontogramContainer) {
    const containerRect = periodontogramContainer.getBoundingClientRect();
    canvasWidth = Math.max(containerRect.width - 30, 1489);
    canvasHeight = Math.max(containerRect.height - 30, 903.455);
  }
  
  return { width: canvasWidth, height: canvasHeight };
};
```

### 2. Actualización de Funciones de Captura

Ambas funciones de captura ahora utilizan la función auxiliar:

#### `capturePeriodontogramImage()`
- Obtiene dimensiones del canvas visual antes de crear el canvas de captura
- Usa estas dimensiones para el renderizado directo

#### `captureSectionImage()`
- Obtiene dimensiones del canvas visual antes de usar html2canvas
- Asegura que html2canvas use las mismas dimensiones que el canvas visual

### 3. Beneficios de la Sincronización

1. **Coherencia Visual**: La imagen capturada coincide exactamente con lo que ve el usuario
2. **Responsividad**: Se adapta automáticamente a diferentes tamaños de pantalla
3. **Mantenibilidad**: Código centralizado y reutilizable
4. **Debugging**: Logging detallado para identificar problemas
5. **Robustez**: Valores por defecto como respaldo

## Archivos Modificados

- `periodontogram-section.jsx`: Implementación de la sincronización
- `CANVAS_DIMENSION_SYNC.md`: Esta documentación

## Casos de Uso

### Pantallas Grandes (>1489px)
- Canvas visual: Se adapta al contenedor
- Captura: Usa las dimensiones reales del contenedor

### Pantallas Pequeñas (<1489px)
- Canvas visual: Se adapta al contenedor
- Captura: Usa las dimensiones mínimas (1489x903.455) para mantener calidad

### Sin Contenedor Visible
- Captura: Usa dimensiones por defecto como respaldo
- Logging: Advierte sobre el problema

## Consideraciones Técnicas

1. **Padding**: Se resta 30px (15px cada lado) del contenedor para obtener el área real del canvas
2. **Dimensiones Mínimas**: Se mantienen las dimensiones originales como mínimo para preservar la calidad
3. **Timing**: La función se ejecuta justo antes de la captura para obtener dimensiones actuales
4. **Compatibilidad**: Funciona con ambos métodos de captura (canvas directo y html2canvas)

## Testing

Para verificar que la sincronización funciona correctamente:

1. Redimensionar la ventana del navegador
2. Capturar una imagen del periodontograma
3. Verificar en la consola los logs de dimensiones
4. Comparar la imagen capturada con el canvas visual

Los logs mostrarán:
```
📐 Dimensiones del contenedor visual: [width]x[height]
📐 Dimensiones calculadas: [width]x[height]
📐 Usando dimensiones sincronizadas para [section]: [width]x[height]
```