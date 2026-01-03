import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

import { Dashboard } from './components/Dashboard';
import { ToastProvider } from '../context/ToastContext';

export const App = () => (
    <ToastProvider>
        <Dashboard />
    </ToastProvider>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
