import type { AnalysisView } from '../../shared/api';
export function ComponentPicker({ analysis, selected, change, assisted, setAssisted, busy, convert }: { analysis: AnalysisView; selected: string[]; change: (value: string[]) => void; assisted: boolean; setAssisted: (value: boolean) => void; busy: boolean; convert: () => void }) {
  const components = analysis.components;
  const leafIds = components.filter(item => !components.some(child => child.parentPluginId === item.id)).map(item => item.id);
  const allLeaves = leafIds.length > 0 && leafIds.every(id => selected.includes(id)) && selected.length === leafIds.length;
  const toggle = (component: typeof components[number], checked: boolean) => {
    const next = new Set(selected);
    if (!checked) next.delete(component.id);
    else {
      if (component.parentPluginId) next.delete(component.parentPluginId);
      for (const child of components.filter(item => item.parentPluginId === component.id)) next.delete(child.id);
      next.add(component.id);
    }
    change([...next]);
  };
  return <section className="panel">
    <div className="panel-heading"><span className="eyebrow">02 / COMPONENTES</span><span className="commit">{analysis.commit.slice(0,10)}</span></div>
    <h2>Escolha os componentes</h2><p className="muted">{components.filter(c => c.kind === 'skill').length} skills e {components.filter(c => c.kind === 'plugin').length} plugins encontrados. Escolha o pacote completo ou apenas as skills que quer levar.</p>
    <div className="component-list">{analysis.components.map(component => <label className={'component ' + (selected.includes(component.id) ? 'selected' : '')} key={component.id}>
      <input type="checkbox" aria-label={(component.kind === 'plugin' ? 'Plugin completo: ' : 'Skill: ') + component.name} checked={selected.includes(component.id)} disabled={busy} onChange={event => toggle(component,event.target.checked)}/>
      <span className="component-icon" aria-hidden="true">{component.kind === 'plugin' ? '◇' : '⌘'}</span><span className="component-copy"><strong>{component.name}{component.kind === 'plugin' ? ' · plugin completo' : ''}</strong><small>{component.parentPluginId ? 'Skill de ' + components.find(item => item.id === component.parentPluginId)?.name + ' · ' : ''}{component.root || 'Raiz do repositório'} · {component.fileCount} arquivos</small></span>
      <span className={'tag ' + (component.findings.some(f => f.severity === 'blocking') ? 'danger' : '')}>{component.kind === 'plugin' ? 'Plugin' : 'Skill'}</span>
    </label>)}</div>
    <label className="assisted"><input type="checkbox" checked={assisted} disabled={busy} onChange={event => setAssisted(event.target.checked)}/><span><strong>Usar o Codex na adaptação</strong><small>Reutiliza sua conta e usa internet quando a interpretação das instruções for necessária.</small></span></label>
    <div className="form-footer"><button type="button" className="quiet" disabled={busy} onClick={() => change(allLeaves ? [] : leafIds)}>{allLeaves ? 'Limpar seleção' : components.some(c => c.parentPluginId) ? 'Selecionar skills' : 'Selecionar todos'}</button><button className="primary" disabled={busy || !selected.length} onClick={convert}>Converter selecionados <span aria-hidden="true">→</span></button></div>
  </section>;
}
