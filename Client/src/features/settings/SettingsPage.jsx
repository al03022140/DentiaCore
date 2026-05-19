import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthContext';
import { hasPermission } from '../../app/auth/permissions';
import SettingsSection from './SettingsSection';
import AppearanceSection from './sections/AppearanceSection';
import ProfileSection from './sections/ProfileSection';
import ProfessionalProfileSection from './sections/ProfessionalProfileSection';
import ClinicalPreferencesSection from './sections/ClinicalPreferencesSection';
import NotificationsSection from './sections/NotificationsSection';
import ClinicSection from './sections/ClinicSection';
import AccountsPermissionsSection from './sections/AccountsPermissionsSection';
import SecuritySection from './sections/SecuritySection';
import AppointmentsSection from './sections/AppointmentsSection';
import CashSection from './sections/CashSection';
import TraceabilitySection from './sections/TraceabilitySection';
import GoogleCalendarSection from './sections/GoogleCalendarSection';
import './settings.css';
import bellIcon from '../../assets/images/icons/bell.svg';
import shieldIcon from '../../assets/images/icons/shield.svg';
import calendarIcon from '../../assets/images/icons/Calendar.svg';
import lockBlockedIcon from '../../assets/images/icons/Lock blocked.svg';
import trazability2Icon from '../../assets/images/icons/trazability 2.svg';
import userIcon from '../../assets/images/icons/user.svg';
import hospitalIcon from '../../assets/images/icons/hospital.svg';
import pencilIcon from '../../assets/images/icons/pencil.svg';
import calendarPlusIcon from '../../assets/images/icons/Calendar plus.svg';
import idCardIcon from '../../assets/images/icons/id-card.svg';
import clipboardListIcon from '../../assets/images/icons/clipboard-list.svg';
import moneyIcon from '../../assets/images/icons/money.svg';

const SECTIONS = [
  { id: 'apariencia', name: 'Apariencia', icon: <img src={pencilIcon} alt="Apariencia" width="36" height="36" className="theme-icon" />, desc: 'Tema claro, oscuro o del sistema', roles: null },
  { id: 'perfil', name: 'Mi Perfil', icon: <img src={userIcon} alt="Mi Perfil" width="36" height="36" className="theme-icon" />, desc: 'Nombre, correo, contraseña y PIN', roles: null },
  { id: 'perfil-profesional', name: 'Perfil Profesional', icon: <img src={idCardIcon} alt="Perfil Profesional" width="36" height="36" className="theme-icon" />, desc: 'Firma digital y cédula profesional', roles: ['doctor', 'administrador', 'superadmin'] },
  { id: 'notificaciones', name: 'Notificaciones', icon: <img src={bellIcon} alt="" width="36" height="36" className="theme-icon" />, desc: 'Recordatorios de citas y alertas', roles: null },
  { id: 'preferencias-clinicas', name: 'Preferencias Clínicas', icon: <img src={clipboardListIcon} alt="Preferencias Clínicas" width="36" height="36" className="theme-icon" />, desc: 'Plantillas de notas, formato receta, duración cita', roles: ['doctor'] },
  { id: 'clinica', name: 'Clínica', icon: <img src={hospitalIcon} alt="Clínica" width="36" height="36" className="theme-icon" />, desc: 'Nombre, dirección, logo y contacto', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'cuentas-permisos', name: 'Cuentas y Permisos', icon: <img src={lockBlockedIcon} alt="" width="36" height="36" className="theme-icon" />, desc: 'Controlar accesos por rol y por usuario', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'seguridad', name: 'Seguridad', icon: <img src={shieldIcon} alt="" width="36" height="36" className="theme-icon" />, desc: 'Tiempo de inactividad, bloqueo de sesión', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'citas', name: 'Citas', icon: <img src={calendarIcon} alt="" width="36" height="36" className="theme-icon" />, desc: 'Duración predeterminada, horarios de atención', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'google-calendar', name: 'Google Calendar', icon: <img src={calendarPlusIcon} alt="Google Calendar" width="36" height="36" className="theme-icon" />, desc: 'Conectar cuenta, elegir calendario destino', roles: null },
  { id: 'caja', name: 'Caja', icon: <img src={moneyIcon} alt="Caja" width="36" height="36" className="theme-icon" />, desc: 'Categorías de movimiento, moneda, defaults', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'trazabilidad', name: 'Trazabilidad', icon: <img src={trazability2Icon} alt="" width="36" height="36" className="theme-icon" />, desc: 'Registro de acciones por usuario, fecha o paciente', roles: ['administrador', 'superadmin'], permission: 'audit.read.full' },
];

const SECTION_COMPONENTS = {
  'apariencia': AppearanceSection,
  'perfil': ProfileSection,
  'perfil-profesional': ProfessionalProfileSection,
  'notificaciones': NotificationsSection,
  'preferencias-clinicas': ClinicalPreferencesSection,
  'clinica': ClinicSection,
  'cuentas-permisos': AccountsPermissionsSection,
  'seguridad': SecuritySection,
  'citas': AppointmentsSection,
  'caja': CashSection,
  'trazabilidad': TraceabilitySection,
  'google-calendar': GoogleCalendarSection,
};

const SettingsPage = () => {
  const { section } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const userRole = user?.rol || user?.role;
  const permissions = user?.permissions || [];

  const visibleSections = SECTIONS.filter((s) => {
    if (s.roles && !s.roles.includes(userRole)) return false;
    if (s.permission && !hasPermission(permissions, [s.permission]) && !['administrador', 'superadmin'].includes(userRole)) return false;
    return true;
  });

  if (section) {
    const SectionComponent = SECTION_COMPONENTS[section];
    const sectionMeta = SECTIONS.find((s) => s.id === section);
    if (!SectionComponent) {
      return (
        <SettingsSection title="Sección no encontrada" onBack={() => navigate('/configuracion')}>
          <p>La sección solicitada no existe.</p>
        </SettingsSection>
      );
    }
    return (
      <SettingsSection title={sectionMeta?.name || section} onBack={() => navigate('/configuracion')}>
        <SectionComponent />
      </SettingsSection>
    );
  }

  return (
    <div className="settings-page">
      <section className="settings-card" aria-labelledby="settings-page-title">
        <h2 id="settings-page-title" className="settings-title">Configuración</h2>
        <div className="settings-list">
          {visibleSections.map((s) => (
            <button
              key={s.id}
              className="settings-row"
              onClick={() => navigate(`/configuracion/${s.id}`)}
            >
              <span className="settings-row-icon">{s.icon}</span>
              <span className="settings-row-info">
                <span className="settings-row-name">{s.name}</span>
                <span className="settings-row-desc">{s.desc}</span>
              </span>
              {s.roles && (
                <span className="settings-row-badge">
                  {s.roles.includes('doctor') && !s.roles.includes('administrador') ? 'Doctor' : 'Admin'}
                </span>
              )}
              <span className="settings-row-arrow">›</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default SettingsPage;
