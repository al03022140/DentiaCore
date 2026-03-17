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
import './settings.css';

const SECTIONS = [
  { id: 'apariencia', name: 'Apariencia', icon: '🎨', desc: 'Tema claro, oscuro o del sistema', roles: null },
  { id: 'perfil', name: 'Mi Perfil', icon: '👤', desc: 'Nombre, correo, contraseña y PIN', roles: null },
  { id: 'perfil-profesional', name: 'Perfil Profesional', icon: '🩺', desc: 'Firma digital y cédula profesional', roles: ['doctor', 'administrador', 'superadmin'] },
  { id: 'notificaciones', name: 'Notificaciones', icon: '🔔', desc: 'Recordatorios de citas y alertas', roles: null },
  { id: 'preferencias-clinicas', name: 'Preferencias Clínicas', icon: '⚕️', desc: 'Plantillas de notas, formato receta, duración cita', roles: ['doctor'] },
  { id: 'clinica', name: 'Clínica', icon: '🏥', desc: 'Nombre, dirección, logo y contacto', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'cuentas-permisos', name: 'Cuentas y Permisos', icon: '🔐', desc: 'Controlar accesos por rol y por usuario', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'seguridad', name: 'Seguridad', icon: '🛡️', desc: 'Tiempo de inactividad, bloqueo de sesión', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'citas', name: 'Citas', icon: '📅', desc: 'Duración predeterminada, horarios de atención', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
  { id: 'caja', name: 'Caja', icon: '💰', desc: 'Categorías de movimiento, moneda, defaults', roles: ['administrador', 'superadmin'], permission: 'settings.update' },
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
      <h2 className="settings-title">Configuración</h2>
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
    </div>
  );
};

export default SettingsPage;
