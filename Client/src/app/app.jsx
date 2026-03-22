import React from 'react';
import { BrowserRouter as Router, Routes, Route, Outlet } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import esES from 'antd/locale/es_ES';
import Sidebar from '../shared/components/sidebar';
import Header from '../shared/components/header';
import Calendar from '../features/main-page/components/calendar';
import Clock from '../features/main-page/components/clock';
import PatientStats from '../features/main-page/components/patient-stats';
import NextPatient from '../features/main-page/components/next-patient';
import './styles/app.css';
import PatientList from '../features/patient-list/patient-list';
import AddPatient from '../features/add-patient/add-patient';
import PatientDetail from '../features/patient-detail/patient-detail';
import ErrorBoundary from '../shared/components/error-boundary';
import CashPage from '../features/cash/CashPage';
import ConsultasPage from '../features/consultas/ConsultasPage';
import StatisticsPage from '../features/statistics/StatisticsPage';
import ProtectedRoute from './auth/ProtectedRoute';
import LoginPage from '../features/auth/LoginPage';
import PermissionGate from './auth/PermissionGate';
import DraftsCenter from '../features/consultas/DraftsCenter';
import SettingsPage from '../features/settings/SettingsPage';
import UsersPage from '../features/users/UsersPage';
import { SidebarProvider } from '../shared/context/SidebarContext';

const antdTheme = {
  token: {
    colorPrimary: '#084888',
    colorSuccess: '#27ae60',
    colorWarning: '#f39c12',
    colorError: '#e74c3c',
    colorInfo: '#3498db',
    colorTextBase: '#0a0a0a',
    colorBgBase: '#ffffff',
    colorBorder: '#e8e8e8',
    borderRadius: 8,
    fontFamily: "'Montserrat', sans-serif",
    fontSize: 14,
    controlHeight: 36,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  components: {
    Button: {
      borderRadius: 8,
      controlHeight: 36,
      fontWeight: 500,
    },
    Card: {
      borderRadiusLG: 14,
      paddingLG: 24,
    },
    Table: {
      borderRadius: 10,
      headerBg: '#f5f5f7',
    },
    Input: {
      borderRadius: 8,
      controlHeight: 36,
      colorBgContainer: '#f3f3f5',
    },
    Select: {
      borderRadius: 8,
      controlHeight: 36,
    },
    Modal: {
      borderRadiusLG: 14,
    },
    Tabs: {
      borderRadius: 14,
    },
  },
};

const AppLayout = () => (
  <SidebarProvider>
    <div className="dashboard">
      <Sidebar />
      <div className="main">
        <Header />
        <div className="content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </div>
      </div>
    </div>
  </SidebarProvider>
);

const App = () => {
  return (
    <ConfigProvider theme={antdTheme} locale={esES}>
    <Router>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route
              path="/"
              element={
                <>
                  <DraftsCenter />
                  <div className="home">
                    <div className="left-section">
                      <div className="calendar">
                        <Calendar />
                      </div>
                      <div className="next-patient">
                        <NextPatient />
                      </div>
                    </div>
                    <div className="right-section">
                      <div className="clock">
                        <Clock />
                      </div>
                      <div className="patient-stats">
                        <PatientStats />
                      </div>
                    </div>
                  </div>
                </>
              }
            />

            <Route path="/pacientes" element={<PatientList />} />
            <Route path="/add-patient" element={<AddPatient />} />
            <Route path="/patient/:patientId" element={<PatientDetail />} />
            <Route path="/consultas" element={<ConsultasPage />} />
            <Route path="/caja" element={<CashPage />} />
            <Route path="/estadisticas" element={<StatisticsPage />} />
            <Route path="/usuarios" element={<UsersPage />} />
            <Route path="/configuracion" element={<SettingsPage />} />
            <Route path="/configuracion/:section" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </Router>
    </ConfigProvider>
  );
};

export default App;
