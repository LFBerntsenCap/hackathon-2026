function klasse(l) {
  if (l.startsWith('diff --git')) return 'f';
  if (/^(\+\+\+|---|index|new file|deleted file|@@)/.test(l)) return 'h';
  if (l.startsWith('+')) return 'p';
  if (l.startsWith('-')) return 'm';
  return '';
}

export default function PatchVisning({ patch }) {
  if (!patch) return <div className="tom">Ingen patch ennå. Agenten lager den helt til slutt.</div>;
  return (
    <div className="patch">
      <p className="apply">
        Bruk den fra <code>hjemsokt-repo</code>: <code>git apply -p1 ../data/opprydding.patch</code>
      </p>
      <pre>
        {patch.split('\n').map((l, i) => <span key={i} className={klasse(l)}>{l || ' '}</span>)}
      </pre>
    </div>
  );
}
