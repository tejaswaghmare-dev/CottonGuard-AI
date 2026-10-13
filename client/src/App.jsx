
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';

import Navbar from './components/Navbar';
import Chatbot from './components/Chatbot';
import MobileNav from './components/MobileNav';
import ProtectedRoute from './components/ProtectedRoute';

import { AuthProvider } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import Onboarding from './pages/Onboarding';

import FarmerDashboard from './pages/farmer/Dashboard';
import FarmsList from './pages/farmer/FarmsList';
import FarmForm from './pages/farmer/FarmForm';
import FarmDetail from './pages/farmer/FarmDetail';
import Detect from './pages/farmer/Detect';
import Result from './pages/farmer/Result';
import Doctors from './pages/farmer/Doctors';
import Consultations from './pages/farmer/Consultations';
import ProductsBrowse from './pages/farmer/ProductsBrowse';
import MandiPrices from './pages/farmer/MandiPrices';

import OwnerDashboard from './pages/owner/OwnerDashboard';
import OwnerProducts from './pages/owner/OwnerProducts';

import DoctorDashboard from './pages/doctor/DoctorDashboard';
import DoctorConsultations from './pages/doctor/DoctorConsultations';
import DoctorAvailability from './pages/doctor/DoctorAvailability';

function AppLayout() {
  const location = useLocation();

  const hideChatbot = ['/login', '/register'].includes(
    location.pathname.replace(/\/+$/, '') || '/'
  );

  return (
    <div className="app-shell">
      <Navbar />

      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/onboarding" element={<Onboarding />} />

        <Route element={<ProtectedRoute roles={['farmer']} />}>
          <Route path="/dashboard" element={<FarmerDashboard />} />
          <Route path="/farms" element={<FarmsList />} />
          <Route path="/farms/new" element={<FarmForm />} />
          <Route path="/farms/:farmId" element={<FarmDetail />} />
          <Route path="/detect" element={<Detect />} />
          <Route
            path="/results/:predictionId"
            element={<Result />}
          />
          <Route path="/doctors" element={<Doctors />} />
          <Route
            path="/consultations"
            element={<Consultations />}
          />
          <Route path="/products" element={<ProductsBrowse />} />
          <Route path="/mandi-prices" element={<MandiPrices />} />
        </Route>

        <Route
          element={<ProtectedRoute roles={['pesticide_owner']} />}
        >
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route
            path="/owner/products"
            element={<OwnerProducts />}
          />
        </Route>

        <Route element={<ProtectedRoute roles={['leaf_doctor']} />}>
          <Route path="/doctor" element={<DoctorDashboard />} />
          <Route
            path="/doctor/consultations"
            element={<DoctorConsultations />}
          />
          <Route
            path="/doctor/availability"
            element={<DoctorAvailability />}
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <MobileNav />

      {!hideChatbot && <Chatbot />}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <BrowserRouter>
          <AppLayout />
        </BrowserRouter>
      </AuthProvider>
    </LanguageProvider>
  );
}
