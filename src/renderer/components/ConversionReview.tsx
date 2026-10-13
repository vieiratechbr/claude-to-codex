import { useEffect, useState } from 'react';
import type { BundleView } from '../../shared/api';
export function ConversionReview({ bundles, busy, install, update }: { bundles: BundleView[]; busy: boolean; install: (id: string) => void; update: boolean }) {
  const [active,setActive] = useState(bundles[0]?.id); const bundle = bundles.find(b => b.id === active) || bundles[0];
  const [path,setPath] = useState(''); const [preview,setPreview] = useState<{ text: string; original?: string; binary: boolean; truncated: boolean }>(); const [previewError,setPreviewError] = useState(''); const [diff,setDiff] = useState(false);
  useEffect(() => { if (bundle) setPath(bundle.files.find(f => f.path.endsWith('/SKILL.md'))?.path || bundle.files[0]?.path || ''); },[bundle?.id]);
  useEffect(() => {
    let current = true; setPreview(undefined); setPreviewError('');
    if (bundle && path && bundle.files.some(f => f.path === path)) window.claudeToCodex.preview({ bundleId: bundle.id, path }).then(value => { if (current) setPreview(value); }).catch(error => { if (current) setPreviewError(error.message); });
    return () => { current = false; };
  },[bundle?.id,path]);
  if (!bundle) return null;
  const warnings = bundle.findings.filter(f => f.severity === 'warning').length;
  return <section className="panel review">
    <div className="panel-heading"><span className="eyebrow">03 / REVISÃO</span><span className={'tag ' + (bundle.installable ? 'success' : 'danger')}>{bundle.installable ? warnings ? 'Requer configuração' : 'Pronto para instalar' : 'Instalação bloqueada'}</span></div>
    <h2>Revise a conversão</h2><p className="muted">Confira os arquivos e as adaptações antes de adicionar o pacote ao Codex.</p>
    {bundles.length > 1 && <div className="bundle-tabs">{bundles.map(b => <button className={bundle.id === b.id ? 'active' : ''} onClick={() => setActive(b.id)} key={b.id}>{b.pluginName}</button>)}</div>}
    <div className="package-heading"><strong>{bundle.pluginName}</strong><span>{bundle.files.length} arquivos · origem {bundle.sourceCommit.slice(0,10)}</span></div>
    {bundle.findings.length > 0 && <div className="findings">{bundle.findings.map((finding,index) => <div className={'finding ' + finding.severity} key={index}><span aria-hidden="true">{finding.severity === 'blocking' ? '!' : finding.severity === 'warning' ? '△' : 'i'}</span><p>{finding.message}</p></div>)}</div>}
    <div className="files-layout"><div className="file-list"><span className="eyebrow">ARQUIVOS DO PACOTE</span>{bundle.files.slice(0,250).map(file => <button className={file.path === path ? 'active' : ''} onClick={() => setPath(file.path)} key={file.path}><span aria-hidden="true">▤</span>{file.path}</button>)}{bundle.files.length > 250 && <small>Mais arquivos disponíveis no pacote exportado.</small>}</div>
    <div className="file-preview"><div className="preview-heading"><span>{path.split('/').at(-1)}</span>{preview?.original && <button className="quiet small" onClick={() => setDiff(!diff)}>{diff ? 'Mostrar convertido' : 'Comparar original'}</button>}</div>
      {previewError ? <p className="error-text">{previewError}</p> : preview ? <div className={diff ? 'diff-view' : ''}>{diff && preview.original && <div><span className="preview-label">Original</span><pre>{preview.original}</pre></div>}<div>{diff && <span className="preview-label">Convertido</span>}<pre>{preview.text}</pre></div>{preview.truncated && <p className="muted small">Prévia limitada. Exporte para inspecionar o conteúdo completo.</p>}</div> : <p className="muted">Carregando prévia…</p>}
    </div></div>
    <div className="form-footer"><button className="secondary" disabled={busy} onClick={() => window.claudeToCodex.exportBundle(bundle.id).catch(error => setPreviewError(error.message))}>Exportar pacote</button><button className="primary" disabled={busy || !bundle.installable} onClick={() => install(bundle.id)}>{update ? 'Instalar atualização' : 'Instalar no Codex'} <span aria-hidden="true">↗</span></button></div>
  </section>;
}
