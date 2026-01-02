import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import '../sidepanel/index.css'; // Re-use main styles
import { App } from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
    </StrictMode>
);
