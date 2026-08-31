import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { PoolProvider } from './context/PoolContext'
import Layout from './components/Layout'
import AuthPage from './pages/AuthPage'
import JoinPage from './pages/JoinPage'
import PickPage from './pages/PickPage'
import StandingsPage from './pages/StandingsPage'
import SeasonPage from './pages/SeasonPage'
import RulesPage from './pages/RulesPage'
import AdminPage from './pages/AdminPage'
import AccountPage from './pages/AccountPage'

export default function App() {
  const { session, profile, isEntrant, loading } = useAuth()

  if (loading) {
    return <div className="page-loading">Loading…</div>
  }

  // Password recovery links land signed-in; let that route through before anything else.
  if (session && window.location.pathname === '/reset') {
    return (
      <Layout>
        <Routes>
          <Route path="*" element={<AccountPage />} />
        </Routes>
      </Layout>
    )
  }

  if (!session) {
    return <AuthPage />
  }

  // Signed in but not in this pool — e.g. an existing wrestling-league member.
  if (!isEntrant && !profile?.is_admin) {
    return <JoinPage />
  }

  return (
    <PoolProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<PickPage />} />
          <Route path="/standings" element={<StandingsPage />} />
          <Route path="/season" element={<SeasonPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/reset" element={<AccountPage />} />
          {profile?.is_admin && <Route path="/admin" element={<AdminPage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </PoolProvider>
  )
}
