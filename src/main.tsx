import { createRoot } from 'react-dom/client'
import App from './account/AccountApp'
import './style.css'
import { clearLegacyProfiles } from './model/storageKeys'

try { clearLegacyProfiles() } catch { /* Device storage may be unavailable in private browsing. */ }
createRoot(document.getElementById('root')!).render(<App />)
