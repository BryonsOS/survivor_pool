import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <NavLink to="/" className="brand">
            <span className="brand-mark" aria-hidden="true">
              ✦
            </span>
            <span className="brand-text">
              Survivor <em>Pool</em>
            </span>
          </NavLink>
          <nav className="nav">
            <NavLink to="/" end>
              My Pick
            </NavLink>
            <NavLink to="/standings">Standings</NavLink>
            <NavLink to="/season">Season</NavLink>
            <NavLink to="/rules">Rules</NavLink>
            {profile?.is_admin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="topbar-user">
            <NavLink to="/account" className="user-name" title="Account settings">
              {profile?.display_name}
            </NavLink>
            <button className="btn btn-ghost btn-sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="main">{children}</main>
      <footer className="footer">Pick one team. Win and advance. Two strikes and you're out.</footer>
    </div>
  )
}
