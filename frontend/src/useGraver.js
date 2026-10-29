import { useCallback, useEffect, useRef, useState } from 'react';

// Starter en agentkjøring og samler stegene som strømmer inn fra /api/kjor.
export function useGraver() {
  const [steg, setSteg] = useState([]);
  const [rapport, setRapport] = useState('');
  const [patch, setPatch] = useState('');
  const [status, setStatus] = useState('klar'); // klar | graver | ferdig | feil
  const kilde = useRef(null);

  useEffect(() => () => kilde.current?.close(), []);

  // Vis en eventuell patch fra tidligere kjøring når siden åpnes.
  useEffect(() => {
    fetch('/api/patch').then((r) => (r.ok ? r.text() : '')).then(setPatch).catch(() => {});
  }, []);

  const start = useCallback((oppgave) => {
    kilde.current?.close();
    setSteg([]);
    setRapport('');
    setPatch('');
    setStatus('graver');

    const es = new EventSource('/api/kjor?oppgave=' + encodeURIComponent(oppgave));
    kilde.current = es;
    const avslutt = (s) => {
      es.close(); // ellers kobler EventSource til på nytt og starter en ny kjøring
      kilde.current = null;
      setStatus(s);
    };

    es.onmessage = async (ev) => {
      const h = JSON.parse(ev.data);
      if (h.type === 'tekst' && h.sluttsvar) {
        setRapport((r) => r + h.tekst + '\n');
      } else if (h.type === 'slutt') {
        avslutt('ferdig');
        if (h.patch) {
          const r = await fetch('/api/patch');
          if (r.ok) setPatch(await r.text());
        }
      } else if (h.type !== 'ferdig') {
        setSteg((s) => [...s, h]);
      }
    };
    es.onerror = () => {
      if (kilde.current === es) avslutt('feil');
    };
  }, []);

  return { steg, rapport, patch, status, start };
}
