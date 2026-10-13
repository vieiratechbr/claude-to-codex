import { useEffect, useState } from 'react';
import type { AnalysisView, BundleView, HistoryView } from '../shared/api';
import type { Diagnostics, ProgressEvent, InstallResult } from '../shared/contracts';
import { SourceForm } from './components/SourceForm';
import { ComponentPicker } from './components/ComponentPicker';
import { ConversionReview } from './components/ConversionReview';
import { History } from './components/History';
import { Diagnostics as Environment } from './components/Diagnostics';
import { ClaudeMark, CodexMark } from './components/BrandMarks';
const api = window.claudeToCodex;
export function App() {
  const [tab,setTab] = useState('convert'); const [diagnostics,setDiagnostics] = useState<Diagnostics>();
  const [analysis,setAnalysis] = useState<AnalysisView>(); const [selected,setSelected] = useState<string[]>([]);
  const [bundles,setBundles] = useState<BundleView[]>([]); const [history,setHistory] = useState<HistoryView[]>([]);
  const [installedBundles,setInstalledBundles] = useState<string[]>([]);
  const [busy,setBusy] = useState(false); const [assisted,setAssisted] = useState(true);
  const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [progress,setProgress] = useState<ProgressEvent>();
  const [updateTarget,setUpdateTarget] = useState<string>(); const [settings,setSettings] = useState<{ dataRoot: string; codexHome: string; codexPath?: string }>();
  useEffect(() => { window.scrollTo(0,0); },[tab,analysis?.id,bundles[0]?.id]);
  async function refreshHistory() { setHistory(await api.listHistory()); }
  async function run(action: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await action(); await refreshHistory(); } catch (error) { setError((error as Error).message); } finally { setBusy(false); setProgress(undefined); } }
  useEffect(() => {
    if (!api) return;
    api.diagnose().then(setDiagnostics).catch(error => setError(error.message)); refreshHistory().catch(error => setError(error.message)); api.settings().then(setSettings).catch(error => setError(error.message));
    return api.onProgress(setProgress);
  },[]);
  function installed(result: InstallResult) { if (result.state === 'failed' || result.state === 'conflict') setError(result.findings.map(f => f.message).join(' ')); else setNotice(result.recognized ? 'Instalação reconhecida pelo Codex.' : result.state === 'restored' ? 'Estado anterior recuperado.' : 'Plugin removido do Codex.'); }
  const allInstalled = bundles.length > 0 && bundles.every(bundle => installedBundles.includes(bundle.id));
  const currentStep = allInstalled ? 3 : bundles.length ? 2 : analysis ? 1 : 0;
  if (!api) return <main className="connection-error"><h1>Claude to Codex</h1><p>Não foi possível conectar à interface local. Reabra o aplicativo.</p></main>;
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M4 9L15 3L26 9V21L15 27L4 21V9Z" stroke="currentColor" strokeWidth="1.5"/><path d="M15 15L26 9M15 15V27M15 15L4 9M22 21L32 15" stroke="currentColor" strokeWidth="1.5"/><path d="M26 25L32 21V15" stroke="currentColor" strokeWidth="1.5"/></svg><span>claude<span className="brand-arrow"> to </span>codex</span></div>
      <span className="sidebar-caption">SEU WORKFLOW, OUTRO DESTINO.</span>
      <nav aria-label="Navegação principal"><button className={tab === 'convert' ? 'active' : ''} disabled={busy} onClick={() => setTab('convert')}><span aria-hidden="true">⇄</span>Conversão</button><button className={tab === 'history' ? 'active' : ''} disabled={busy} onClick={() => { setTab('history'); refreshHistory().catch(error => setError(error.message)); }}><span aria-hidden="true">↺</span>Histórico</button><button className={tab === 'settings' ? 'active' : ''} disabled={busy} onClick={() => setTab('settings')}><span aria-hidden="true">⚙</span>Ambiente</button></nav>
      <div className="sidebar-note"><span className="status-dot green"></span><strong>Aplicativo local</strong><p>Arquivos e histórico ficam nesta máquina.</p></div><div className="sidebar-footer"><span>CLAUDE TO CODEX</span><small>v0.1.1 · Windows</small></div>
    </aside>
    <main className="workspace"><header className="topbar"><span>{tab === 'convert' ? 'Conversão de workflows' : tab === 'history' ? 'Histórico local' : 'Seu ambiente'}</span><span className="local-badge"><span className="status-dot green"></span>{diagnostics?.authenticated ? 'Codex autenticado' : 'Integração local'}</span></header>
      <div className="workspace-content">
        {tab === 'convert' && <><section className="hero"><div className="hero-copy"><span className="eyebrow">SUAS FERRAMENTAS, NOVAS POSSIBILIDADES</span><h1>Do Claude Code<br/>para o <span>seu Codex.</span></h1><p>Traga suas skills e plugins. Cole o link, confira a adaptação e instale no Codex da sua máquina.</p></div><div className="bridge-visual" aria-label="Converter do Claude Code para o Codex"><div className="bridge-card source-card"><span className="bridge-caption">ORIGEM</span><ClaudeMark/><strong>Claude Code</strong><small>Skills e plugins</small></div><div className="bridge-line" aria-hidden="true"><span>→</span></div><div className="bridge-card target-card"><span className="bridge-caption">DESTINO</span><CodexMark/><strong>Codex</strong><small>Na sua máquina</small></div></div></section>
        <ol className="flow-steps" aria-label="Etapas da conversão">{['Colar link','Escolher skills','Revisar','Instalar'].map((label,index) => <li className={'flow-step' + (index === currentStep ? ' current' : '') + (index < currentStep || allInstalled ? ' completed' : '')} aria-current={index === currentStep ? 'step' : undefined} key={label}><span className="step-number" aria-hidden="true">{index < currentStep || allInstalled ? '✓' : index + 1}</span><span className="step-label">{label}<small>{['Repositório do GitHub','O que você quer trazer','Confira os arquivos',allInstalled ? 'Concluído no Codex' : 'Adicionar ao Codex'][index]}</small></span></li>)}</ol></>}
        {error && <div className="message error" role="alert"><strong>Não foi possível concluir.</strong><p>{error}</p><button className="quiet small" onClick={() => setError('')}>Fechar</button></div>}
        {notice && <div className="message notice" role="status"><strong>{notice}</strong><p>Abra uma nova conversa ou reinicie o Codex para carregar mudanças de plugins.</p></div>}
        {tab === 'convert' && <div className="conversion-stack">
          {bundles.length ? <><div className="back-row"><button className="quiet small" disabled={busy} onClick={() => { setBundles([]); setUpdateTarget(undefined); }}>← Voltar à seleção</button><button className="quiet small" disabled={busy} onClick={() => { setBundles([]); setAnalysis(undefined); setUpdateTarget(undefined); }}>Nova origem ↗</button></div><ConversionReview key={bundles[0].id} bundles={bundles} busy={busy} installedIds={installedBundles} update={Boolean(updateTarget)} install={id => run(async () => { const result = updateTarget ? await api.applyUpdate({ installationId: updateTarget, bundleId: id }) : await api.install(id); installed(result); if (result.recognized && (result.state === 'installed' || result.state === 'updated')) setInstalledBundles(previous => [...new Set([...previous,id])]); })}/></>
          : analysis ? <><div className="back-row"><button className="quiet small" disabled={busy} onClick={() => setAnalysis(undefined)}>← Outra origem</button><span className="muted small">{analysis.request.url.replace('https://github.com/','').replace(/\.git$/,'')}</span></div><ComponentPicker analysis={analysis} selected={selected} change={setSelected} assisted={assisted} setAssisted={setAssisted} busy={busy} convert={() => run(async () => setBundles(await api.convert({ analysisId: analysis.id, componentIds: selected, useCodex: assisted })))}/></>
          : <SourceForm busy={busy} submit={request => run(async () => { const result = await api.analyze(request); setAnalysis(result); setSelected(result.components.length === 1 ? [result.components[0].id] : []); setUpdateTarget(undefined); setInstalledBundles([]); })}/>}
        </div>}
        {tab === 'history' && <History records={history} busy={busy} update={id => run(async () => { const result = await api.prepareUpdate({ installationId: id, useCodex: assisted }); setBundles(result); setInstalledBundles([]); setUpdateTarget(id); setTab('convert'); })} remove={id => run(async () => { installed(await api.remove(id)); setInstalledBundles([]); })} restore={id => run(async () => { installed(await api.restore(id)); setInstalledBundles([]); })} review={id => run(async () => {
          const record = history.find(r => r.id === id); if (!record) throw new Error('Conversão não encontrada.');
          const raw = await api.reviewBundle(id); setBundles([raw]); setUpdateTarget(undefined); setTab('convert');
        })}/>}
        {tab === 'settings' && <section className="panel settings"><span className="eyebrow">INTEGRAÇÃO E ARMAZENAMENTO</span><h2>Conectado à sua máquina.</h2><p className="muted">A conversão usa o Codex instalado. O aplicativo não coleta sua senha ou uma chave de API separada.</p><dl><dt>Codex</dt><dd>{diagnostics?.codexPath || 'Não encontrado'}</dd><dt>Dados do aplicativo</dt><dd>{settings?.dataRoot}</dd><dt>Configuração do Codex</dt><dd>{settings?.codexHome}</dd></dl><div className="settings-actions"><button className="secondary" disabled={busy} onClick={() => run(async () => setDiagnostics(await api.selectCodexExecutable()))}>Selecionar Codex</button><button className="secondary" onClick={() => api.openDataFolder().catch(error => setError(error.message))}>Abrir dados locais</button><button className="quiet" disabled={busy} onClick={() => run(async () => { await api.cleanDownloads(); setNotice('Downloads limpos. Histórico e backups preservados.'); })}>Limpar downloads</button></div>
          {diagnostics?.findings.map((f,index) => <p className="environment-finding" key={index}>{f.message}</p>)}<div className="settings-note"><strong>Local, com conexão quando necessário.</strong><p>O GitHub exige internet para baixar a origem. A adaptação assistida usa o modelo e os limites da sua conta no Codex.</p></div></section>}
        <Environment value={diagnostics} busy={busy} refresh={() => run(async () => setDiagnostics(await api.diagnose()))}/>
      </div>
      {busy && <div className="progress-banner" role="status"><span className="spinner"></span><div><strong>{progress?.message || 'Preparando operação…'}</strong><small>Os arquivos da origem são preservados.</small></div>{progress && <button className="secondary small" onClick={() => api.cancel(progress.operationId).catch(error => setError(error.message))}>Cancelar</button>}</div>}
    </main>
  </div>;
}
