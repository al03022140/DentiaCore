import { useState, useCallback, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";
import defaultAvatar from "../../assets/images/icons/Profile Default.svg";
import "./styles/add-patient.css";
import { message, Modal, Steps } from 'antd';
import API from '../../shared/services/axios-instance';
import { dataUrlToBlob } from '../../shared/utils/dataUrl';
import { invalidatePatientsCache } from '../../shared/services/patient-service';
import { useDraftPersistence } from '../../shared/hooks/useDraftPersistence';

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

// TLD de >=2 letras y sin caracteres raros/emojis en local-part o dominio.
// Debe mantenerse alineado con el validador del modelo (Server/models/patient.js).
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const EMAIL_MAX_LEN = 254; // RFC 5321
// Número de documento: alfanumérico + guion, mínimo 3 chars (rechaza emojis,
// símbolos puros y entradas de 1-2 chars claramente inválidas).
const DOC_NUMERO_REGEX = /^[A-Za-z0-9-]+$/;
// Acepta el formato visible (espacios, guiones, paréntesis, +), pero
// requiere que tenga AL MENOS 7 dígitos reales; "((((((" o "+++--" se rechazan.
const PHONE_ALLOWED_CHARS = /^[\d\s\-+()]+$/;
const PHONE_MIN_DIGITS = 7;
const PHONE_MAX_DIGITS = 15;

// Deep-merge: parte de `base` (plantilla por defecto con TODA la estructura
// anidada) y superpone `source` (datos del paciente, posiblemente parciales).
// Gana `source`; los arrays se reemplazan; las sub-claves anidadas que faltan
// en `source` se conservan de `base`. Se usa al inicializar la edición para que
// registros viejos sin algún sub-objeto (embarazo, consumo_azucar, etc.) no
// rompan lecturas profundas a.b.c en las secciones.
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const deepMerge = (base, source) => {
  if (!isPlainObject(base) || !isPlainObject(source)) {
    return source === undefined ? base : source;
  }
  const out = { ...base };
  for (const key of Object.keys(source)) {
    out[key] = isPlainObject(base[key]) && isPlainObject(source[key])
      ? deepMerge(base[key], source[key])
      : source[key];
  }
  return out;
};

const validateFormat = (data) => {
  const errors = [];
  if (data.email && (!EMAIL_REGEX.test(data.email) || data.email.length > EMAIL_MAX_LEN)) {
    errors.push({ label: 'El correo electrónico tiene un formato inválido' });
  }
  const docNumero = data.documento?.numero ? String(data.documento.numero).trim() : '';
  if (docNumero && (docNumero.length < 3 || !DOC_NUMERO_REGEX.test(docNumero))) {
    errors.push({ label: 'El número de documento debe tener al menos 3 caracteres y solo letras, números o guiones' });
  }
  const phone = data.contacto?.telefono;
  if (phone) {
    const digits = String(phone).replace(/\D/g, '');
    if (!PHONE_ALLOWED_CHARS.test(phone) || digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
      errors.push({ label: `El teléfono debe tener entre ${PHONE_MIN_DIGITS} y ${PHONE_MAX_DIGITS} dígitos` });
    }
  }
  if (data.fecha_nacimiento) {
    // Parsear YYYY-MM-DD en hora LOCAL (no UTC) para alinear con el backend y
    // evitar el corrimiento de un día en zonas con offset negativo. Edad por
    // calendario, no resta cruda de años.
    const raw = String(data.fecha_nacimiento).slice(0, 10);
    const md = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const birthDate = md
      ? new Date(Number(md[1]), Number(md[2]) - 1, Number(md[3]))
      : new Date(data.fecha_nacimiento);
    const today = new Date();
    if (!Number.isNaN(birthDate.getTime())) {
      if (birthDate > today) {
        errors.push({ label: 'La fecha de nacimiento no puede ser futura' });
      }
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) age--;
      if (age > 120) {
        errors.push({ label: 'La fecha de nacimiento implica una edad mayor a 120 años' });
      }
    }
  }
  // Fechas clínicas femeninas: ni el último parto ni la última menstruación
  // pueden ser futuros (dato incoherente en el expediente NOM-024). El `max`
  // del input es evadible por teclado/pegado, así que se valida aquí también.
  const fem = data.informacion_femenina || {};
  const parseLocalDate = (s) => {
    const raw = String(s).slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(s);
  };
  const femDateChecks = [
    ['fecha_ultimo_parto', 'La fecha del último parto no puede ser futura'],
    ['fecha_ultima_menstruacion', 'La fecha de última menstruación no puede ser futura'],
  ];
  for (const [field, label] of femDateChecks) {
    if (fem[field]) {
      const d = parseLocalDate(fem[field]);
      if (!Number.isNaN(d.getTime()) && d > new Date()) {
        errors.push({ label });
      }
    }
  }
  // Filas incompletas: el backend descarta en silencio contactos de emergencia
  // y antecedentes a los que les falta un campo requerido. Avisar para no
  // perder datos sin que el usuario lo note (vería "guardado correctamente").
  if (Array.isArray(data.contactos_emergencia)) {
    data.contactos_emergencia.forEach((c, i) => {
      if (!c) return;
      const vals = [c.nombre, c.parentesco, c.telefono];
      const some = vals.some((v) => v && String(v).trim());
      const all = vals.every((v) => v && String(v).trim());
      if (some && !all) {
        errors.push({ label: `Contacto de emergencia #${i + 1}: completa nombre, parentesco y teléfono (o elimínalo).` });
      }
    });
  }
  if (Array.isArray(data.antecedentes_heredo_familiares)) {
    data.antecedentes_heredo_familiares.forEach((a, i) => {
      if (!a) return;
      const p = a.parentesco && String(a.parentesco).trim();
      const ant = a.antecedentes && String(a.antecedentes).trim();
      const esp = a.parentesco_especifico && String(a.parentesco_especifico).trim();
      if ((p || ant || esp) && (!p || !ant || (p === 'Otros' && !esp))) {
        errors.push({ label: `Antecedente familiar #${i + 1}: completa parentesco y antecedente${p === 'Otros' ? ', y especifica el parentesco' : ''} (o elimínalo).` });
      }
    });
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

// Paths a campos cuyo tipo en el schema es Date o Number. Como los inputs
// HTML siempre devuelven string (los `date` vacíos retornan ""), Mongoose
// arroja CastError al intentar guardar "" en un Date/Number. Convertimos a
// `null` antes de serializar para que el schema use su default.
const EMPTY_TO_NULL_PATHS = [
  ['encuesta_medica', 'informacion_general', 'ultimo_examen_medico', 'fecha'],
  ['encuesta_medica', 'embarazo', 'semanas_gestacion'],
  ['informacion_femenina', 'fecha_ultimo_parto'],
  ['informacion_femenina', 'fecha_ultima_menstruacion'],
  ['habitos_higiene', 'fecha_ultima_visita_odontologo']
];

const normalizeEmptyDateAndNumber = (data) => {
  const cloned = JSON.parse(JSON.stringify(data));
  for (const path of EMPTY_TO_NULL_PATHS) {
    let cursor = cloned;
    for (let i = 0; i < path.length - 1; i++) {
      if (cursor == null || typeof cursor !== 'object') { cursor = null; break; }
      cursor = cursor[path[i]];
    }
    if (cursor && typeof cursor === 'object') {
      const key = path[path.length - 1];
      if (cursor[key] === '' || cursor[key] === undefined) {
        cursor[key] = null;
      }
    }
  }
  return cloned;
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

  // Fondo blanco: JPEG no soporta transparencia, así que sin esto los PNG
  // transparentes salen con fondo negro al convertir.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pixelCrop.width, pixelCrop.height);

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
  // En el flujo modal, el padre puede desmontar este componente dentro de
  // `onSave()`. El `finally` del submit corre después y haría setState sobre
  // un componente desmontado (warning de React). Trackeamos el mount status
  // para skipear setState cuando ya no estamos.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);
  // Pasos que el usuario intentó dejar (con campos faltantes) o que se
  // marcaron como erróneos al intentar guardar. Sólo estos muestran la equis
  // roja para no abrumar al usuario con errores antes de tocar la sección.
  const [attemptedSteps, setAttemptedSteps] = useState(() => new Set());
  // Campos con error de validación: Set de strings "path.joined" (e.g. "documento.tipo")
  const [invalidFields, setInvalidFields] = useState(() => new Set());
  // Incrementar para forzar re-mount de la clase y reiniciar la animación shake
  const [shakeKey, setShakeKey] = useState(0);

  // ── Persistencia de borrador (SÓLO alta de paciente nuevo) ──────────────
  // Este formulario es muy largo y se perdía por completo si el usuario
  // recargaba, cerraba la pestaña o su sesión expiraba antes de guardar.
  // Autosalvamos en localStorage (PHI-aware: retención 24h + limpieza en
  // logout, via useDraftPersistence) y ofrecemos recuperarlo al volver. NO en
  // edición: esos datos vienen del servidor. Se excluye photoURL del snapshot
  // (base64 pesado → cuota de localStorage; la foto se re-sube si hace falta).
  const isEditing = !!patientToEdit;
  const initialFormSnapshotRef = useRef(null);
  if (initialFormSnapshotRef.current === null) {
    initialFormSnapshotRef.current = JSON.stringify(formData);
  }
  const draftRecoveryHandledRef = useRef(false);
  const { loadDraft, clearDraft } = useDraftPersistence({
    key: 'add-patient-new',
    enabled: !isEditing,
    isDirty: () => !isEditing && JSON.stringify(formData) !== initialFormSnapshotRef.current,
    getSnapshot: () => {
      const { photoURL: _omit, ...rest } = formData;
      return rest;
    },
  });
  const clearDraftRef = useRef(clearDraft);
  useEffect(() => { clearDraftRef.current = clearDraft; }, [clearDraft]);

  // Al montar en modo alta, ofrecer recuperar un borrador previo (una sola vez).
  useEffect(() => {
    if (isEditing || draftRecoveryHandledRef.current) return;
    draftRecoveryHandledRef.current = true;
    const saved = loadDraft();
    if (!saved?.data) return;
    Modal.confirm({
      title: 'Borrador sin guardar encontrado',
      content: 'Tienes datos de un paciente que no llegaste a guardar. ¿Quieres recuperarlos?',
      okText: 'Recuperar',
      cancelText: 'Descartar',
      onOk: () => {
        try {
          const base = JSON.parse(initialFormSnapshotRef.current);
          setFormData(deepMerge(base, saved.data));
          setCurrentStep(0);
          message.success('Borrador recuperado');
        } catch {
          message.error('No se pudo recuperar el borrador');
        }
      },
      onCancel: () => clearDraftRef.current?.(),
    });
  }, [isEditing, loadDraft]);

  // useEffect para inicializar el formulario con datos del paciente cuando se está editando
  useEffect(() => {
    if (patientToEdit) {
      // deepMerge sobre `prev` (la plantilla por defecto completa) para que un
      // registro viejo sin algún sub-objeto clínico (embarazo, consumo_azucar,
      // problemas_tratamientos_previos, etc.) no rompa lecturas profundas a.b.c
      // en las secciones. El componente se monta por paciente, así que `prev`
      // es el default pristino en su (única) ejecución de edición.
      setFormData((prev) => deepMerge(prev, {
        documento: {
          tipo: patientToEdit.documento?.tipo || "",
          numero: patientToEdit.documento?.numero || "",
        },
        primer_nombre: patientToEdit.primer_nombre || "",
        otros_nombres: patientToEdit.otros_nombres || "",
        apellido_paterno: patientToEdit.apellido_paterno || "",
        apellido_materno: patientToEdit.apellido_materno || "",
        // Backend devuelve ISO (1990-05-20T00:00:00.000Z) y <input type="date">
        // sólo acepta YYYY-MM-DD: sin el slice queda vacío y al guardar se
        // perdería el dato real.
        fecha_nacimiento: (patientToEdit.fecha_nacimiento || "").slice(0, 10),
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
            // Misma estructura que el state inicial del create. Antes era
            // `false` (boolean) y reventaba al togglear el checkbox: el
            // handler hace spread sobre el valor existente esperando un
            // objeto, y sobre un boolean genera basura tipo {0:'f',1:'a',...}.
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
      }));
    }
  }, [patientToEdit]);

  /** Manejo de carga de imagen */
  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    // Validar tipo y tamaño ANTES de leer: un no-imagen rompe el recorte en
    // silencio (createImage falla) y un archivo enorme se carga entero en
    // memoria como base64. Alineado con el multer del backend (JPG/PNG, 5MB).
    const ALLOWED = ['image/jpeg', 'image/png'];
    if (!ALLOWED.includes(file.type)) {
      message.error('El archivo debe ser una imagen JPG o PNG');
      if (event.target) event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      message.error('La imagen no debe superar 5 MB');
      if (event.target) event.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result);
      setIsCropping(true); // Activar modo de recorte automáticamente
      // No actualizar formData.photoURL hasta que se confirme el recorte
    };
    reader.readAsDataURL(file);
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
      // Sin feedback, un archivo corrupto/no-imagen que evada el accept dejaba
      // el modal de recorte en un estado muerto. Avisar y resetear.
      message.error('No se pudo procesar la imagen seleccionada');
      setImageSrc(null);
      setIsCropping(false);
    }
  }, [imageSrc, croppedAreaPixels, crop, zoom]);
  

  /** Maneja cambios en campos simples */
  // Retira el rojo de un campo en cuanto deja de estar vacío.
  const clearInvalid = (key, value) => {
    if (isEmptyValue(value)) return;
    setInvalidFields((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    // email se normaliza a lowercase para alinearse con el schema mongoose
    // que tiene `lowercase: true` — antes el usuario veía 'User@x.com' en
    // el form y al recargar aparecía 'user@x.com', confuso.
    const normalized = name === 'email' ? value.toLowerCase() : value;
    clearInvalid(name, normalized);
    setFormData((prev) => {
      const next = { ...prev, [name]: normalized };
      // Al cambiar el sexo a algo distinto de Femenino, limpiar los datos
      // específicos de mujer: WomenSection se oculta, pero sin esto los valores
      // ya capturados (parto, menstruación, embarazo) se seguían enviando,
      // guardando un paciente Masculino con datos femeninos incoherentes.
      if (name === 'sexo' && normalized !== 'Femenino') {
        next.informacion_femenina = {
          ha_estado_embarazada: false,
          como_fue_parto: "",
          tipo_parto_detallado: "",
          complicaciones_parto: "",
          fecha_ultimo_parto: "",
          menopausia: false,
          alteraciones_ciclo_menstrual: false,
          fecha_ultima_menstruacion: "",
          toma_anticonceptivos: false
        };
        next.encuesta_medica = {
          ...prev.encuesta_medica,
          embarazo: { estado: false, semanas_gestacion: "" }
        };
      }
      return next;
    });
  };

  /** Maneja cambios en campos anidados */
  const handleNestedChange = (parentKey, field, value) => {
    clearInvalid(`${parentKey}.${field}`, value);
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
      if (isMountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  /** Función auxiliar para guardar paciente */
  const handleSavePatient = async () => {
    // Crear FormData para enviar archivos
    const formDataToSend = new FormData();

    // Trim recursivo de strings antes de validar y enviar — evita que campos
    // required acepten "   " en cliente y rebotan luego en el backend.
    // Y convierte cadenas vacías a null para campos Date/Number del schema:
    // Mongoose castea "" a CastError en esos tipos, lo que tumba el save.
    const patientData = normalizeEmptyDateAndNumber(trimStringsDeep(formData));

    const missingFields = validateRequiredFields(patientData);
    if (missingFields.length > 0) {
      setAttemptedSteps(prev => {
        const next = new Set(prev);
        for (const f of missingFields) {
          if (typeof f.step === 'number') next.add(f.step);
        }
        return next;
      });
      markInvalidFields(missingFields);
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

    // Si hay una foto en base64, convertirla a archivo.
    // ⚠️ NO usar fetch(dataUrl) aquí: el <meta> CSP de index.html no permite
    // `data:` en connect-src, así que fetch() sobre el dataURL se bloquea con
    // "Failed to fetch" y rompe el alta/edición con foto. dataUrlToBlob decodifica
    // el base64 a mano (sin red), inmune al CSP.
    if (patientData.photoURL && patientData.photoURL.startsWith('data:image/')) {
      try {
        const blob = dataUrlToBlob(patientData.photoURL);

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

    // Concurrencia optimista: si estamos editando, enviar el updatedAt que
    // el backend nos devolvió al cargar para que detecte si otro usuario
    // (u otra pestaña) modificó el paciente entre tanto y responda 409
    // PATIENT_STALE en vez de pisar cambios.
    if (patientToEdit?.updatedAt) {
      patientData.expectedUpdatedAt = patientToEdit.updatedAt;
    }

    // Agregar todos los datos del paciente como JSON string
    formDataToSend.append('patientData', JSON.stringify(patientData));

    try {
      let res;
      // Timeout ampliado a 30s SÓLO para estas escrituras: el alta crea
      // carpetas + foto + documento en Mongo, y en una laptop con mongod lento
      // el default de 10s de la instancia se quedaba corto y abortaba un
      // guardado que en realidad iba a completar (ECONNABORTED sin respuesta).
      // 30s es el mismo valor que ya usa el guardado del odontograma.
      const writeConfig = { timeout: 30000 };
      if (patientToEdit) {
        // Actualizar paciente existente
        res = await API.put(`/patients/${patientToEdit._id}`, formDataToSend, writeConfig);
      } else {
        // Crear nuevo paciente
        res = await API.post('/patients', formDataToSend, writeConfig);
      }

      const data = res.data;
      // Invalidar la cache de la lista de pacientes: el alta/edición va por API
      // directa (no por patient-service), así que sin esto la lista cacheada
      // (2 min) quedaría desactualizada tras crear o editar un paciente.
      invalidatePatientsCache();
      // Alta exitosa: descartar el borrador autoguardado para no ofrecer
      // recuperar un paciente que ya se creó.
      if (!patientToEdit) clearDraftRef.current?.();
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
      console.error("Error procesando paciente:", err);

      // Concurrencia optimista del backend: PATIENT_STALE significa que el
      // paciente fue modificado por otro usuario. Mostrar mensaje claro
      // para que recargue antes de reintentar.
      const errCode = err?.response?.data?.code;
      // Timeout / sin respuesta del servidor: axios aborta (ECONNABORTED) o no
      // llegó respuesta (err.response undefined). Casi siempre es mongod lento o
      // caído en el equipo. El alta NO se completó, pero el formulario sigue
      // lleno, así que se puede reintentar sin recapturar nada.
      const isTimeout = err?.code === 'ECONNABORTED'
        || err?.code === 'ERR_NETWORK'
        || (!err?.response && /timeout/i.test(err?.message || ''));
      const status = err?.response?.status || err?.status;

      let title;
      let description;
      if (errCode === 'PATIENT_STALE') {
        title = 'El paciente fue modificado por otro usuario';
        description = 'Recarga la página para ver los cambios más recientes antes de volver a guardar.';
      } else if (isTimeout) {
        title = 'El servidor tardó demasiado en responder';
        description = 'No se pudo confirmar el guardado: la base de datos no respondió a tiempo. '
          + 'Tus datos siguen en el formulario y no se perdieron. Verifica que el programa esté '
          + 'activo y vuelve a intentar en unos segundos.';
      } else {
        title = patientToEdit ? 'No se pudo actualizar el paciente' : 'No se pudo guardar el paciente';
        description = err?.response?.data?.message || err?.message || 'Ocurrió un error inesperado.';
      }

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
      // Propagar el error siempre — el modal padre necesita saber que
      // NO se guardó (antes el padre podía cerrar pensando que el save
      // fue exitoso si sólo veía el Modal.error sin nada más).
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
      <Identification formData={formData} handleNestedChange={handleNestedChange} invalidFields={invalidFields} shakeKey={shakeKey} />
      <PersonalData
        formData={formData}
        handleChange={handleChange}
        invalidFields={invalidFields}
        shakeKey={shakeKey}
        handleSituacionLaboralChange={(field) => {
          setFormData(prev => ({
            ...prev,
            situacion_laboral: {
              empleado: field === 'empleado',
              pensionado: field === 'pensionado',
              desempleado: field === 'desempleado',
              jubilado: field === 'jubilado'
            },
            // Si deja de ser "empleado", limpiar ocupacion: el campo se oculta y
            // no debe persistir un valor heredado de un empleo anterior.
            ocupacion: field === 'empleado' ? prev.ocupacion : ''
          }));
        }}
      />
    </>,
    // Step 1: Contacto
    <>
      <ContactInfo formData={formData} handleNestedChange={handleNestedChange} handleChange={handleChange} invalidFields={invalidFields} shakeKey={shakeKey} />
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
        setFormData={setFormData}
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

  // Marca los campos faltantes como inválidos y dispara la animación shake.
  // El rojo se mantiene hasta que el usuario llena cada campo (clearInvalid lo
  // retira al escribir) para que vea de un vistazo qué falta.
  const markInvalidFields = (missingFields) => {
    const keys = new Set(missingFields.map(f => f.path.join('.')));
    setInvalidFields(keys);
    setShakeKey(k => k + 1);
  };

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
      markInvalidFields(missingByStep);
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
                        // Reset del recorte anterior: si se Guarda antes de que
                        // onCropComplete dispare, no reusar coordenadas de otra imagen.
                        setCroppedAreaPixels(null);
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

          <form
            className="add-patient-form"
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              // Bloquea Enter como submit accidental excepto en el último
              // paso. En pasos intermedios, el `REQUIRED_FIELDS` puede estar
              // satisfecho (paso 0 y 1) y Enter dispararía el guardado con
              // las secciones médicas / hábitos en blanco, sin que el usuario
              // se dé cuenta.
              // Excepciones: textarea (Enter es para nueva línea) y botones
              // (Enter activa el botón enfocado, ese es comportamiento OK).
              if (e.key !== 'Enter') return;
              const tag = e.target.tagName;
              if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
              if (!isLastStep) {
                e.preventDefault();
              }
            }}
          >
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

