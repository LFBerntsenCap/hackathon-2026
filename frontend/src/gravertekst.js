import { useEffect, useState } from 'react';

// Hva graveren «sier» mens den jobber, avhengig av hvilket verktøy den brukte sist.
const PER_VERKTOY = {
  sok_i_repo: 'lister seg rundt mellom gravstøttene',
  les_fil: 'tyder dødsattesten',
  finn_referanser: 'leter etter gjenlevende slektninger',
  hent_git_historikk: 'blar i kirkebøkene',
  foresla_opprydding: 'snekrer kistene',
};

export function graverStatus(steg) {
  const sist = [...steg].reverse().find((s) => s.type === 'kall');
  return (sist && PER_VERKTOY[sist.navn]) || 'brynner spaden';
}

const VENTER = [
  'Spaden skrapes mot jord …',
  'Tåken siger inn over kirkegården …',
  'Noe rører seg under en gravstein …',
  'Støver av en nekrolog …',
  'Lyktene flakker …',
  'Graveren mumler for seg selv …',
];

// Bytter melding hver 2,5 sekund så ventetiden ikke føles død.
export function useVentetekst(aktiv) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!aktiv) return undefined;
    const t = setInterval(() => setI((n) => (n + 1) % VENTER.length), 2500);
    return () => clearInterval(t);
  }, [aktiv]);
  return VENTER[i];
}
