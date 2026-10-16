import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {findExecutable} from '../../src/core/codex';
it.skipIf(process.env.C2C_NATIVE_TEST!=='1')('Codex real respeita chamada manual sem usar conta ou modelo externo',async()=>{
  const root=await mkdtemp(join(tmpdir(),'c2c-native-policy-'));
  try{
    const home=join(root,'home');await mkdir(home);
    for(const [name,implicit] of [['manual-probe',false],['automatic-probe',true]] as const){
      const folder=join(root,'.agents','skills',name);await mkdir(join(folder,'agents'),{recursive:true});
      await writeFile(join(folder,'SKILL.md'),`---\nname: ${name}\ndescription: Artificial advice fixture ${name}\n---\nMANUAL_BODY_SENTINEL`);
      await writeFile(join(folder,'agents','openai.yaml'),`policy:\n  allow_implicit_invocation: ${implicit}\n`);
    }
    const executable=await findExecutable('codex');expect(executable).toBeDefined();
    for(const explicit of [false,true]){
      let captured:{input:unknown}|undefined;
      const server=createServer((request,response)=>{
        let body='';request.on('data',chunk=>body+=chunk);request.on('end',()=>{
          captured=JSON.parse(body);response.writeHead(401,{'content-type':'application/json'});
          response.end(JSON.stringify({error:{message:'Artificial fixture ends before generation',type:'invalid_request_error',code:'invalid_api_key'}}));
        });
      });
      await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));
      try{
        const address=server.address();if(!address||typeof address==='string')throw new Error('Missing local fixture port');
        const args=['-c','model_provider="fixture"','-c','model_providers.fixture.name="fixture"','-c',`model_providers.fixture.base_url="http://127.0.0.1:${address.port}/v1"`,'-c','model_providers.fixture.env_key="C2C_PROVIDER_FIXTURE_KEY"','-c','model_providers.fixture.wire_api="responses"','-c','model="fixture"','exec','--ignore-user-config','--ignore-rules','--ephemeral','--skip-git-repo-check','--sandbox','read-only','--cd',root,explicit?'$manual-probe Give advice.':'List relevant advice.'];
        await new Promise<void>((done,reject)=>{
          const child=spawn(executable!,args,{cwd:root,env:{...process.env,CODEX_HOME:home,C2C_PROVIDER_FIXTURE_KEY:'fixture-only'},windowsHide:true,stdio:['ignore','ignore','pipe']});let errors='';
          child.stderr.on('data',chunk=>errors+=chunk);const timeout=setTimeout(()=>{child.kill();reject(new Error('Local provider fixture timed out'));},30000);
          child.on('error',error=>{clearTimeout(timeout);reject(error);});child.on('exit',()=>{clearTimeout(timeout);if(!captured)reject(new Error('No local provider request: '+errors.slice(-1000)));else done();});
        });
        const input=JSON.stringify(captured!.input);
        expect(input.includes('Artificial advice fixture manual-probe')).toBe(explicit);
        expect(input.includes('Artificial advice fixture automatic-probe')).toBe(true);
        expect(input.includes('MANUAL_BODY_SENTINEL')).toBe(explicit);
      }finally{await new Promise<void>((done,reject)=>server.close(error=>error?reject(error):done()));}
    }
  }finally{await rm(root,{recursive:true,force:true});}
},90000);
