// Export the repository's vectors through Chromium into native NSIS resources.
// Run with Electron on Windows: electron scripts/generate-installer-assets.cjs
const {app,BrowserWindow}=require('electron');
const {readFile,writeFile}=require('node:fs/promises');
const {join}=require('node:path');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.on('window-all-closed',()=>{});
const root=join(__dirname,'../build/installer');
function bitmap(image,width,height){
  const pixels=image.toBitmap();
  if(pixels.length!==width*height*4)throw new Error('Unexpected bitmap size.');
  const stride=(width*3+3)&~3,output=Buffer.alloc(54+stride*height);
  output.write('BM');output.writeUInt32LE(output.length,2);output.writeUInt32LE(54,10);
  output.writeUInt32LE(40,14);output.writeInt32LE(width,18);output.writeInt32LE(height,22);
  output.writeUInt16LE(1,26);output.writeUInt16LE(24,28);output.writeUInt32LE(stride*height,34);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const from=(y*width+x)*4,to=54+(height-1-y)*stride+x*3;
    pixels.copy(output,to,from,from+3);
  }
  return output;
}
async function render(file,width,height){
  const window=new BrowserWindow({width,height,show:false,frame:false,transparent:true,backgroundColor:'#00000000',webPreferences:{sandbox:true,nodeIntegration:false,contextIsolation:true}});
  try{
    await window.loadURL('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(await readFile(join(root,file),'utf8')));
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))');
    return (await window.webContents.capturePage()).resize({width,height,quality:'best'});
  }finally{window.destroy();}
}
app.whenReady().then(async()=>{
  if(process.platform!=='win32')throw new Error('Export requires Windows bitmap byte order and Segoe UI.');
  for(const [name,width,height]of [['sidebar',164,314],['header',150,57]]){
    const image=await render(name+'.svg',width,height);
    await writeFile(join(root,name+'.bmp'),bitmap(image,width,height));
    await writeFile(join(root,name+'.png'),image.toPNG());
  }
  const icon=await render('app-icon.svg',256,256),sizes=[16,32,48,64,128,256];
  const images=sizes.map(size=>icon.resize({width:size,height:size,quality:'best'}).toPNG());
  const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
  let offset=header.length;
  sizes.forEach((size,i)=>{const entry=6+i*16;header[entry]=size===256?0:size;header[entry+1]=header[entry];header.writeUInt16LE(1,entry+4);header.writeUInt16LE(32,entry+6);header.writeUInt32LE(images[i].length,entry+8);header.writeUInt32LE(offset,entry+12);offset+=images[i].length;});
  await writeFile(join(root,'app-icon.ico'),Buffer.concat([header,...images]));
  await writeFile(join(root,'app-icon.png'),icon.toPNG());
  console.log('Exported installer bitmaps and six icon sizes.');
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
