import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'motion/react'
import App from './App'
import './styles.css'
const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
})
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MotionConfig>
  </QueryClientProvider>,
)
