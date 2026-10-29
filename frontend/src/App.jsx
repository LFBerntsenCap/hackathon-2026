import { useEffect, useState } from 'react';
import Logg from './Logg.jsx';
import Rapport from './Rapport.jsx';
import PatchVisning from './PatchVisning.jsx';
import { useGraver } from './useGraver.js';

export default function App() {
  const { steg, rapport, patch, status, start } = useGraver();
  const [oppgave, setOppgave] = useState('');
  const [fane, setFane] = useState('rapport');

  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then((i) => setOppgave(i.eksempelOppgave)).catch(() => {});
  }, []);

  const send = (e) => {
    e.preventDefault();
    setFane('rapport');
    start(oppgave);
  };

  return (
    <>
      <header>
        <h1>🪦 Kodekirkegården <small>agenten graver i hjemsokt-repo</small></h1>
      </header>
      <form onSubmit={send}>
        <input value={oppgave} onChange={(e) => setOppgave(e.target.value)} placeholder="Hva skal graveren lete etter?" />
        <button type="submit" disabled={status === 'graver'}>⚰️ Start graving</button>
      </form>
      <main>
        <Logg steg={steg} status={status} />
        <section>
          <h2>
            <nav>
              <button type="button" className={fane === 'rapport' ? 'aktiv' : ''} onClick={() => setFane('rapport')}>Rapport</button>
              <button type="button" className={fane === 'patch' ? 'aktiv' : ''} onClick={() => setFane('patch')}>Opprydnings-patch</button>
            </nav>
          </h2>
          <div className="innhold">
            {fane === 'rapport' ? <Rapport rapport={rapport} status={status} /> : <PatchVisning patch={patch} />}
          </div>
        </section>
      </main>
    </>
  );
}
