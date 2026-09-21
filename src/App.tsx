import { useEffect, useState } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { Footer } from './components/Footer';
import { Header } from './components/Header';
import { About } from './pages/About';
import { Estimate } from './pages/Estimate';
import { Home } from './pages/Home';
import { NotFound } from './pages/NotFound';
import { Projects } from './pages/Projects';

/** Routes land at the top; in-page anchors land on their section. */
function Routing(): null {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname, hash]);
  return null;
}

/** An honest, dismissible reminder that nothing here reaches the business. */
function PrototypeBar(): React.JSX.Element | null {
  const [shown, setShown] = useState(true);

  /* The bar is fixed to the bottom of the window, so anything else anchored
     there — the service rail, the comparison controls — has to know how tall
     it is rather than sit underneath it. */
  useEffect(() => {
    document.documentElement.style.setProperty('--protobar-h', shown ? '38px' : '0px');
    return () => document.documentElement.style.setProperty('--protobar-h', '0px');
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="protobar" role="status">
      <span>Prototype — nothing on this site is sent or submitted</span>
      <button type="button" aria-label="Dismiss prototype notice" onClick={() => setShown(false)}>
        ×
      </button>
    </div>
  );
}

export default function App(): React.JSX.Element {
  return (
    <>
      <a className="skiplink" href="#main">
        Skip to content
      </a>
      <Routing />
      <Header />
      <main id="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/about" element={<About />} />
          <Route path="/estimate" element={<Estimate />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <PrototypeBar />
    </>
  );
}
