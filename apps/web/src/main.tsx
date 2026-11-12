import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');
//If root element is missing fail with a proper error message
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
