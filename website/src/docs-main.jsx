import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/geist';
import '@fontsource-variable/jetbrains-mono';
import './styles.css';
import DocsPage from './DocsPage.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DocsPage />
  </StrictMode>,
);
