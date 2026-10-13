import type { AnalysisView } from '../../shared/api';
export function ComponentPicker({ analysis, selected, change, assisted, setAssisted, busy, convert }: { analysis: AnalysisView; selected: string[]; change: (value: string[]) => void; assisted: boolean; setAssisted: (value: boolean) => void; busy: boolean; convert: () => void }) {
  return <section className="panel">
    <div className="panel-heading"><span className="eyebrow">02 / COMPONENTES</span><span className="commit">{analysis.commit.slice(0,10)}</span></div>
    <h2>Escolha os componentes</h2><p className="muted">{analysis.components.length} encontrados. Selecione o que quer levar para o Codex.</p>
    <div className="component-list">{analysis.components.map(component => <label className={'component ' + (selected.includes(component.id) ? 'selected' : '')} key={component.id}>
      <input type="checkbox" checked={selected.includes(component.id)} disabled={busy} onChange={event => change(event.target.checked ? [...selected,component.id] : selected.filter(id => id !== component.id))}/>
      <span className="component-icon" aria-hidden="true">{component.kind === 'plugin' ? '◇' : '⌘'}</span><span className="component-copy"><strong>{component.name}</strong><small>{component.root || 'Raiz do repositório'} · {component.fileCount} arquivos</small></span>
      <span className={'tag ' + (component.findings.some(f => f.severity === 'blocking') ? 'danger' : '')}>{component.kind === 'plugin' ? 'Plugin' : 'Skill'}</span>
    </label>)}</div>
    <label className="assisted"><input type="checkbox" checked={assisted} disabled={busy} onChange={event => setAssisted(event.target.checked)}/><span><strong>Usar o Codex na adaptação</strong><small>Reutiliza sua conta e usa internet quando a interpretação das instruções for necessária.</small></span></label>
    <div className="form-footer"><button type="button" className="quiet" disabled={busy} onClick={() => change(selected.length === analysis.components.length ? [] : analysis.components.map(c => c.id))}>{selected.length === analysis.components.length ? 'Limpar seleção' : 'Selecionar todos'}</button><button className="primary" disabled={busy || !selected.length} onClick={convert}>Converter selecionados <span aria-hidden="true">→</span></button></div>
  </section>;
}
