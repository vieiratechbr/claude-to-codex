import {useState} from 'react';
export function SkillCalls({calls,entrySkill,installed=false}:{calls:string[];entrySkill?:string;installed?:boolean}){
  const [message,setMessage]=useState('');if(!calls.length)return null;
  const copy=(call:string)=>window.claudeToCodex.copyText(call).then(()=>setMessage(call+' copiado.')).catch(()=>setMessage('Selecione o nome e copie com Ctrl+C.'));
  const pill=(call:string)=><span className="skill-call" key={call}><code>{call}</code><button type="button" className="quiet small" aria-label={'Copiar '+call} onClick={()=>copy(call)}>Copiar</button></span>;
  const packageCall=entrySkill?'$'+entrySkill:undefined;
  return <div className="skill-calls" aria-label="Chamadas das skills"><small>{packageCall?'Chamada do pacote':'Chamada'+(calls.length>1?'s das skills':' da skill')}</small>{packageCall&&pill(packageCall)}{packageCall?<details><summary>{calls.length-1} chamadas individuais</summary><div className="skill-call-list">{calls.filter(call=>call!==packageCall).map(pill)}</div></details>:<div className="skill-call-list">{calls.map(pill)}</div>}<small>{installed?'Use a chamada em uma nova conversa no Codex.':'Disponível para uso depois da instalação.'}</small>{message&&<small role="status">{message}</small>}</div>;
}
