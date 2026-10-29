// Verktøyene agenten kan bruke. Et verktøy er en definisjon (det modellen ser)
// og en kjør-funksjon (det som faktisk skjer). kjør: null betyr stub: den
// sendes ikke til modellen før dere har implementert den.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const REPO = path.resolve(import.meta.dirname, '../hjemsokt-repo');
export const PATCH_FIL = path.resolve(import.meta.dirname, '../data/opprydding.patch');
export const GIT_LOGG = path.resolve(import.meta.dirname, '../data/git-logg.json');

export const system = `Du er graver på kodekirkegården. Du leter etter død kode i repoet hjemsokt-repo:
funksjoner ingen kaller, pakker ingen importerer, utkommentert kode, gamle TODO-er,
tester som alltid skippes og feature-flagg som aldri endres.
Undersøk før du konkluderer: finn noe mistenkelig, sjekk om noe bruker det, og gå videre.
Sjekk også indirekte bruk (config-strenger, dynamisk import, npm-scripts, README-merknader om andre repoer)
før du kaller noe dødt, og bruk hent_git_historikk for å si når det sist ble rørt og av hvem.

Avslutt med en rapport på norsk i denne rekkefølgen:
1. Gravplan: funnene rangert fra tryggest til minst trygt å fjerne, hver med sikkerhet (høy/middels/lav).
2. Nekrolog for hvert funn: hva det var, når det sist ble rørt, og hvorfor det trygt kan begraves.
3. Hjemsøkt-score per fil (0–10) for filene med funn, med en kort begrunnelse.
4. Må IKKE fjernes: ting som ser døde ut, men ikke er det, med begrunnelse.
Til slutt kaller du foresla_opprydding én gang med bare funnene du har høy sikkerhet på (ikke ting
under «Må IKKE fjernes»), og nevner patch-fila i rapporten.
Si tydelig fra når du er usikker. Ikke finn på referanser eller datoer du ikke har sett i verktøyene.`;

export const eksempelOppgave =
  'Finn død kode i hjemsokt-repo. Rangér funnene etter hvor trygt de er å fjerne, og skriv nekrolog for hvert.';

const MAKS_TREFF = 50;

function alleFiler(mappe) {
  return fs.readdirSync(mappe, { withFileTypes: true }).flatMap((d) => {
    if (d.name === 'node_modules' || d.name === '.git') return [];
    const full = path.join(mappe, d.name);
    return d.isDirectory() ? alleFiler(full) : [full];
  });
}

function lagTest(monster, regex) {
  if (typeof monster !== 'string' || !monster.trim()) {
    throw new Error('Mangler «monster». Send f.eks. {"monster": "TODO"} eller {"monster": "require\\\\(", "regex": true}.');
  }
  if (regex) {
    let re;
    try {
      re = new RegExp(monster, 'i');
    } catch (e) {
      throw new Error(`Ugyldig regex «${monster}»: ${e.message}`);
    }
    return (linje) => re.test(linje);
  }
  const nål = monster.toLowerCase();
  return (linje) => linje.toLowerCase().includes(nål);
}

function finnTreff(test) {
  const treff = [];
  for (const fil of alleFiler(REPO)) {
    const linjer = fs.readFileSync(fil, 'utf8').split('\n');
    linjer.forEach((linje, i) => {
      if (test(linje)) treff.push({ fil: path.relative(REPO, fil), linje: i + 1, tekst: linje.trim() });
    });
  }
  return treff;
}

function formaterTreff(treff, grense, monster) {
  if (treff.length === 0) return `Ingen treff på «${monster}».`;
  const vist = treff.slice(0, grense).map((t) => `${t.fil}:${t.linje}: ${t.tekst}`);
  const hale = treff.length > vist.length ? `\n… ${treff.length - vist.length} treff til. Snevre inn søket.` : '';
  return vist.join('\n') + hale;
}

function sokIRepo({ monster, regex = false, maks_treff = MAKS_TREFF } = {}) {
  const test = lagTest(monster, regex);
  const grense = Math.min(Math.max(1, Number(maks_treff) || MAKS_TREFF), 200);
  return formaterTreff(finnTreff(test), grense, monster);
}

// Stien fra modellen er upålitelig input: hold den innenfor REPO.
function trygSti(fil) {
  if (typeof fil !== 'string' || !fil.trim()) throw new Error('Mangler «fil».');
  const full = path.resolve(REPO, fil);
  if (full !== REPO && !full.startsWith(REPO + path.sep)) throw new Error('Fila må ligge i hjemsokt-repo.');
  return full;
}

function lesFil({ fil } = {}) {
  const full = trygSti(fil);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    throw new Error(`Fant ikke fila «${fil}». Bruk sok_i_repo for å finne riktig sti.`);
  }
  return fs.readFileSync(full, 'utf8')
    .split('\n')
    .map((linje, i) => `${i + 1}: ${linje}`)
    .join('\n');
}

const escapeRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function finnReferanser({ navn } = {}) {
  if (typeof navn !== 'string' || !navn.trim()) throw new Error('Mangler «navn».');
  const n = escapeRegex(navn.trim());
  const ord = new RegExp(`(?<![\\w$])${n}(?![\\w$])`, 'i');
  const definisjon = new RegExp(
    `^(export\\s+)?(async\\s+)?(function\\*?|class)\\s+${n}\\b|^(export\\s+)?(const|let|var)\\s+${n}\\s*=|^"${n}"\\s*:`,
    'i',
  );
  const treff = finnTreff((linje) => ord.test(linje)).filter((t) => !definisjon.test(t.tekst));
  if (treff.length === 0) {
    return `Ingen referanser til «${navn}» i hjemsokt-repo (utenom definisjonen). Husk at det kan brukes indirekte: ` +
      'config-strenger, dynamisk import, npm-scripts eller andre repoer. Sjekk README og config før du konkluderer.';
  }
  return `${treff.length} referanse(r) til «${navn}»:\n` + formaterTreff(treff, 100, navn);
}

function hentGitHistorikk({ fil } = {}) {
  if (typeof fil !== 'string' || !fil.trim()) throw new Error('Mangler «fil».');
  const logg = JSON.parse(fs.readFileSync(GIT_LOGG, 'utf8'));
  const nøkkel = fil.trim().replace(/^\.\//, '');
  const commits = logg.filer[nøkkel];
  if (!commits) {
    throw new Error(`Ingen historikk for «${fil}». Filer i loggen: ${Object.keys(logg.filer).join(', ')}`);
  }
  const rader = commits.map((c) => `${c.dato}  ${c.hash}  ${c.forfatter}: ${c.melding}`);
  return (logg.merknad ? `Merknad: ${logg.merknad}\n` : '') + rader.join('\n');
}

// Bygger en patch uten å endre repoet: kopierer det til en tempmappe, bruker
// endringene der og lar git lage diffen. Patchen kan brukes med `git apply -p1`.
// Modellen sender av og til en liste som JSON-tekst i stedet for som ekte liste.
function somListe(verdi, navn) {
  if (typeof verdi === 'string') {
    try {
      verdi = JSON.parse(verdi);
    } catch {
      throw new Error(`«${navn}» må være en liste, ikke tekst.`);
    }
  }
  if (!Array.isArray(verdi)) throw new Error(`«${navn}» må være en liste.`);
  return verdi;
}

function foreslaOpprydding(input = {}) {
  const endringer = somListe(input.endringer ?? [], 'endringer');
  const slett_filer = somListe(input.slett_filer ?? [], 'slett_filer');
  if (!endringer.length && !slett_filer.length) throw new Error('Ingen endringer å foreslå.');
  endringer.forEach((e, i) => {
    if (typeof e?.fil !== 'string' || typeof e?.gammel_tekst !== 'string') {
      throw new Error(`endringer[${i}] må være et objekt med «fil» og «gammel_tekst» (tekst).`);
    }
  });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kirkegard-'));
  try {
    const a = path.join(tmp, 'a');
    const b = path.join(tmp, 'b');
    for (const mappe of [a, b]) {
      fs.cpSync(REPO, mappe, { recursive: true, filter: (kilde) => !/[\\/](node_modules|\.git)([\\/]|$)/.test(kilde) });
    }
    for (const { fil, gammel_tekst, ny_tekst = '' } of endringer) {
      const full = path.join(b, path.relative(REPO, trygSti(fil)));
      if (!fs.existsSync(full)) throw new Error(`Fant ikke «${fil}».`);
      const kode = fs.readFileSync(full, 'utf8');
      const antall = typeof gammel_tekst === 'string' && gammel_tekst ? kode.split(gammel_tekst).length - 1 : 0;
      if (antall !== 1) {
        throw new Error(`«gammel_tekst» må finnes nøyaktig én gang i ${fil}, fant ${antall}. Bruk les_fil og kopier teksten eksakt.`);
      }
      fs.writeFileSync(full, kode.replace(gammel_tekst, () => ny_tekst));
    }
    for (const fil of slett_filer) {
      const full = path.join(b, path.relative(REPO, trygSti(fil)));
      if (!fs.existsSync(full)) throw new Error(`Fant ikke «${fil}».`);
      fs.rmSync(full);
    }

    let diff = '';
    try {
      diff = execFileSync('git', ['diff', '--no-index', '--no-color', 'a', 'b'], { cwd: tmp, encoding: 'utf8' });
    } catch (e) {
      diff = e.stdout ?? ''; // git diff --no-index gir exit 1 når det finnes forskjeller
    }
    if (!diff.trim()) throw new Error('Endringene ga ingen forskjell.');
    diff = diff.replace(/^(diff --git |--- |\+\+\+ )(.*)$/gm, (_, pre, rest) => pre + rest.replace(/\ba\/a\//g, 'a/').replace(/\bb\/[ab]\//g, 'b/'));

    fs.writeFileSync(PATCH_FIL, diff);
    execFileSync('git', ['apply', '--check', '-p1', PATCH_FIL], { cwd: REPO }); // kaster hvis patchen ikke passer
    const filer = [...diff.matchAll(/^diff --git a\/(.+) b\//gm)].map((m) => m[1]);
    return `Skrev ${path.relative(process.cwd(), PATCH_FIL)} (${diff.split('\n').length} linjer, ${filer.length} filer: ${filer.join(', ')}). ` +
      'Patchen er sjekket med git apply --check. Repoet er ikke endret.';
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

export const verktøy = [
  {
    definisjon: {
      name: 'sok_i_repo',
      description:
        'Søker gjennom alle filene i hjemsokt-repo (kode, tester, config, package.json) og returnerer ' +
        'treff som «fil:linje: tekst». Bruk det for å finne hvor noe er definert eller brukt, f.eks. et ' +
        'funksjonsnavn, et pakkenavn, "TODO", "it.skip" eller "featureFlags". Vanlig tekstsøk uten ' +
        'hensyn til store og små bokstaver. Sett regex: true for regulære uttrykk. Gir maks 50 treff ' +
        'som standard, så søk smalt hvis du får for mange.',
      input_schema: {
        type: 'object',
        properties: {
          monster: { type: 'string', description: 'Teksten eller regexen du søker etter.' },
          regex: { type: 'boolean', description: 'Tolk monster som regulært uttrykk. Standard false.' },
          maks_treff: { type: 'number', description: 'Maks antall treff (1–200). Standard 50.' },
        },
        required: ['monster'],
      },
    },
    kjør: async (input) => sokIRepo(input),
  },
  {
    definisjon: {
      name: 'les_fil',
      description:
        'Leser innholdet i én fil i hjemsokt-repo, med linjenumre. Oppgi stien relativt til roten av ' +
        'repoet, f.eks. "src/services/bookingService.js". Bruk det når et søketreff ser mistenkelig ut ' +
        'og du trenger å se sammenhengen rundt.',
      input_schema: {
        type: 'object',
        properties: {
          fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo.' },
        },
        required: ['fil'],
      },
    },
    kjør: async (input) => lesFil(input),
  },
  {
    definisjon: {
      name: 'finn_referanser',
      description:
        'Finner alle steder et navn (funksjon, variabel, pakke eller fil) brukes i hjemsokt-repo, ' +
        'utenom der det er definert. Svarer med en liste over filer og linjer, og sier tydelig fra hvis ' +
        'det ikke finnes noen. Husk at kode kan brukes indirekte: via strenger i config, dynamisk ' +
        'import, npm-scripts eller fra andre repoer. Null treff betyr ikke alltid at noe er dødt.',
      input_schema: {
        type: 'object',
        properties: {
          navn: { type: 'string', description: 'Navnet du vil finne bruk av, f.eks. "beregnRabatt" eller "moment".' },
        },
        required: ['navn'],
      },
    },
    kjør: async (input) => finnReferanser(input),
  },
  {
    definisjon: {
      name: 'hent_git_historikk',
      description:
        'Henter commit-historikken for én fil i hjemsokt-repo: dato, forfatter og melding, nyeste først. ' +
        'Bruk det for å si når noe sist ble rørt og av hvem, f.eks. «sist endret av Mona i 2021».',
      input_schema: {
        type: 'object',
        properties: {
          fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo, f.eks. "src/utils/legacyCsv.js".' },
        },
        required: ['fil'],
      },
    },
    kjør: async (input) => hentGitHistorikk(input),
  },
  {
    definisjon: {
      name: 'foresla_opprydding',
      description:
        'Lager en opprydnings-patch (unified diff) som gravlegger de tryggeste funnene, og lagrer den som ' +
        'data/opprydding.patch. Repoet endres ikke. Kall dette én gang helt til slutt, med bare funn du har ' +
        'høy sikkerhet på. Hver endring er en eksakt tekstbit som erstattes (ny_tekst tom = fjern). Hele ' +
        'filer fjernes med slett_filer. Husk å fjerne ubrukte pakker fra package.json også. Aldri ta med ' +
        'ting du har anbefalt å IKKE fjerne.',
      input_schema: {
        type: 'object',
        properties: {
          endringer: {
            type: 'array',
            description: 'Tekstbiter som skal fjernes eller byttes ut.',
            items: {
              type: 'object',
              properties: {
                fil: { type: 'string', description: 'Sti relativt til hjemsokt-repo.' },
                gammel_tekst: { type: 'string', description: 'Eksakt tekst (kan gå over flere linjer) som finnes nøyaktig én gang i fila.' },
                ny_tekst: { type: 'string', description: 'Erstatning. Utelat eller tom streng for å fjerne.' },
              },
              required: ['fil', 'gammel_tekst'],
            },
          },
          slett_filer: { type: 'array', items: { type: 'string' }, description: 'Hele filer som skal slettes.' },
        },
      },
    },
    kjør: async (input) => foreslaOpprydding(input),
  },
];
