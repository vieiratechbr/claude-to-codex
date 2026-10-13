import { expect, it } from 'vitest';
import { validateDesignSearch } from '../../scripts/qa-design-results.mjs';
it.each([{ design_system: {} }, { design_system: [] }, { results: [null] }, { results: [{}] }])('não declara uma busca vazia ou malformada como aprovada: %j', result => {
  expect(() => validateDesignSearch(result, 'design_system' in result)).toThrow();
});
it('exige recomendações úteis de design e registros de busca', () => {
  expect(() => validateDesignSearch({ design_system: { project_name: 'QA', style: { name: 'Minimalism' }, colors: { primary: '#2563eb' }, typography: { heading: 'Inter', body: 'Inter' } } }, true)).not.toThrow();
  expect(() => validateDesignSearch({ results: [{ Category: 'Accessibility', Issue: 'Focus indicator' }] }, false)).not.toThrow();
});
