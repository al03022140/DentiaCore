import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
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

const App = () => {
  return (
    <Router>
      <div className="dashboard">
        {/* Sidebar siempre visible */}
        <Sidebar />

        {/* Main layout */}
        <div className="main">
          {/* Header siempre visible */}
          <Header />

          {/* Content cambia según la ruta */}
          <div className="content">
            <ErrorBoundary>
              <Routes>
                {/* Ruta principal */}
                <Route
                  path="/"
                  element={
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
                  }
                />

                {/* Ruta de pacientes */}
                <Route path="/pacientes" element={<PatientList />} />
                <Route path="/add-patient" element={<AddPatient />} /> 
                <Route path="/patient/:patientId" element={<PatientDetail />} />
                
                {/* Ruta de consultas */}
                <Route path="/consultas" element={<ConsultasPage />} />

                {/* Ruta de caja */}
                <Route path="/caja" element={<CashPage />} />

                {/* Ruta de estadisticas */}
                <Route path="/estadisticas" element={<StatisticsPage />} />
              </Routes>
            </ErrorBoundary>
          </div>
        </div>
      </div>
    </Router>
  );
};

export default App;


