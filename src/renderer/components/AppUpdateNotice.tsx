import type {AppUpdate} from '../../shared/updates';
export function AppUpdateNotice({value,busy,open,dismiss}:{value:AppUpdate;busy:boolean;open:(url:string)=>void;dismiss:()=>void}) {
  if(value.status!=='available'||!value.downloadUrl)return null;
  return <div className="message notice update-notice" role="status"><div><strong>Nova versão disponível</strong><p>v{value.latestVersion} para Windows · sua versão: v{value.installedVersion}</p></div><button className="secondary small" disabled={busy} onClick={()=>open(value.downloadUrl!)}>Abrir download</button><button className="quiet small" onClick={dismiss}>Dispensar</button></div>;
}
