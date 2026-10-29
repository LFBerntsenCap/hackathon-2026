import { useEffect, useRef } from 'react';

function Steg({ h }) {
  if (h.type === 'kall') {
    return (
      <div className="steg kall">
        → <code>{h.navn}</code> <span className="args">{JSON.stringify(h.input).slice(0, 300)}</span>
      </div>
    );
  }
  if (h.type === 'resultat') {
    return (
      <div className={'steg ' + (h.feil ? 'feil' : 'ok')}>
        <details>
          <summary>{h.feil ? '✖' : '✓'} {h.tegn} tegn tilbake</summary>
          <pre>{h.forhandsvisning}{h.tegn > 600 ? '\n…' : ''}</pre>
        </details>
      </div>
    );
  }
  if (h.type === 'tekst') return <div className="steg tanke">{h.tekst}</div>;
  if (h.type === 'stoppet') return <div className="steg feil">✖ {h.melding}</div>;
  return null;
}

export default function Logg({ steg, status }) {
  const bunn = useRef(null);
  useEffect(() => {
    bunn.current?.scrollIntoView({ block: 'end' });
  }, [steg.length]);

  const antall = steg.filter((s) => s.type === 'kall').length;
  const tekst = { klar: '', graver: `graver … ${antall} verktøykall`, ferdig: `ferdig, ${antall} verktøykall`, feil: 'mistet forbindelsen' }[status];

  return (
    <section>
      <h2>Graverens logg <span className="status">{tekst}</span></h2>
      <div className="innhold">
        {steg.length === 0 && <div className="tom">{status === 'graver' ? 'Graveren våkner …' : 'Ingen graving ennå.'}</div>}
        {steg.map((h, i) => <Steg key={i} h={h} />)}
        <div ref={bunn} />
      </div>
    </section>
  );
}
