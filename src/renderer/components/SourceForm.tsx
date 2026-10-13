import { useState } from 'react';
import type { SourceRequest } from '../../shared/contracts';
export function SourceForm({ busy, submit }: { busy: boolean; submit: (request: SourceRequest) => void }) {
  const [url,setUrl] = useState(''); const [ref,setRef] = useState(''); const [folder,setFolder] = useState('');
  return <form className="source-form" onSubmit={event => { event.preventDefault(); submit({ url, ref: ref || undefined, subdirectory: folder || undefined }); }}>
    <div className="panel-heading"><span className="eyebrow">01 / ORIGEM</span><span className="muted">GitHub · público ou acessível pelo seu Git</span></div>
    <h2>Comece pelo link.</h2><p className="muted">Cole o repositório de um plugin ou de uma coleção de skills do Claude Code.</p>
    <div className="source-link"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 13 4-4m-6 6-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><label className="field">Link do GitHub<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/autor/plugin" autoComplete="off" spellCheck={false} disabled={busy}/></label></div>
    <details className="advanced-options"><summary>Opções avançadas</summary><p className="muted small">Use apenas para escolher uma versão ou uma pasta específica. Sem preencher, usamos a branch padrão e o repositório inteiro.</p>
    <div className="form-grid"><label className="field">Referência <span className="optional">opcional</span><input value={ref} onChange={event => setRef(event.target.value)} placeholder="Branch, tag ou commit" disabled={busy}/></label>
    <label className="field">Pasta <span className="optional">opcional</span><input value={folder} onChange={event => setFolder(event.target.value)} placeholder="Ex.: skills/minha-skill" disabled={busy}/></label></div>
    </details>
    <div className="form-footer"><span className="source-safety muted small"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m12 3 7 3v6c0 4-4 7-7 9-3-2-7-5-7-9V6l7-3Z" stroke="currentColor" strokeWidth="1.5"/><path d="m8.5 11.5 2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>A análise preserva a origem e não executa seus scripts.</span><button className="primary" type="submit" disabled={busy || !url.trim()}>Analisar repositório <span aria-hidden="true">↗</span></button></div>
  </form>;
}
