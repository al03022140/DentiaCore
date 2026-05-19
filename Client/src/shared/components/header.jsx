import React, { useRef, useState, useEffect } from 'react';
import { useAuth } from '../../app/auth/AuthContext';
import { useLockScreen } from './LockScreen';
import { useSidebar } from '../context/SidebarContext';
import lockBlockedIcon from '../../assets/images/icons/Lock blocked.svg';
import '../styles/header.css';

const Header = () => {
  const { logout, user } = useAuth();
  const { lock } = useLockScreen();
  const { isMobile, toggle } = useSidebar();
  const h1Ref = useRef(null);
  const fullName = user?.nombre || 'Dr. Jefferson';
  const firstName = fullName.split(' ')[0];
  const [displayName, setDisplayName] = useState(fullName);

  useEffect(() => {
    const el = h1Ref.current;
    if (!el) return;

    const checkFit = () => {
      const measure = (text) => {
        const span = document.createElement('span');
        span.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;pointer-events:none';
        span.style.font = window.getComputedStyle(el).font;
        span.textContent = text;
        document.body.appendChild(span);
        const w = span.offsetWidth;
        document.body.removeChild(span);
        return w;
      };
      const available = el.offsetWidth;
      if (measure(`Buenos días, ${fullName}`) <= available) {
        setDisplayName(fullName);
      } else {
        setDisplayName(firstName);
      }
    };

    const observer = new ResizeObserver(checkFit);
    observer.observe(el);
    checkFit();
    return () => observer.disconnect();
  }, [fullName, firstName]);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div className="header">
      {isMobile && (
        <button className="hamburger-button" onClick={toggle} aria-label="Abrir menú">
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      )}
      <h1 ref={h1Ref} className="header-greeting" title={`Buenos días, ${fullName}`}>Buenos días, {displayName}</h1>
      <div className="header-actions">
        <button className="lock-button" onClick={() => lock('manual')} title="Bloquear pantalla">
          {user?.nombre === 'Administrador Local'
            ? <img src={lockBlockedIcon} alt="Administrador Local" width="14" height="14" className="theme-icon" style={{ verticalAlign: 'middle' }} />
            : '🔒'} Bloquear
        </button>
        <button className="logout-button" onClick={handleLogout} title="Cerrar sesión">Cerrar sesión</button>
      </div>
    </div>
  );
};

export default Header;
