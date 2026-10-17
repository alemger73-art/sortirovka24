import {useEffect, useState} from 'react';
import {Button} from '@/components/ui/button';
import {currentInstallPrompt, takeInstallPrompt, isPwaStandalone, type InstallEvent} from '@/lib/pwa';

export default function CourierInstall() {
  const [event,setEvent]=useState<InstallEvent|null>(null);
  const [help,setHelp]=useState(false);
  const [standalone]=useState(isPwaStandalone);
  useEffect(()=>{
    const manifest=document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const old=manifest?.getAttribute('href');
    const metas=['apple-mobile-web-app-title','application-name'].map(name=>document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`));
    const originals=metas.map(meta=>meta?.content);
    // A portal install event must not install the wrong app after SPA navigation.
    if(manifest?.getAttribute('href')!=='/courier.webmanifest') takeInstallPrompt();
    if(manifest)manifest.href='/courier.webmanifest';
    metas.forEach(meta=>{if(meta)meta.content='DAM ALEM Курьер';});
    const ready=()=>setEvent(currentInstallPrompt());
    ready();window.addEventListener('s24:install-ready',ready);
    return ()=>{
      window.removeEventListener('s24:install-ready',ready);
      if(manifest&&old)manifest.setAttribute('href',old);
      metas.forEach((meta,i)=>{if(meta&&originals[i]!=null)meta.content=originals[i]!;});
    };
  },[]);
  if(standalone)return null;
  async function install(){
    if(!event){setHelp(v=>!v);return;}
    const prompt=takeInstallPrompt();setEvent(null);
    if(prompt){await prompt.prompt();await prompt.userChoice;}
  }
  return <div className="p-3 text-center"><Button variant="outline" onClick={()=>void install()}>Установить DAM ALEM Курьер</Button>{help&&<p className="mt-2 text-sm">Откройте этот кабинет в Chrome: меню → «Установить приложение». На iPhone в Safari: «Поделиться» → «На экран Домой». Приложение будет открывать кабинет курьера.</p>}</div>;
}
