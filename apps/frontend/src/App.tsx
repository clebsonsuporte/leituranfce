import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ImportPage from './pages/ImportPage'
import CompaniesPage from './pages/CompaniesPage'
import NotesPage from './pages/NotesPage'
import ProductsPage from './pages/ProductsPage'
import ReportsPage from './pages/ReportsPage'
import AlertsPage from './pages/AlertsPage'
import UsersPage from './pages/UsersPage'
import SegregacaoPage from './pages/SegregacaoPage'
import EmailPage from './pages/EmailPage'
import TaxPage from './pages/TaxPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuthStore()
  if (!accessToken) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="companies" element={<CompaniesPage />} />
        <Route path="notes" element={<NotesPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="email" element={<EmailPage />} />
        <Route path="alerts" element={<AlertsPage />} />
        <Route path="segregacao" element={<SegregacaoPage />} />
        <Route path="tax" element={<TaxPage />} />
        <Route path="settings/users" element={<UsersPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
