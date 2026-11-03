import { Activity, FinalCTA, Features, Footer, Header, Hero, Story, Themes, Tools } from './components/sections.jsx';
import { useReveal, useSiteTheme } from './components/ui.jsx';

export default function App() {
  const [theme, toggleTheme] = useSiteTheme();
  useReveal();
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <Header theme={theme} onToggleTheme={toggleTheme} />
      <main id="main">
        <Hero />
        <Story theme={theme} />
        <Activity theme={theme} />
        <Features />
        <Tools />
        <Themes />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
