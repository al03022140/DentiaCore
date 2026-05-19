import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import defaultAvatar from "../../assets/images/icons/Profile Default.svg";
import "./styles/add-patient.css";
import { message, Modal, Steps } from 'antd';
import API from '../../shared/services/axios-instance';

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


// `step` indica en qué paso del wizard vive cada campo obligatorio. Sirve para
// (1) bloquear el avance entre pasos cuando faltan campos y (2) marcar el paso
// con una equis roja en el Steps de Antd.
const REQUIRED_FIELDS = [
  { path: ["documento", "tipo"], label: "Tipo de documento", step: 0 },
  { path: ["documento", "numero"], label: "Número de documento", step: 0 },
  { path: ["primer_nombre"], label: "Primer nombre", step: 0 },
  { path: ["apellido_paterno"], label: "Apellido paterno", step: 0 },
  { path: ["fecha_nacimiento"], label: "Fecha de nacimiento", step: 0 },
  { path: ["sexo"], label: "Sexo", step: 0 },
  { path: ["contacto", "telefono"], label: "Teléfono de contacto", step: 1 },
  { path: ["contacto", "direccion"], label: "Dirección", step: 1 },
  { path: ["contacto", "ciudad"], label: "Ciudad", step: 1 },
  { path: ["contacto", "entidad_federativa"], label: "Entidad federativa", step: 1 }
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Acepta el formato visible (espacios, guiones, paréntesis, +), pero
// requiere que tenga AL MENOS 7 dígitos reales; "((((((" o "+++--" se rechazan.
const PHONE_ALLOWED_CHARS = /^[\d\s\-+()]+$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

const validateFormat = (data) => {
  const errors = [];
  if (data.email && !EMAIL_REGEX.test(data.email)) {
    errors.push({ label: 'El correo electrónico tiene un formato inválido' });
  }
  const phone = data.contacto?.telefono;
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!PHONE_ALLOWED_CHARS.test(phone) || digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
      errors.push({ label: `El teléfono debe tener entre ${PHONE_MIN_DIGITS} y ${PHONE_MAX_DIGITS} dígitos` });
    }
  }
  if (data.fecha_nacimiento) {
    const birthDate = new Date(data.fecha_nacimiento);
    const today = new Date();
    if (birthDate > today) {
      errors.push({ label: 'La fecha de nacimiento no puede ser futura' });
    }
    const age = today.getFullYear() - birthDate.getFullYear();
    if (age > 120) {
      errors.push({ label: 'La fecha de nacimiento implica una edad mayor a 120 años' });
    }
  }
  return errors;
};

// Hace trim a todos los strings (recursivo) antes de enviar al backend.
// Evita que el usuario teclee "   " en campos required y le aparezca un error
// confuso del backend después de que el schema haga trim.
const trimStringsDeep = (value) => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(trimStringsDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = trimStringsDeep(v);
    return out;
  }
  return value;
};

class PatientValidationError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "PatientValidationError";
    this.details = details;
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

const getMissingFieldsForStep = (data, step) =>
  REQUIRED_FIELDS.filter(f => f.step === step && isEmptyValue(getValueFromPath(data, f.path)));

const showMissingFieldsModal = (missingFields, stepTitles) => {
  // Agrupar por paso para que el usuario vea claramente qué falta en cada sección.
  const grouped = {};
  for (const f of missingFields) {
    const stepKey = typeof f.step === 'number' ? f.step : 'otros';
    if (!grouped[stepKey]) grouped[stepKey] = [];
    grouped[stepKey].push(f);
  }
  Modal.error({
    title: "Completa los campos obligatorios",
    content: (
      <div>
        <p>Antes de continuar, revisa los campos pendientes:</p>
        {Object.entries(grouped).map(([stepKey, fields]) => {
          const title = stepTitles && stepTitles[stepKey] ? stepTitles[stepKey] : null;
          return (
            <div key={stepKey} style={{ marginBottom: 8 }}>
              {title && <strong>{title}:</strong>}
              <ul>{fields.map(({ label }) => <li key={label}>{label}</li>)}</ul>
            </div>
          );
        })}
      </div>
    )
  });
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

const WIZARD_STEPS = [
  { title: 'Identificación', description: 'Documento y datos personales' },
  { title: 'Contacto', description: 'Información de contacto' },
  { title: 'Emergencia', description: 'Contactos de emergencia y antecedentes' },
  { title: 'Médico', description: 'Encuesta médica' },
  { title: 'Hábitos', description: 'Higiene y evaluación dental' },
];

const AddPatient = ({ initialPatientData, onSave, onCancel }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [hoverUpload, setHoverUpload] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
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
        mordida_abierta: {
          presente: false,
          medidas: {
            anterior_mm: "",
            posterior_mm: "",
            derecha_mm: "",
            izquierda_mm: ""
          }
        }
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
            hipotiroidismo: false,
            cancer: false,
            esclerodermia: false,
            enfermedades_sangre: false,
            presion_arterial_alta: false,
            trastornos_coagulacion: false,
            hipertension: false
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
      estado: false,
      semanas_gestacion: ""
    },
  },
  
  // Sección específica para mujeres
  informacion_femenina: {
    ha_estado_embarazada: false,
    como_fue_parto: "",
    tipo_parto_detallado: "",
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

  // Estado para la imagen a recortar y parámetros del crop
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isCropping, setIsCropping] = useState(false);
  // Bloquea doble-submit: si el usuario hace doble-click en "Guardar" o se
  // impacienta y vuelve a tocar el botón, el segundo click no dispara un
  // segundo POST que terminaría en 409 por documento.numero duplicado.
  // El ref hace el chequeo sincrónico (los setState son asíncronos y dos
  // clicks muy seguidos pueden leer el valor anterior antes de que React
  // re-renderice); el state se conserva para refrescar el botón.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  // Pasos que el usuario intentó dejar (con campos faltantes) o que se
  // marcaron como erróneos al intentar guardar. Sólo estos muestran la equis
  // roja para no abrumar al usuario con errores antes de tocar la sección.
  const [attemptedSteps, setAttemptedSteps] = useState(() => new Set());
  
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
        situacion_laboral: typeof patientToEdit.situacion_laboral === 'string'
          ? {
              empleado: patientToEdit.situacion_laboral === "empleado",
              pensionado: patientToEdit.situacion_laboral === "pensionado",
              desempleado: patientToEdit.situacion_laboral === "desempleado",
              jubilado: patientToEdit.situacion_laboral === "jubilado"
            }
          : {
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
                hipotiroidismo: false,
                cancer: false,
                esclerodermia: false,
                enfermedades_sangre: false,
                presion_arterial_alta: false,
                trastornos_coagulacion: false,
                hipertension: false
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
            estado: false,
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
          tipo_parto_detallado: "",
          complicaciones_parto: "",
          fecha_ultimo_parto: "",
          menopausia: false,
          alteraciones_ciclo_menstrual: false,
          fecha_ultima_menstruacion: "",
          toma_anticonceptivos: false
        },
        photoURL: patientToEdit.photoURL || patientToEdit.fotoUrl || ""
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

  /** Borra la imagen cargada */
  const handleDeletePhoto = (e) => {
    e.stopPropagation();
    setFormData((prev) => ({ 
      ...prev, 
      photoURL: "",
      photoCrop: { x: 0, y: 0 },
      photoZoom: 1
    }));
    setImageSrc(null);
    setIsCropping(false);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
    
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
        photoCrop: crop,
        photoZoom: zoom
      }));
      
      setImageSrc(null);
      setIsCropping(false);
    } catch (error) {
      console.error("Error al recortar la imagen:", error);
    }
  }, [imageSrc, croppedAreaPixels, crop, zoom]);
  

  /** Maneja cambios en campos simples */
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
  
  /** Confirmar edición (envío de datos y navegación) */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmittingRef.current) return; // chequeo sincrónico contra doble click
    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      if (onSave) {
        try {
          await handleSavePatient();
          onSave();
        } catch (error) {
          console.error('Error al guardar paciente:', error);
        }
        return;
      }

      await handleSavePatient();
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  /** Función auxiliar para guardar paciente */
  const handleSavePatient = async () => {
    // Crear FormData para enviar archivos
    const formDataToSend = new FormData();

    // Trim recursivo de strings antes de validar y enviar — evita que campos
    // required acepten "   " en cliente y rebotan luego en el backend.
    const patientData = trimStringsDeep(formData);

    const missingFields = validateRequiredFields(patientData);
    if (missingFields.length > 0) {
      // Marcar como "intentados" todos los pasos donde hay campos faltantes,
      // para que se pinten con la equis roja al cerrar el modal.
      setAttemptedSteps(prev => {
        const next = new Set(prev);
        for (const f of missingFields) {
          if (typeof f.step === 'number') next.add(f.step);
        }
        return next;
      });
      showMissingFieldsModal(missingFields, stepTitlesByIndex);
      throw new PatientValidationError("Faltan campos obligatorios", missingFields);
    }

    const formatErrors = validateFormat(patientData);
    if (formatErrors.length > 0) {
      Modal.error({
        title: "Errores de formato",
        content: (
          <div>
            <p>Corrige los siguientes errores:</p>
            <ul>
              {formatErrors.map(({ label }, i) => (
                <li key={i}>{label}</li>
              ))}
            </ul>
          </div>
        )
      });
      throw new PatientValidationError("Errores de formato", formatErrors);
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
        res = await API.put(`/patients/${patientToEdit._id}`, formDataToSend);
      } else {
        // Crear nuevo paciente
        res = await API.post('/patients', formDataToSend);
      }

      const data = res.data;
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
      const status = err?.response?.status || err?.status;
      const description = err?.response?.data?.message || err?.message || 'Ocurrió un error inesperado.';

      Modal.error({
        title,
        content: (
          <div>
            <p>{description}</p>
            {status && (
              <p>
                <strong>Código:</strong> {status}
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
  

  const stepSections = [
    // Step 0: Identificación + Datos Personales
    <>
      <Identification formData={formData} handleNestedChange={handleNestedChange} />
      <PersonalData
        formData={formData}
        handleChange={handleChange}
        handleSituacionLaboralChange={(field) => {
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
    </>,
    // Step 1: Contacto
    <>
      <ContactInfo formData={formData} handleNestedChange={handleNestedChange} handleChange={handleChange} />
    </>,
    // Step 2: Emergencia + Antecedentes
    <>
      <EmergencyInfo formData={formData} handleArrayChange={handleArrayChange} setFormData={setFormData} />
      <FamilyHistory formData={formData} handleArrayChange={handleArrayChange} setFormData={setFormData} />
    </>,
    // Step 3: Encuesta Médica + Sección femenina
    <>
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
      <WomenSection formData={formData} setFormData={setFormData} handleDoubleNestedChange={handleDoubleNestedChange} />
    </>,
    // Step 4: Hábitos + Evaluación Dental
    <>
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
      <DentalEvaluation
        formData={formData}
        handleNestedChange={handleNestedChange}
        handleDoubleNestedChange={handleDoubleNestedChange}
        handleTripleNestedChange={handleTripleNestedChange}
      />
    </>,
  ];

  const isLastStep = currentStep === WIZARD_STEPS.length - 1;

  // Mapa { stepIndex: "Título del paso" } usado por el modal cuando agrupa
  // los campos faltantes por sección.
  const stepTitlesByIndex = WIZARD_STEPS.reduce((acc, s, idx) => {
    acc[idx] = s.title;
    return acc;
  }, {});

  // Intenta avanzar/saltar a `newStep`. Si se va hacia adelante valida todos
  // los pasos intermedios (incluyendo el actual): si alguno tiene campos
  // obligatorios faltantes, bloquea la navegación, los marca como `attempted`
  // (para que se pinten con la equis roja) y muestra el modal agrupado.
  const goToStep = (newStep) => {
    if (newStep === currentStep) return;
    if (newStep < currentStep) {
      // Retroceder es libre.
      setCurrentStep(newStep);
      return;
    }
    const missingByStep = [];
    const newAttempted = new Set(attemptedSteps);
    for (let i = currentStep; i < newStep; i++) {
      const missing = getMissingFieldsForStep(formData, i);
      newAttempted.add(i);
      if (missing.length > 0) missingByStep.push(...missing);
    }
    setAttemptedSteps(newAttempted);
    if (missingByStep.length > 0) {
      showMissingFieldsModal(missingByStep, stepTitlesByIndex);
      return;
    }
    setCurrentStep(newStep);
  };

  // Items del stepper con `status: 'error'` cuando el paso fue intentado y
  // aún tiene campos obligatorios faltantes. Antd pinta una equis roja.
  const wizardItems = WIZARD_STEPS.map((step, idx) => {
    const missing = getMissingFieldsForStep(formData, idx);
    const showError = attemptedSteps.has(idx) && missing.length > 0;
    return {
      title: step.title,
      description: step.description,
      ...(showError ? { status: 'error' } : {})
    };
  });

  return (
    <div className="add-patient-wrapper">
      <div className="scrollable-form">
        <div className="add-patient-container">
          <div className="add-patient-header">
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <div
                  className={`patient-photo-container ${isCropping ? 'cropping-mode' : ''}`}
                  onMouseEnter={() => { if (!isCropping) setHoverUpload(true); }}
                  onMouseLeave={() => { if (!isCropping) setHoverUpload(false); }}
                  onClick={() => {
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
                    className={`patient-photo${!formData.photoURL ? ' profile-default-avatar' : ''}`}
                  />
                )}
                <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleImageUpload} />
                {!isCropping && hoverUpload && (
                  <div className="upload-text"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (formData.photoURL && !imageSrc) {
                        setImageSrc(formData.photoURL);
                        setCrop(formData.photoCrop || { x: 0, y: 0 });
                        setZoom(formData.photoZoom || 1);
                        setIsCropping(true);
                      } else if (!formData.photoURL && !imageSrc) {
                        fileInputRef.current && fileInputRef.current.click();
                      }
                    }}
                  >
                    {formData.photoURL && !imageSrc ? "Editar" : "Subir"}
                  </div>
                )}
              </div>
              {imageSrc && (
                <div className="image-controls-outside">
                  <button className="trash-button" onClick={(e) => { e.stopPropagation(); handleDeletePhoto(e); }}>
                    Eliminar
                  </button>
                  <button className="crop-button" onClick={handleCropImage}>Guardar</button>
                </div>
              )}
            </div>
            <h2 className="add-patient-title">{patientToEdit ? "Editar Paciente" : "Agregar Paciente"}</h2>
          </div>

          <Steps
            current={currentStep}
            items={wizardItems}
            onChange={goToStep}
            className="add-patient-steps"
            size="small"
            responsive
          />

          <form className="add-patient-form" onSubmit={handleSubmit}>
            {stepSections[currentStep]}

            <div className="actions-container wizard-actions">
              {currentStep > 0 && (
                <button type="button" className="back-button" onClick={() => goToStep(currentStep - 1)}>
                  ← Anterior
                </button>
              )}
              {!isLastStep && (
                <button type="button" className="confirm-button" onClick={() => goToStep(currentStep + 1)}>
                  Siguiente →
                </button>
              )}
              {isLastStep && (
                <button type="submit" className="confirm-button" disabled={isSubmitting}>
                  {isSubmitting
                    ? (patientToEdit ? "Actualizando..." : "Guardando...")
                    : (patientToEdit ? "Actualizar Paciente" : "Guardar Paciente")}
                </button>
              )}
              <button type="button" onClick={handleCancelEdit} className="cancel-button" disabled={isSubmitting}>
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

