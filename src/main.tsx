import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/fonts.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';

async function start() {
  if (import.meta.env.VITE_API_MODE !== 'real') {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest(request, print) {
        if (new URL(request.url).pathname.startsWith('/v1/')) print.error();
      },
      quiet: true,
    });
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
start().catch(() => {
  document.getElementById('root')!.textContent =
    '앱을 시작하지 못했습니다. 페이지를 새로고침해 주세요.';
});
