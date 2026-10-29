import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Under `npm run dev` videresendes /api til agent-serveren (npm run web i rotmappa).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3000' } },
});
