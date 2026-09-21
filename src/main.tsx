import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './styles.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

/*
  Clean paths everywhere that can serve index.html for an unknown path — which
  includes GitHub Pages, thanks to the redirect in 404.html. Set
  VITE_HASH_ROUTER=true to build a copy that can be dropped on a host with no
  control over routing at all, where /estimate would simply not exist.
*/
const useHash = import.meta.env.VITE_HASH_ROUTER === 'true';
const Router = useHash ? HashRouter : BrowserRouter;
const routerProps = useHash ? {} : { basename: import.meta.env.BASE_URL };

createRoot(root).render(
  <StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </StrictMode>,
);
