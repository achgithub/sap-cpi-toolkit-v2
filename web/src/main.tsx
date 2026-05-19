import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@ui5/webcomponents-react'
import '@ui5/webcomponents-react/dist/Assets.js'
import '@ui5/webcomponents-icons/dist/AllIcons.js'
import './index.css'
import App from './App'

// Monaco web worker setup — must run before any Editor component mounts.
// Vite bundles workers via the ?worker import; we tell Monaco's environment
// which worker to use for each language so it doesn't attempt dynamic CDN loads.
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker   from 'monaco-editor/esm/vs/language/json/json.worker?worker'

(self as any).MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker()
    return new editorWorker()
  },
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
