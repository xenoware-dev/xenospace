import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
// Self-hosted, so the app looks the same on every machine. The stack used to
// start at system-ui, which renders in whatever the desktop's UI font is —
// including monospace — and needs no third-party font request.
import '@fontsource-variable/jetbrains-mono';
// Bundled for a proportional alternative; @font-face only downloads when used.
import '@fontsource-variable/inter';
import './styles/index.css';
import { queryClient } from './lib/queryClient.js';
import { AuthProvider } from './lib/auth.jsx';
import { SocketProvider } from './lib/socket.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import { ToastProvider } from './components/ui/Toast.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { AppRoutes } from './router.jsx';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root is missing from index.html');

/*
 * Provider order matters: auth must wrap the socket (which needs a token) and
 * both must sit inside the query client, since each invalidates its caches.
 */
createRoot(container).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <SocketProvider>
                <ToastProvider>
                  <AppRoutes />
                </ToastProvider>
              </SocketProvider>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
);
