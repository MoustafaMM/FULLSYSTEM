import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import App from './App';
import { lazy, Suspense } from 'react';

const PublicFeedback = lazy(() => import('./logistics/PublicFeedback'));
const isPublicFeedbackUrl = () => new URLSearchParams(window.location.search).get('view') === 'feedback';
import './theme.css';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  isPublicFeedbackUrl() ? <Suspense fallback={null}><PublicFeedback /></Suspense> : (
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
  ),
);
