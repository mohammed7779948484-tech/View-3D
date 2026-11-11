/** Runs the layout engine in its worker on a fixed real-product shop and shows the time and a fingerprint of the result. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { runLayout } from '../worker/run-layout';
import { layoutTestRequest } from './layout-request';

type State =
  | { status: 'idle' | 'running' }
  | { status: 'done'; ms: number; options: number; sha256: string }
  | { status: 'failed'; message: string };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function LayoutSpeedTest() {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: 'idle' });

  async function run(): Promise<void> {
    setState({ status: 'running' });
    const started = performance.now();
    try {
      const text = await runLayout(layoutTestRequest()).result;
      const ms = performance.now() - started;
      const options = (JSON.parse(text) as { options: unknown[] }).options.length;
      setState({ status: 'done', ms, options, sha256: await sha256Hex(text) });
    } catch (error) {
      setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div
      className="layout-test"
      data-layout-status={state.status}
      {...(state.status === 'done'
        ? { 'data-layout-ms': state.ms.toFixed(1), 'data-layout-options': state.options, 'data-layout-sha256': state.sha256 }
        : {})}
    >
      <h3>{t('diagnostics.layoutTitle')}</h3>
      <p className="hint">{t('diagnostics.layoutIntro')}</p>
      <button type="button" disabled={state.status === 'running'} onClick={() => void run()}>
        {t('diagnostics.layoutRun')}
      </button>
      {state.status === 'running' && <p className="status">{t('diagnostics.layoutRunning')}</p>}
      {state.status === 'done' && <p className="status ok">{t('diagnostics.layoutDone', { ms: Math.round(state.ms), options: state.options })}</p>}
      {state.status === 'failed' && <p role="alert">{t('diagnostics.layoutFailed', { message: state.message })}</p>}
    </div>
  );
}
