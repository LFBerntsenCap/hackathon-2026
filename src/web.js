// Webgrensesnitt: npm run web, og åpne http://localhost:3000
// Serverer public/ og kjører agenten på forespørsel, med hvert steg strømmet som SSE.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { kjørAgent } from './agent.js';
import { system, eksempelOppgave, verktøy, PATCH_FIL } from './verktoy.js';

try {
  process.loadEnvFile();
} catch {
  // Ingen .env — da må ANTHROPIC_API_KEY være satt i miljøet.
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Mangler ANTHROPIC_API_KEY. Kopier .env.example til .env og lim inn nøkkelen.');
  process.exit(1);
}

const PORT = Number(process.env.PORT ?? 3000);
// Den bygde React-appen (cd frontend && npm run build) har forrang; ellers den enkle siden i public/.
const DIST = path.resolve(import.meta.dirname, '../frontend/dist');
const PUBLIC = fs.existsSync(DIST) ? DIST : path.resolve(import.meta.dirname, '../public');
const TYPER = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// Én graver om gangen: hver kjøring koster API-kall og skriver til samme patch-fil.
let opptatt = false;

async function kjørMedStrøm(oppgave, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
  const send = (h) => res.write(`data: ${JSON.stringify(h)}\n\n`);
  opptatt = true;
  const start = Date.now();
  const avbryt = new AbortController();
  res.on('close', () => avbryt.abort());
  try {
    await kjørAgent({ system, oppgave, verktøy, ved: send, signal: avbryt.signal });
  } catch (e) {
    send({ type: 'stoppet', melding: e.message });
  } finally {
    opptatt = false;
    // Bare en patch fra denne kjøringen teller, ikke en gammel en.
    send({ type: 'slutt', patch: fs.existsSync(PATCH_FIL) && fs.statSync(PATCH_FIL).mtimeMs >= start });
    res.end();
  }
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === '/api/kjor') {
      if (opptatt) {
        res.writeHead(409, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Graveren er allerede i gang.');
      }
      const oppgave = url.searchParams.get('oppgave')?.trim() || eksempelOppgave;
      return kjørMedStrøm(oppgave, res);
    }

    if (url.pathname === '/api/patch') {
      if (!fs.existsSync(PATCH_FIL)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Ingen patch ennå.');
      }
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(fs.readFileSync(PATCH_FIL, 'utf8'));
    }

    if (url.pathname === '/api/info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ eksempelOppgave, patch: fs.existsSync(PATCH_FIL) }));
    }

    // Statiske filer, låst til public/.
    const fil = path.resolve(PUBLIC, url.pathname === '/' ? 'index.html' : `.${url.pathname}`);
    if (!fil.startsWith(PUBLIC + path.sep) || !fs.existsSync(fil) || !fs.statSync(fil).isFile()) {
      res.writeHead(404);
      return res.end('Ikke funnet');
    }
    res.writeHead(200, { 'content-type': TYPER[path.extname(fil)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(fil));
  })
  .listen(PORT, () => console.log(`🪦 Kodekirkegården åpen på http://localhost:${PORT}`));
