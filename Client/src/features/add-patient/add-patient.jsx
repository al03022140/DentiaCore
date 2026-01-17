import React, { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css"; // Asegúrate de tener el CSS
import defaultAvatar from "../../assets/images/avatars/UserNot.png";
import "./styles/add-patient.css";
import { useLocation } from "react-router-dom";
import { message, Modal } from 'antd';

// Importar componentes de las secciones
import Identification from './sections/identification';
import PersonalData from './sections/personal-data';
import ContactInfo from './sections/contact-info';
import EmergencyInfo from './sections/emergency-info';
import FamilyHistory from './sections/family-history';
import Medic from './sections/medic';
import Habits from './sections/habits';
import DentalEvaluation from './sections/dental-evaluation';
import WomenSection from './sections/women-section';


const API_URL = import.meta.env.VITE_API_URL;

const REQUIRED_FIELDS = [
  { path: ["primer_nombre"], label: "Primer nombre" },
  { path: ["apellido_paterno"], label: "Apellido paterno" },
  { path: ["fecha_nacimiento"], label: "Fecha de nacimiento" },
  { path: ["sexo"], label: "Sexo" },
  { path: ["contacto", "telefono"], label: "Teléfono de contacto" },
  { path: ["contacto", "direccion"], label: "Dirección" },
  { path: ["contacto", "ciudad"], label: "Ciudad" },
  { path: ["contacto", "entidad_federativa"], label: "Entidad federativa" }
];

class PatientValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "PatientValidationError";
    this.details = details;
    this.code = "PATIENT_VALIDATION_ERROR";
  }
}

const isEmptyValue = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

const getValueFromPath = (data, path) =>
  path.reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), data);

const validateRequiredFields = (data) =>
  REQUIRED_FIELDS.filter(({ path }) => isEmptyValue(getValueFromPath(data, path)));

const showMissingFieldsModal = (missingFields) => {
  Modal.error({
    title: "Completa los campos obligatorios",
    content: (
      <div>
        <p>Antes de continuar, revisa los campos pendientes:</p>
        <ul>
          {missingFields.map(({ label }) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>
    )
  });
};

const parseErrorResponse = async (response) => {
  try {
    const raw = await response.text();
    if (!raw) {
      return `El servidor respondió ${response.status}`;
    }

    try {
      const data = JSON.parse(raw);
      if (Array.isArray(data?.errors)) {
        return data.errors
          .map((err) => (typeof err === "string" ? err : err?.message || err?.detail))
          .filter(Boolean)
          .join("\n");
      }
      return data?.message || data?.error || raw;
    } catch {
      return raw;
    }
  } catch (error) {
    console.error("No se pudo interpretar la respuesta de error:", error);
    return "Ocurrió un error inesperado";
  }
};

/**
 * Función auxiliar para crear una Image desde un URL
 */
const createImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

/**
 * Función auxiliar que recorta la imagen usando la zona en pixeles obtenida.
 * Devuelve la imagen recortada en formato JPEG (con fondo blanco).
 */
const getCroppedImg = async (imageSrc, pixelCrop) => {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  const ctx = canvas.getContext("2d");

  // Dibuja la imagen recortada en el canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  // Retorna la imagen en formato JPEG
  return canvas.toDataURL("image/jpeg");
};

const AddPatient = ({ isEditing: propIsEditing, initialPatientData, onSave, onCancel }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(propIsEditing || true);
  const [hoverUpload, setHoverUpload] = useState(false);
  const fileInputRef = useRef(null);
  const patientToEdit = initialPatientData || location.state?.patientToEdit || null;

  // Estado inicial del formulario
  const [formData, setFormData] = useState({
    documento: {
      tipo: "",
      numero: "",
    },

    primer_nombre: "",
    otros_nombres: "",
    apellido_paterno: "",
    apellido_materno: "",
    fecha_nacimiento: "",
    sexo: "",
    estado_civil: "",
    nacionalidad: "",
    lugar_nacimiento: "",
    escolaridad: "",
    edad: null,
    ocupacion: "",
    
    situacion_laboral: {
      empleado: false,
      pensionado: false,
      desempleado: false,
      jubilado: false
    },
    
    email: "",
    
    contacto: {
      telefono: "",
      direccion: "",
      codigo_postal: "",
      colonia: "",
      numero_interior: "",
      numero_exterior: "",
      ciudad: "",
      entidad_federativa: ""
    },
   
    contactos_emergencia: [], 
   
    antecedentes_heredo_familiares: [],
    
    evaluacion_dental_oclusal: {
      linea_sonrisa: {
        longitud_labio: "",
        muestra_reborde_al_sonreir: false
      },
      clasificacion_kennedy: false,
      encia_insertada: "",
      apertura_bucal: "",
      evaluacion_atm: {
        molestias_atm: false,
        ruidos: {
          derecha: "",
          izquierda: ""
        },
        dolor: {
          derecha: false,
          izquierda: false
        },
        movilidad_mandibular: {
          protrusiva: false,
          lateralidad: {
            lateral_derecho: "",
            lateral_izquierdo: ""
          }
        }
      },
      evaluacion_oclusal: {
        clasificacion_angle: "",
        contacto_dentario_oclusion_centrica: false,
        proteccion_canina: "",
        proteccion_anterior: false,
        funcion_grupo: "",
        proteccion_mutua: "",
        sobremordida: false,
        mordida_cruzada: false,
        traslape_horizontal_mm: "",
        traslape_vertical_mm: "",
        mordida_abierta: false
      }
    },
   
    encuesta_medica: {
      informacion_general: {
        considera_su_salud: "",
        ultimo_examen_medico: {
          estado: false,
          fecha: ""
        },
        en_tratamiento_medico: {
          estado: false,
          explicacion: ""
        },
        hospitalizado_anteriormente: {
          estado: false,
          razon: ""
        },
        // Nuevas preguntas de salud general
        se_cansa_facilmente: false,
        cambios_peso_recientes: false,
        dolores_perdida_oido: false,
        sangrado_excesivo_cortes: false,
        hemorragias_espontaneas: false,
        seropositivo_vih: false,
        dolores_cabeza_frecuentes: false,
        observaciones_salud_general: "",
        enfermedad_grave_adicional: {
          opcion_principal: "no", // "no" o "otras_enfermedades"
          enfermedades_seleccionadas: {
            trastornos_neurologicos: false,
            enfermedades_autoinmunes: false,
            enfermedades_respiratorias: false,
            problemas_renales: false,
            problemas_hepaticos: false,
            tratamiento_oncologico: false,
            sinusitis: false,
            convulsiones_epilepsia: false,
            tuberculosis: false,
            enfisema: false,
            asma: false,
            tos_persistente_sangre: false,
            rinitis_alergica: false,
            fiebre_reumatica: false,
            soplo_cardiaco: false,
            angina_pecho: false,
            presion_arterial_baja: false,
            gastritis_ulcera: false,
            enfermedades_rinon: false,
            transplantes_organos: false,
            marcapasos: false,
            dano_valvulas: false,
            infarto_corazon: {
              checked: false,
              fecha: ""
            },
            retencion_liquidos: false,
            arteriosclerosis: false,
            diabetes: {
              checked: false,
              tipo: ""
            },
            hepatitis: {
              checked: false,
              tipo: ""
            },
            hipertiroidismo: false,
            paratiroidismo: false,
            transfusiones_sanguineas: false,
            radiaciones_cara_cuello: false,
            osteogenesis_imperfecta: false,
            enfermedad_paget: false,
            osteoporosis: false,
            lupus_eritematoso: false,
            tratamiento_inmuno_supresion: false,
            insuficiencia_renal: false,
            enfermedades_familiares: false,
            anemia: false,
            sida: false,
            arteroesclerosis: false,
            hipotiroidismo: false,
            cancer: false,
            esclerodermia: false,
            enfermedades_sangre: false,
            presion_arterial_alta: false
          }
        }
      },
      
      habitos_estilo_vida: {
        tabaquismo: {
          estado: false,
          frecuencia: ""
        },
        alcoholismo: {
          estado: false,
          frecuencia: ""
        }
      },
      


      medicacion: [], // En lugar de una cadena, debe ser un array de objetos {nombre, dosis, frecuencia}
    cirugias_previas: [], // Array de strings según el backend
    alergias: [], // En lugar de una cadena, debe ser un array de objetos {sustancia, reaccion}
    ansiedad_dental: {
      nivel: "",
      experiencia_negativa_previa: false
    },
    embarazo: {
      semanas_gestacion: ""
    },
  },
  
  // Sección específica para mujeres
  informacion_femenina: {
    ha_estado_embarazada: false,
    como_fue_parto: "",
    complicaciones_parto: "",
    fecha_ultimo_parto: "",
    menopausia: false,
    alteraciones_ciclo_menstrual: false,
    fecha_ultima_menstruacion: "",
    toma_anticonceptivos: false
  },
    habitos_higiene: {
      cepillo_dental: false,
      frecuencia_cambio_cepillo: "",
      seda_dental: "",
      numero_cepillados_dia: "",
      tipo_cepillo: "",
      uso_enjuague_bucal: {
        usa: false,
        tipo: "",
        frecuencia: ""
      },
      consumo_azucar: {
        nivel: "",
        tipo: [],
      },
      mastica_chicle: {
        tipo: "",
        frecuencia: "",
      },
      bruxismo: {
        presente: false,
        uso_placa: false,
      },
      otros: "",
      // Nuevos campos de historial odontológico
      fecha_ultima_visita_odontologo: "",
      perdida_dientes: false,
      acumulacion_alimento_dientes: false,
      tumores_agrandamientos_boca: false,
      llagas_ulceras_aftas_frecuentes: false,
      enfermedad_periodontal: false,
      sangrado_encias: false,
      tratamiento_ortodoncia_previo: false,
      problemas_tratamientos_previos: {
        estado: false,
        explicacion: ""
      },
      dolores_cerca_oido: false,
      motivo_consulta_odontologica: ""
    },
    
    photoURL: "",
  });

  useEffect(() => {
    if (patientToEdit) {
      // Transformar situacion_laboral si viene como string del backend
      const transformedPatient = { ...patientToEdit };
      
      if (typeof patientToEdit.situacion_laboral === 'string') {
        transformedPatient.situacion_laboral = {
          empleado: patientToEdit.situacion_laboral === "empleado",
          pensionado: patientToEdit.situacion_laboral === "pensionado",
          desempleado: patientToEdit.situacion_laboral === "desempleado",
          jubilado: patientToEdit.situacion_laboral === "jubilado"
        };
      }
      
      setFormData(transformedPatient);
    }
  }, [patientToEdit]);
  

  // Estado para la imagen a recortar y parámetros del crop
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  
  // Estados para preservar la posición del crop y zoom
  const [savedCrop, setSavedCrop] = useState({ x: 0, y: 0 });
  const [savedZoom, setSavedZoom] = useState(1);

  // useEffect para inicializar el formulario con datos del paciente cuando se está editando
  useEffect(() => {
    if (patientToEdit) {
      setFormData({
        documento: {
          tipo: patientToEdit.documento?.tipo || "",
          numero: patientToEdit.documento?.numero || "",
        },
        primer_nombre: patientToEdit.primer_nombre || "",
        otros_nombres: patientToEdit.otros_nombres || "",
        apellido_paterno: patientToEdit.apellido_paterno || "",
        apellido_materno: patientToEdit.apellido_materno || "",
        fecha_nacimiento: patientToEdit.fecha_nacimiento || "",
        sexo: patientToEdit.sexo || "",
        estado_civil: patientToEdit.estado_civil || "",
        nacionalidad: patientToEdit.nacionalidad || "",
        lugar_nacimiento: patientToEdit.lugar_nacimiento || "",
        escolaridad: patientToEdit.escolaridad || "",
        edad: patientToEdit.edad || null,
        ocupacion: patientToEdit.ocupacion || "",
        situacion_laboral: {
          empleado: patientToEdit.situacion_laboral?.empleado || false,
          pensionado: patientToEdit.situacion_laboral?.pensionado || false,
          desempleado: patientToEdit.situacion_laboral?.desempleado || false,
          jubilado: patientToEdit.situacion_laboral?.jubilado || false
        },
        email: patientToEdit.email || "",
        contacto: {
          telefono: patientToEdit.contacto?.telefono || "",
          direccion: patientToEdit.contacto?.direccion || "",
          codigo_postal: patientToEdit.contacto?.codigo_postal || "",
          colonia: patientToEdit.contacto?.colonia || "",
          numero_interior: patientToEdit.contacto?.numero_interior || "",
          numero_exterior: patientToEdit.contacto?.numero_exterior || "",
          ciudad: patientToEdit.contacto?.ciudad || "",
          entidad_federativa: patientToEdit.contacto?.entidad_federativa || ""
        },
        contactos_emergencia: patientToEdit.contactos_emergencia || [],
        antecedentes_heredo_familiares: patientToEdit.antecedentes_heredo_familiares || [],
        evaluacion_dental_oclusal: patientToEdit.evaluacion_dental_oclusal || {
          linea_sonrisa: {
            longitud_labio: "",
            muestra_reborde_al_sonreir: false
          },
          clasificacion_kennedy: false,
          encia_insertada: "",
          apertura_bucal: "",
          evaluacion_atm: {
            molestias_atm: false,
            ruidos: {
              derecha: "",
              izquierda: ""
            },
            dolor: {
              derecha: false,
              izquierda: false
            },
            movilidad_mandibular: {
              protrusiva: false,
              lateralidad: {
                lateral_derecho: "",
                lateral_izquierdo: ""
              }
            }
          },
          evaluacion_oclusal: {
            clasificacion_angle: "",
            contacto_dentario_oclusion_centrica: false,
            proteccion_canina: "",
            proteccion_anterior: false,
            funcion_grupo: "",
            proteccion_mutua: "",
            sobremordida: false,
            mordida_cruzada: false,
            traslape_horizontal_mm: "",
            traslape_vertical_mm: "",
            mordida_abierta: false
          }
        },
        encuesta_medica: patientToEdit.encuesta_medica || {
          informacion_general: {
            considera_su_salud: "",
            ultimo_examen_medico: {
              estado: false,
              fecha: ""
            },
            en_tratamiento_medico: {
              estado: false,
              explicacion: ""
            },
            hospitalizado_anteriormente: {
              estado: false,
              razon: ""
            },
            se_cansa_facilmente: false,
            cambios_peso_recientes: false,
            dolores_perdida_oido: false,
            sangrado_excesivo_cortes: false,
            hemorragias_espontaneas: false,
            seropositivo_vih: false,
            dolores_cabeza_frecuentes: false,
            observaciones_salud_general: "",
            enfermedad_grave_adicional: {
              opcion_principal: "no",
              enfermedades_seleccionadas: {
                trastornos_neurologicos: false,
                enfermedades_autoinmunes: false,
                enfermedades_respiratorias: false,
                problemas_renales: false,
                problemas_hepaticos: false,
                tratamiento_oncologico: false,
                sinusitis: false,
                convulsiones_epilepsia: false,
                tuberculosis: false,
                enfisema: false,
                asma: false,
                tos_persistente_sangre: false,
                rinitis_alergica: false,
                fiebre_reumatica: false,
                soplo_cardiaco: false,
                angina_pecho: false,
                presion_arterial_baja: false,
                gastritis_ulcera: false,
                enfermedades_rinon: false,
                transplantes_organos: false,
                marcapasos: false,
                dano_valvulas: false,
                infarto_corazon: {
                  checked: false,
                  fecha: ""
                },
                retencion_liquidos: false,
                arteriosclerosis: false,
                diabetes: {
                  checked: false,
                  tipo: ""
                },
                hepatitis: {
                  checked: false,
                  tipo: ""
                },
                hipertiroidismo: false,
                paratiroidismo: false,
                transfusiones_sanguineas: false,
                radiaciones_cara_cuello: false,
                osteogenesis_imperfecta: false,
                enfermedad_paget: false,
                osteoporosis: false,
                lupus_eritematoso: false,
                tratamiento_inmuno_supresion: false,
                insuficiencia_renal: false,
                enfermedades_familiares: false,
                anemia: false,
                sida: false,
                arteroesclerosis: false,
                hipotiroidismo: false,
                cancer: false,
                esclerodermia: false,
                enfermedades_sangre: false,
                presion_arterial_alta: false
              }
            }
          },
          habitos_estilo_vida: {
            tabaquismo: {
              estado: false,
              frecuencia: ""
            },
            alcoholismo: {
              estado: false,
              frecuencia: ""
            }
          },
          medicacion: [],
          cirugias_previas: [],
          alergias: [],
          ansiedad_dental: {
            nivel: "",
            experiencia_negativa_previa: false
          },
          embarazo: {
            semanas_gestacion: ""
          }
        },
        habitos_higiene: patientToEdit.habitos_higiene || {
          cepillo_dental: false,
          frecuencia_cambio_cepillo: "",
          seda_dental: "",
          numero_cepillados_dia: "",
          tipo_cepillo: "",
          uso_enjuague_bucal: {
            usa: false,
            tipo: "",
            frecuencia: ""
          },
          consumo_azucar: {
            nivel: "",
            tipo: []
          },
          mastica_chicle: {
            tipo: "",
            frecuencia: ""
          },
          bruxismo: {
            presente: false,
            uso_placa: false
          },
          otros: "",
          fecha_ultima_visita_odontologo: "",
          perdida_dientes: false,
          acumulacion_alimento_dientes: false,
          tumores_agrandamientos_boca: false,
          llagas_ulceras_aftas_frecuentes: false,
          enfermedad_periodontal: false,
          sangrado_encias: false,
          tratamiento_ortodoncia_previo: false,
          problemas_tratamientos_previos: {
            estado: false,
            explicacion: ""
          },
          dolores_cerca_oido: false,
          motivo_consulta_odontologica: ""
        },
        informacion_femenina: patientToEdit.informacion_femenina || {
          ha_estado_embarazada: false,
          como_fue_parto: "",
          complicaciones_parto: "",
          fecha_ultimo_parto: "",
          menopausia: false,
          alteraciones_ciclo_menstrual: false,
          fecha_ultima_menstruacion: "",
          toma_anticonceptivos: false
        },
        photoURL: patientToEdit.foto || patientToEdit.fotoUrl || ""
      });
    }
  }, [patientToEdit]);

  /** Manejo de carga de imagen */
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result);
        setIsCropping(true); // Activar modo de recorte automáticamente
        // No actualizar formData.photoURL hasta que se confirme el recorte
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditPhoto = () => {
    if (formData.photoURL) {
      setImageSrc(formData.photoURL);
      
      // Restaurar la posición guardada del crop y zoom desde formData
      setCrop(formData.photoCrop || savedCrop || { x: 0, y: 0 });
      setZoom(formData.photoZoom || savedZoom || 1);
      
      // Mantener el hover desactivado solo temporalmente
      setHoverUpload(false);
      
      setIsCropping(true);
    }
  };


  /** Borra la imagen cargada */
  const handleDeletePhoto = (e) => {
    e.stopPropagation(); // Evita que se dispare el evento del input de archivo
    setFormData((prev) => ({ 
      ...prev, 
      photoURL: "",
      // Limpiar también las coordenadas guardadas
      photoCrop: { x: 0, y: 0 },
      photoZoom: 1
    }));
    setImageSrc(null);
    setIsCropping(false); // Asegurar que el modo de recorte se cierre
    setCrop({ x: 0, y: 0 }); // Resetear crop
    setZoom(1); // Resetear zoom
    setCroppedAreaPixels(null); // Limpiar área recortada
    
    // Resetear también los valores guardados
    setSavedCrop({ x: 0, y: 0 });
    setSavedZoom(1);
    
    // Limpiar el input de archivo
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  

  /** Se dispara cuando se completa el crop; guarda la zona recortada en pixeles */
  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  /** Recorta la imagen usando la función auxiliar getCroppedImg */
  const handleCropImage = useCallback(async () => {
    try {
      const croppedImage = await getCroppedImg(imageSrc, croppedAreaPixels);
      setFormData((prev) => ({ 
        ...prev, 
        photoURL: croppedImage,
        // Guardar las coordenadas junto con la imagen
        photoCrop: crop,
        photoZoom: zoom
      }));
      
      // Guardar la posición actual del crop y zoom
      setSavedCrop(crop);
      setSavedZoom(zoom);
      
      setImageSrc(null); // Asegura que el recorte finalice
      setIsCropping(false); // Desactiva el modo de recorte
    } catch (error) {
      console.error("Error al recortar la imagen:", error);
    }
  }, [imageSrc, croppedAreaPixels, crop, zoom]);
  

  /** Maneja cambios en campos simples */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  /** Maneja cambios en checkboxes */
  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: checked }));
  };

  /** Maneja cambios en campos anidados */
  const handleNestedChange = (parentKey, field, value) => {
    setFormData((prev) => ({
      ...prev,
      [parentKey]: {
        ...prev[parentKey], // Mantiene los valores actuales de "contacto"
        [field]: value, // Actualiza solo el campo modificado
      },
    }));
  };
  

  /** Maneja cambios en campos doblemente anidados */
  const handleDoubleNestedChange = (parentKey, subKey, field, value) => {
    setFormData((prevState) => {
      return {
        ...prevState,
        [parentKey]: {
          ...prevState[parentKey],
          [subKey]: {
            ...prevState[parentKey]?.[subKey], // Se usa optional chaining para evitar errores
            [field]: value,
          },
        },
      };
    });
  };
  
  /** Maneja cambios en campos triplemente anidados */
  const handleTripleNestedChange = (parentKey, subKey, field, subField, value) => {
    setFormData((prevState) => {
      // Si solo se pasan 4 parámetros, el último es el valor
      if (value === undefined) {
        value = subField;
        subField = null;
      }
      
      return {
        ...prevState,
        [parentKey]: {
          ...prevState[parentKey],
          [subKey]: {
            ...prevState[parentKey]?.[subKey],
            ...(subField ? {
              [field]: {
                ...prevState[parentKey]?.[subKey]?.[field],
                [subField]: value
              }
            } : {
              [field]: value
            })
          },
        },
      };
    });
  };

  // Función específica para manejar cambios en enfermedad_grave_adicional
  const handleEnfermedadGraveChange = (field, value) => {
    if (field === 'opcion_principal') {
      setFormData((prevState) => ({
        ...prevState,
        encuesta_medica: {
          ...prevState.encuesta_medica,
          informacion_general: {
            ...prevState.encuesta_medica.informacion_general,
            enfermedad_grave_adicional: {
              ...prevState.encuesta_medica.informacion_general.enfermedad_grave_adicional,
              opcion_principal: value,
              // Si cambia a "no", resetear todas las enfermedades seleccionadas
              ...(value === 'no' && {
                enfermedades_seleccionadas: {
                  ...Object.keys(prevState.encuesta_medica.informacion_general.enfermedad_grave_adicional.enfermedades_seleccionadas).reduce((acc, key) => {
                    if (typeof prevState.encuesta_medica.informacion_general.enfermedad_grave_adicional.enfermedades_seleccionadas[key] === 'object') {
                      acc[key] = { estado: false, fecha: '', tipo: '' };
                    } else {
                      acc[key] = false;
                    }
                    return acc;
                  }, {})
                }
              })
            }
          }
        }
      }));
    } else {
      // Para cambios en enfermedades_seleccionadas
      setFormData((prevState) => ({
        ...prevState,
        encuesta_medica: {
          ...prevState.encuesta_medica,
          informacion_general: {
            ...prevState.encuesta_medica.informacion_general,
            enfermedad_grave_adicional: {
              ...prevState.encuesta_medica.informacion_general.enfermedad_grave_adicional,
              enfermedades_seleccionadas: {
                ...prevState.encuesta_medica.informacion_general.enfermedad_grave_adicional.enfermedades_seleccionadas,
                [field]: value
              }
            }
          }
        }
      }));
    }
  };
  
  /** Maneja cambios en situación laboral */
  const handleSituacionLaboralChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      situacion_laboral: {
        empleado: value === "empleado",
        pensionado: value === "pensionado",
        desempleado: value === "desempleado",
        jubilado: value === "jubilado"
      },
    }));
  };
  
  const handleToggleAzucar = (item) => {
    setFormData((prev) => {
      const { tipo } = prev.habitos_higiene.consumo_azucar;
      const newArray = tipo.includes(item)
        ? tipo.filter((i) => i !== item)
        : [...tipo, item];
      return {
        ...prev,
        habitos_higiene: {
          ...prev.habitos_higiene,
          consumo_azucar: { ...prev.habitos_higiene.consumo_azucar, tipo: newArray },
        },
      };
    });
  };

  /** Confirmar edición (envío de datos y navegación) */
  const handleSubmit = async (e) => {
    e.preventDefault();

    // Si se está usando como modal, usar la función onSave proporcionada
    if (onSave) {
      try {
        await handleSavePatient();
        onSave();
      } catch (error) {
        console.error('Error al guardar paciente:', error);
      }
      return;
    }

    // Lógica original para cuando no se usa como modal
    await handleSavePatient();
  };

  /** Función auxiliar para guardar paciente */
  const handleSavePatient = async () => {
    // Crear FormData para enviar archivos
    const formDataToSend = new FormData();
    
    // Crear una copia del formData para no modificar el estado directamente
    const patientData = { ...formData };

    const missingFields = validateRequiredFields(patientData);
    if (missingFields.length > 0) {
      showMissingFieldsModal(missingFields);
      throw new PatientValidationError("Faltan campos obligatorios", missingFields);
    }
    
    // Asegurarse de que la fecha de nacimiento esté en formato ISO para el servidor
    if (patientData.fecha_nacimiento && typeof patientData.fecha_nacimiento === 'string') {
      // Si la fecha viene del input type="date", ya estará en formato YYYY-MM-DD
      // No necesitamos hacer nada adicional
    }

    // Si hay una foto en base64, convertirla a archivo
    if (patientData.photoURL && patientData.photoURL.startsWith('data:image/')) {
      try {
        // Convertir base64 a blob
        const response = await fetch(patientData.photoURL);
        const blob = await response.blob();
        
        // Crear archivo desde el blob
        const file = new File([blob], 'patient-photo.jpg', { type: 'image/jpeg' });
        formDataToSend.append('foto', file);
        
        // Remover photoURL del objeto de datos ya que se enviará como archivo
        delete patientData.photoURL;
      } catch (error) {
        console.error('Error al procesar la imagen:', error);
        message.error('Error al procesar la imagen');
        throw error;
      }
    }

    // Agregar todos los datos del paciente como JSON string
    formDataToSend.append('patientData', JSON.stringify(patientData));

    try {
      let res;
      if (patientToEdit) {
        // Actualizar paciente existente
        res = await fetch(`${API_URL}/api/patients/${patientToEdit._id}`, {
          method: "PUT",
          body: formDataToSend,
        });
      } else {
        // Crear nuevo paciente
        res = await fetch(`${API_URL}/api/patients`, {
          method: "POST",
          body: formDataToSend,
        });
      }

      if (!res.ok) {
        const serverDetails = await parseErrorResponse(res);
        const error = new Error(serverDetails || `El servidor respondió ${res.status}`);
        error.name = 'PatientSaveError';
        error.status = res.status;
        error.userMessage = serverDetails || `El servidor respondió ${res.status}`;
        throw error;
      }

      const data = await res.json();
      message.success(patientToEdit ? "Paciente actualizado correctamente" : "Paciente guardado correctamente");

      // Solo navegar si no se está usando como modal
      if (!onSave) {
        const patientId = data._id || data.patient?._id || patientToEdit?._id;
        if (patientId) {
          navigate(`/patient/${patientId}`);
        } else {
          message.warning("Operación completada pero no se encontró el ID del paciente.");
        }
      }
    } catch (err) {
      if (err instanceof PatientValidationError) {
        console.warn("Validación de paciente incompleta:", err.details);
        throw err;
      }

      console.error("Error procesando paciente:", err);
      const title = patientToEdit ? 'No se pudo actualizar el paciente' : 'No se pudo guardar el paciente';
      const description = err?.userMessage || err?.message || 'Ocurrió un error inesperado.';

      Modal.error({
        title,
        content: (
          <div>
            <p>{description}</p>
            {err?.status && (
              <p>
                <strong>Código:</strong> {err.status}
              </p>
            )}
          </div>
        )
      });
      throw err;
    }
  };


  /** Cancelar edición */
  const handleCancelEdit = (e) => {
    e.preventDefault();
    
    // Si se está usando como modal, usar la función onCancel proporcionada
    if (onCancel) {
      onCancel();
      return;
    }
    
    // Lógica original para cuando no se usa como modal
    if (patientToEdit) {
      // Si estamos editando, volver al detalle del paciente
      navigate(`/patient/${patientToEdit._id}`);
    } else {
      // Si estamos creando, volver a la página principal
      navigate('/');
    }
  };

  const handleAddItem = (section, newItem) => {
    setFormData((prev) => ({
      ...prev,
      encuesta_medica: {
        ...prev.encuesta_medica,
        [section]: [...prev.encuesta_medica[section], newItem],
      },
    }));
  };
  
  const handleRemoveItem = (section, indexToRemove) => {
    setFormData((prev) => ({
      ...prev,
      encuesta_medica: {
        ...prev.encuesta_medica,
        [section]: prev.encuesta_medica[section].filter((_, i) => i !== indexToRemove),
      },
    }));
  };

  const handleArrayChange = (arrayKey, index, field, value, parentKey = null) => {
    setFormData((prev) => {
      let updatedArray;
  
      if (parentKey) {
        const parentObject = prev[parentKey] || {}; // Asegurar que el objeto padre existe
        const currentArray = Array.isArray(parentObject[arrayKey]) ? [...parentObject[arrayKey]] : []; // Asegurar que es un array
  
        updatedArray = [...currentArray];
        updatedArray[index] = { ...(updatedArray[index] || {}), [field]: value }; // Evitar acceso a undefined
  
        return {
          ...prev,
          [parentKey]: {
            ...parentObject,
            [arrayKey]: updatedArray,
          },
        };
      } else {
        const currentArray = Array.isArray(prev[arrayKey]) ? [...prev[arrayKey]] : []; // Asegurar que es un array
        updatedArray = [...currentArray];
        updatedArray[index] = { ...(updatedArray[index] || {}), [field]: value };
  
        return {
          ...prev,
          [arrayKey]: updatedArray,
        };
      }
    });
  };
  

  return (
    <div className="add-patient-wrapper">
      <div className="scrollable-form">
        <div className="add-patient-container">
          {/* Sección para subir y ajustar la foto */}
          <div className="add-patient-header">
            {/* Contenedor padre con position: relative */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              {/* Contenedor del círculo de la foto */}
              <div 
                  className={`patient-photo-container ${isCropping ? 'cropping-mode' : ''}`}
                  onMouseEnter={() => {
                    if (!isCropping) {
                      setHoverUpload(true);
                    }
                  }}
                  onMouseLeave={() => {
                    if (!isCropping) {
                      setHoverUpload(false);
                    }
                  }}
                  onClick={() => {
                    // Solo abrir el selector de archivos si no hay foto y no está en modo recorte
                    if (!formData.photoURL && !imageSrc && !isCropping) {
                      fileInputRef.current && fileInputRef.current.click();
                    }
                  }}
              >
                {imageSrc && isCropping ? (
                  <div className="image-container">
                    <Cropper
                      image={imageSrc}
                      crop={crop}
                      zoom={zoom}
                      aspect={1}
                      onCropChange={setCrop}
                      onZoomChange={setZoom}
                      onCropComplete={onCropComplete}
                      showGrid={true}
                      zoomWithScroll={true}
                      gridSize={20}
                      gridColor="rgba(255, 255, 255, 0.8)"
                      cropShape="round"
                      objectFit="cover"
                    />
                  </div>
                ) : (
                  <img
                    src={formData.photoURL || defaultAvatar}
                    alt="Avatar del paciente"
                    className="patient-photo"
                  />
                )}
                {/* Input oculto para seleccionar archivo */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleImageUpload}
                />
                {/* Overlay para "Subir" o "Editar" */}
                {!isCropping && hoverUpload && (
                  <div className="upload-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (formData.photoURL && !imageSrc) {
                        // Activar directamente el modo de edición/recorte para ajustar zoom y posición
                        setImageSrc(formData.photoURL);
                        // Restaurar la posición guardada del crop y zoom desde formData o usar valores por defecto
                        setCrop(formData.photoCrop || savedCrop.x !== 0 || savedCrop.y !== 0 ? (formData.photoCrop || savedCrop) : { x: 0, y: 0 });
                        setZoom(formData.photoZoom || savedZoom !== 1 ? (formData.photoZoom || savedZoom) : 1);
                        setIsCropping(true);
                        // No desactivar el hover aquí para permitir interacción inmediata
                      } else if (!formData.photoURL && !imageSrc) {
                        fileInputRef.current && fileInputRef.current.click();
                      }
                    }}
                  >
                    {formData.photoURL && !imageSrc ? "Editar" : "Subir"}
                  </div>
                )}

              </div>
                
              {/* Botones para recortar y eliminar, solo cuando hay imagen cargada */}
              {imageSrc && (
                <div className="image-controls-outside">
                  {/* Botón de eliminar - solo visible cuando hay foto real (no vacía, no defaultAvatar, y es una URL válida) */}
                  {((formData.photoURL && formData.photoURL.trim() !== "" && formData.photoURL !== defaultAvatar && (formData.photoURL.startsWith('data:image/') || formData.photoURL.startsWith('http') || formData.photoURL.startsWith('/uploads'))) || imageSrc) && (
                    <button 
                      className="trash-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePhoto(e);
                      }}
                    >
                      🗑️ Eliminar
                    </button>
                  )}
                  <button className="crop-button" onClick={handleCropImage}>
                    Guardar
                  </button>
                </div>
              )}
            </div>

            <h2 className="add-patient-title">{patientToEdit ? "Editar Paciente" : "Agregar Paciente"}</h2>
          </div>

          {/* Formulario principal */ }
          <form className="add-patient-form" onSubmit={handleSubmit}>
              {/* SECCIÓN: IDENTIFICACIÓN */}
              <Identification 
                formData={formData}
                handleNestedChange={handleNestedChange}
              />

              {/* SECCIÓN: DATOS PERSONALES */}
              <PersonalData 
                formData={formData}
                handleChange={handleChange}
                handleSituacionLaboralChange={(field, checked) => {
                  setFormData(prev => ({
                    ...prev,
                    situacion_laboral: {
                      empleado: field === 'empleado',
                      pensionado: field === 'pensionado',
                      desempleado: field === 'desempleado',
                      jubilado: field === 'jubilado'
                    }
                  }));
                }}
              />

              {/* SECCIÓN: INFORMACIÓN DE CONTACTO */}
              <ContactInfo 
                formData={formData}
                handleNestedChange={handleNestedChange}
                handleChange={handleChange}
              />

              {/* SECCIÓN: CONTACTO DE EMERGENCIA */}
              <EmergencyInfo 
                formData={formData}
                handleArrayChange={handleArrayChange}
                setFormData={setFormData}
              />

              {/* SECCIÓN: ANTECEDENTES HEREDO FAMILIARES */}
              <FamilyHistory 
                formData={formData}
                handleArrayChange={handleArrayChange}
                setFormData={setFormData}
              />

              {/* SECCIÓN: ENCUESTA MÉDICA */}
              <Medic 
                formData={formData}
                setFormData={setFormData}
                handleTripleNestedChange={handleTripleNestedChange}
                handleDoubleNestedChange={handleDoubleNestedChange}
                handleRemoveItem={handleRemoveItem}
                handleAddItem={handleAddItem}
                handleEnfermedadGraveChange={handleEnfermedadGraveChange}
                handleArrayChange={handleArrayChange}
              />

              {/* SECCIÓN: HÁBITOS DE HIGIENE BUCODENTAL */}
              <Habits 
                formData={formData}
                handleNestedChange={handleNestedChange}
                handleDoubleNestedChange={handleDoubleNestedChange}
                handleToggleAzucar={(tipo) => {
                  setFormData(prev => {
                    const currentTipos = prev.habitos_higiene.consumo_azucar.tipo || [];
                    const newTipos = currentTipos.includes(tipo)
                      ? currentTipos.filter(t => t !== tipo)
                      : [...currentTipos, tipo];
                    return {
                      ...prev,
                      habitos_higiene: {
                        ...prev.habitos_higiene,
                        consumo_azucar: {
                          ...prev.habitos_higiene.consumo_azucar,
                          tipo: newTipos
                        }
                      }
                    };
                  });
                }}
              />

              {/* SECCIÓN: EVALUACIÓN DENTAL Y OCLUSAL */}
              <DentalEvaluation 
                formData={formData}
                handleNestedChange={handleNestedChange}
                handleDoubleNestedChange={handleDoubleNestedChange}
                handleTripleNestedChange={handleTripleNestedChange}
              />

              {/* SECCIÓN ESPECÍFICA PARA MUJERES - Solo aparece si el sexo es Femenino */}
              <WomenSection 
                formData={formData}
                setFormData={setFormData}
                handleDoubleNestedChange={handleDoubleNestedChange}
              />
              

                {/* BOTONES DE ACCIÓN */}
                <div className="actions-container">
                  <button type="submit" className="confirm-button">
                    {patientToEdit ? "Actualizar Paciente" : "Guardar Paciente"}
                  </button>
                  <button onClick={handleCancelEdit} className="cancel-button">
                    Cancelar
                  </button>
              </div>
            </form>
          
        </div>
      </div>
    </div>
  
  );
};

export default AddPatient;

