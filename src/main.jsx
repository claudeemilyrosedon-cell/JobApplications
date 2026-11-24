import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LocationHub from './LocationHub.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App>
      <LocationHub />
    </App>
  </StrictMode>,
)
