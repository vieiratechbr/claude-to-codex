import { useState } from 'react';
import type { SourceRequest } from '../../shared/contracts';
export function SourceForm({ busy, submit }: { busy: boolean; submit: (request: SourceRequest) => void }) {
  const [url,setUrl] = useState(''); const [ref,setRef] = useState(''); const [folder,setFolder] = useState('');
  return <form className="source-form" onSubmit={event => { event.preventDefault(); submit({ url, ref: ref || undefined, subdirectory: folder || undefined }); }}>
    <div className="panel-heading"><span className="eyebrow">01 / ORIGEM</span><span className="muted">GitHub · público ou acessível pelo seu Git</span></div>
    <h2>Comece pelo repositório.</h2><p className="muted">Cole o link de um plugin ou de uma coleção de skills do Claude Code.</p>
    <label className="field">Link do GitHub<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://github.com/autor/plugin" autoComplete="off" spellCheck={false} disabled={busy}/></label>
    <div className="form-grid"><label className="field">Referência <span className="optional">opcional</span><input value={ref} onChange={event => setRef(event.target.value)} placeholder="Branch, tag ou commit · padrão da origem" disabled={busy}/></label>
    <label className="field">Pasta <span className="optional">opcional</span><input value={folder} onChange={event => setFolder(event.target.value)} placeholder="Ex.: skills/minha-skill" disabled={busy}/></label></div>
    <div className="form-footer"><span className="muted small">A origem é analisada sem executar seus scripts.</span><button className="primary" type="submit" disabled={busy || !url.trim()}>Analisar repositório <span aria-hidden="true">↗</span></button></div>
  </form>;
}
