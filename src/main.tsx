import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/unbounded'
import '@fontsource-variable/geist'
import './index.css'
import './i18n'
import { ThemeProvider } from './theme/ThemeProvider'
import { CartProvider } from './cart/CartProvider'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <CartProvider>
        <App />
      </CartProvider>
    </ThemeProvider>
  </StrictMode>,
)
