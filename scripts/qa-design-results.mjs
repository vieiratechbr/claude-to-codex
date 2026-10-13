const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
export function validateDesignSearch(result, designSystem) {
  if (!object(result) || result.error) throw new Error('Failed design search response.');
  if (designSystem) {
    const ds = result.design_system;
    if (!object(ds) || !text(ds.project_name) || !object(ds.style) || !text(ds.style.name) || !object(ds.colors) || !/^#[0-9a-f]{6}$/i.test(ds.colors.primary) || !object(ds.typography) || !text(ds.typography.heading) || !text(ds.typography.body)) throw new Error('Design system is missing useful style, colors, or typography.');
  } else if (!Array.isArray(result.results) || !result.results.length || !result.results.every(row => object(row) && Object.values(row).filter(text).length >= 2)) throw new Error('Design search returned empty or invalid results.');
}
