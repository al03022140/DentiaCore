// DEPRECATED: Ad-hoc value fix for legacy 'tipo' usage. Not used anymore.
// Kept as a stub to avoid accidental re-introduction.

export function tipoValueFix() {
  throw new Error("tipo-value-fix.js is deprecated and must not be imported. Remove the import.");
}

export default null;

// Código corregido para el manejo de tipoValue en handleSaveOdontograma
const handleSaveOdontograma = async (event) => {
  const { tipo, data, patientId: eventPatientId } = event.detail;
  
  if (tipo === 'clinico') {
    try {
      console.log('Procesando guardado de odontograma clínico (solo datos)...', data);
      
      // Usar los daños detectados para el odontograma clínico
      const datosToSend = detectedClinicalDamages.length > 0 
        ? detectedClinicalDamages 
        : (Array.isArray(data) ? data : (data.datos || []));
      
      console.log('Datos formateados para enviar:', datosToSend);
      
      // Formatear los datos para mostrar nombres descriptivos en la tabla
      const formattedData = datosToSend.map(item => {
        // Asegurarnos de que cada item tenga el formato correcto para la tabla
        // y que el campo 'tipo' siempre tenga un valor válido
        let tipoValue;
        
        // Si el tipo es un número, convertirlo usando mapDamageIdToName
        if (typeof item.tipo === 'number') {
          tipoValue = mapDamageIdToName(item.tipo);
        } else {
          tipoValue = item.tipo || item.name || item.damage || item.value || 
                    (item.damages && item.damages.length > 0 ? 
                      item.damages.map(d => d.name || d.value).join(", ") : 
                      "Daño aplicado");
        }
                        
        // Si ya existe _damageType y _damages, intentar reconstruir el tipo si está vacío
        if ((!tipoValue || tipoValue === "") && item._damageType) {
          tipoValue = item._damageType;
        }
        
        if ((!tipoValue || tipoValue === "") && item._damages && item._damages.length > 0) {
          tipoValue = item._damages.map(d => d.name || d.value).join(", ");
        }
        
        // Asegurar que tipo nunca esté vacío
        if (!tipoValue || tipoValue === "") {
          tipoValue = "Daño aplicado";
        }
        
        return {
          diente: item.diente || item.tooth || item.id || "No especificado",
          tipo: tipoValue,
          fecha: item.fecha || new Date().toLocaleDateString(),
          // Conservamos datos adicionales que puedan ser útiles para reconstruir el tipo
          _damageType: item._damageType || item.damageType || "",
          _damages: item._damages || item.damages || []
        };
      });
      
      // Resto del código...
    } catch (error) {
      console.error("Error al guardar el odontograma clínico:", error);
    }
  }
};