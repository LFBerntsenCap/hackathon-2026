import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { graverStatus, useVentetekst } from './gravertekst.js';

const NIVA = { høy: 'hoy', middels: 'middels', lav: 'lav' };

// Flater ut tekst fra celleinnhold, også når modellen har skrevet **høy** (fet).
function tekstAv(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(tekstAv).join('');
  return node?.props?.children ? tekstAv(node.props.children) : '';
}

// Gjør «høy / middels / lav» i tabellceller om til fargede merker.
function Celle({ children, node, ...rest }) {
  const tekst = tekstAv(children).trim();
  const klasse = tekst.length < 25 && NIVA[tekst.toLowerCase().split(/[\s/–-]/)[0]];
  return <td {...rest}>{klasse ? <span className={'merke ' + klasse}>{tekst}</span> : children}</td>;
}

export default function Rapport({ rapport, status, steg = [] }) {
  const ventetekst = useVentetekst(status === 'graver' && !rapport);
  if (!rapport) {
    if (status !== 'graver') return <div className="tom">Rapporten dukker opp her når agenten er ferdig.</div>;
    return (
      <div className="tom venter">
        <div className="spade">⚰️</div>
        <div>Graveren {graverStatus(steg)} …</div>
        <div className="ventetekst">{ventetekst}</div>
      </div>
    );
  }
  return (
    <div className="rapport">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ td: Celle }}>{rapport}</ReactMarkdown>
    </div>
  );
}
