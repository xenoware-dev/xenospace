import { RouterProvider } from 'react-router-dom'

import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/hooks/use-theme'
import { router } from '@/routes/router'

function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="xenospace-theme">
      <RouterProvider router={router} />
      <Toaster position="top-right" />
    </ThemeProvider>
  )
}

export default App
