import {test,expect,_electron} from '@playwright/test';
import {build} from 'esbuild';
import {mkdtemp,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
test('skills internas, impedimentos, verificação local e aviso de atualização',async () => {
  await mkdir('.cache',{recursive:true}); const root=await mkdtemp(join(process.cwd(),'.cache/usability-'));
  await build({entryPoints:['tests/helpers/desktop-fixture.ts'],outfile:'dist/main/fixture.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron']});
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  env.C2C_FIXTURE_ROOT=root; env.C2C_FIXTURE_NESTED='1'; env.CODEX_HOME=join(root,'codex-home'); delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:['dist/main/fixture.cjs'],cwd:process.cwd(),env});
  try {
    const page=await app.firstWindow();
    await expect(page.getByText('Nova versão disponível', {exact:true})).toBeVisible();
    await page.getByLabel('Link do GitHub').fill('https://github.com/acme/fixture');
    await page.getByRole('button',{name:'Analisar repositório',exact:true}).click();
    const parent=page.getByRole('checkbox',{name:'Plugin completo: fixture-collection',exact:true});
    const child=page.getByRole('checkbox',{name:'Skill: teste-ui',exact:true});
    await parent.check(); await child.check(); await expect(parent).not.toBeChecked();
    await parent.check(); await expect(child).not.toBeChecked();
    await page.getByLabel('Usar o Codex na adaptação').uncheck();
    await page.getByRole('button',{name:'Converter selecionados',exact:true}).click();
    await expect(page.getByText('Impedimentos para instalar', {exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Instalar no Codex',exact:false})).toBeDisabled();
    await page.getByRole('button',{name:'Escolher skills separadamente',exact:true}).click();
    await child.check();
    await page.getByRole('button',{name:'Converter selecionados',exact:true}).click();
    await page.getByRole('button',{name:'Instalar no Codex',exact:false}).click();
    await page.getByRole('button',{name:'Verificar instalação',exact:true}).click();
    await expect(page.getByRole('heading',{name:'Verificação da instalação',exact:true})).toBeVisible();
    await expect(page.getByText('Arquivos no cache nativo',{exact:true})).toBeVisible();
    await expect(page.getByLabel('Prompt para testar a skill')).toHaveValue(/\$teste-ui/);
    expect(await page.getByText('Falhou',{exact:true}).count()).toBe(0);
    await page.getByRole('button',{name:'Ambiente',exact:false}).click();
    await expect(page.getByRole('button',{name:'Consultar atualizações',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/usability-environment.png'});
  } finally {await app.close();}
});
test('revisão no Histórico escolhe skills da origem correta quando há outra análise aberta',async()=>{
  await mkdir('.cache',{recursive:true});const root=await mkdtemp(join(process.cwd(),'.cache/history-source-'));
  await build({entryPoints:['tests/helpers/desktop-fixture.ts'],outfile:'dist/main/fixture.cjs',bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron']});
  const env=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  env.C2C_FIXTURE_ROOT=root;env.C2C_FIXTURE_NESTED='1';env.CODEX_HOME=join(root,'codex-home');delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({args:['dist/main/fixture.cjs'],cwd:process.cwd(),env});
  try{
    const page=await app.firstWindow();
    await expect(page.getByText('Nova versão disponível',{exact:true})).toBeVisible();
    await page.getByLabel('Link do GitHub').fill('https://github.com/acme/fixture');
    await page.getByRole('button',{name:'Analisar repositório',exact:true}).click();await expect(page.getByRole('heading',{name:'Escolha os componentes'})).toBeVisible();
    const other=await page.evaluate(async()=>{const api=(window as any).claudeToCodex;const analysis=await api.analyze({url:'https://github.com/acme/other'});return(await api.convert({analysisId:analysis.id,componentIds:[analysis.components.find((c:any)=>c.kind==='plugin').id],useCodex:false}))[0];});
    await page.getByRole('button',{name:'Histórico',exact:false}).click();
    await page.locator('article.history-row').filter({has:page.getByText(other.pluginName,{exact:true})}).getByRole('button',{name:'Revisar',exact:true}).click();
    await page.getByRole('button',{name:'Escolher skills separadamente',exact:true}).click();
    await expect(page.getByText('acme/other',{exact:true})).toBeVisible();
  }finally{await app.close();}
});
