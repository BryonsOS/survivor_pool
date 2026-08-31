import { configError } from '../lib/supabase'

/**
 * Shown when the site was built without its Supabase environment variables.
 * Nothing else in the app can work in that state, so say plainly what is missing
 * and how to fix it rather than leaving a blank page.
 */
export default function SetupPage() {
  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-hero">
          <h1>
            Setup <em>needed</em>
          </h1>
          <p>This site is deployed but not yet connected to its database.</p>
        </div>

        <div className="alert alert-error">{configError}</div>

        <div className="setup-steps">
          <p>In Netlify, under <strong>Site configuration → Environment variables</strong>, add:</p>
          <pre className="setup-code">
            VITE_SUPABASE_URL{'\n'}
            VITE_SUPABASE_ANON_KEY
          </pre>
          <p>
            Then <strong>redeploy</strong> — these are baked in at build time, so an existing build
            cannot pick them up. Trigger deploy → <em>Clear cache and deploy site</em>.
          </p>
        </div>
      </div>
    </div>
  )
}
