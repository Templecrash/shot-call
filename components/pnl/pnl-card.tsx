import {pnlMoney,pnlPercent,type PnlCardData} from '@/lib/pnl-card';
export const snapshotDate=(time:number)=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'UTC',timeZoneName:'short'}).format(time);
const dollars=(n:number)=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);
export function PnlCard({card}:{card:PnlCardData}){
  return <article className={`pnl-card ${card.percent<0?'loss':card.percent>0?'gain':'neutral'}`} aria-label={`${card.title} ${card.label} ${pnlPercent(card.percent)}`}>
    <img className="pnl-card-art" src={card.artwork} alt=""/>
    <div className="pnl-card-shade"/>
    <header><span className="pnl-card-brand">Shot Call✳</span><span className="pnl-demo-badge">Demo returns</span></header>
    <div className="pnl-card-identity">{card.creator.avatarUrl && <img src={card.creator.avatarUrl} alt=""/>}<span>{card.creator.handle?'@'+card.creator.handle:card.creator.name}</span></div>
    <h2>{card.title}</h2>
    <div className="pnl-card-result"><span>{card.label}</span><strong>{pnlPercent(card.percent)}</strong>{card.profit!==null && <b>{pnlMoney(card.profit)}</b>}</div>
    <footer><div>{card.cost!==null&&<span>{card.costLabel}<b>{dollars(card.cost)}</b></span>}<span>Position<b>{card.status}</b></span><span>Market<b>{card.execution}</b></span></div>
      <p>As of {snapshotDate(card.asOf)} · Net of fees · Simulated performance</p>
    </footer>
  </article>;
}

async function bitmap(url:string){try{const r=await fetch(url);if(!r.ok)return null;return await createImageBitmap(await r.blob());}catch{return null;}}
function cover(context:CanvasRenderingContext2D,image:ImageBitmap,width:number,height:number){
  const scale=Math.max(width/image.width,height/image.height),w=width/scale,h=height/scale;
  context.drawImage(image,(image.width-w)/2,(image.height-h)/2,w,h,0,0,width,height);
}
export async function pnlCardPng(card:PnlCardData):Promise<Blob>{
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=800;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Could not prepare the image.');
  const [art,avatar]=await Promise.all([bitmap(card.artwork),card.creator.avatarUrl?bitmap(card.creator.avatarUrl):null]);
  const background=ctx.createLinearGradient(0,0,1200,800);background.addColorStop(0,'#624161');background.addColorStop(1,'#142c31');ctx.fillStyle=background;ctx.fillRect(0,0,1200,800);
  if(art){cover(ctx,art,1200,800);art.close();}
  const shade=ctx.createLinearGradient(0,0,1100,800);shade.addColorStop(0,'#171120bb');shade.addColorStop(1,'#0a172bdd');ctx.fillStyle=shade;ctx.fillRect(0,0,1200,800);
  ctx.fillStyle='#fff9ef';ctx.font='bold 37px Georgia';ctx.fillText('Shot Call✳',62,75);
  ctx.font='20px Arial';ctx.textAlign='right';ctx.fillText('DEMO RETURNS',1138,72);ctx.textAlign='left';
  if(avatar){ctx.save();ctx.beginPath();ctx.arc(84,125,22,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,62,103,44,44);ctx.restore();avatar.close();}
  ctx.font='22px Arial';ctx.fillText(card.creator.handle?'@'+card.creator.handle:card.creator.name,avatar?120:62,132);
  ctx.font='52px Georgia';const words=card.title.split(/\s+/);let line='',y=210,lines=0;
  for(let i=0;i<words.length;i++){
    const next=line?line+' '+words[i]:words[i];
    if(ctx.measureText(next).width>1076&&line){ctx.fillText(line,62,y);y+=58;line=words[i];lines++;if(lines===1){line=words.slice(i).join(' ');while(ctx.measureText(line+'…').width>1076)line=line.slice(0,-1);ctx.fillText(line+(i<words.length-1?'…':''),62,y);line='';break;}}
    else line=next;
  }
  if(line)ctx.fillText(line,62,y);
  ctx.fillStyle='#ffffffbb';ctx.font='22px Arial';ctx.fillText(card.label.toUpperCase(),62,335);
  ctx.fillStyle=card.percent<0?'#ffb7b5':card.percent>0?'#a4f4d6':'#fff9ef';
  let size=130;ctx.font=`${size}px Georgia`;while(ctx.measureText(pnlPercent(card.percent)).width>1068&&size>60){ctx.font=`${--size}px Georgia`;}
  ctx.fillText(pnlPercent(card.percent),62,475);
  if(card.profit!==null){ctx.font='38px Arial';ctx.fillText(pnlMoney(card.profit),66,540);}
  ctx.fillStyle='#ffffff33';ctx.fillRect(62,601,1076,1);
  const metrics=[...(card.cost!==null?[[card.costLabel,dollars(card.cost)]]:[]),['Position',card.status],['Market',card.execution]];
  metrics.forEach(([label,value],i)=>{const x=62+i*(1076/metrics.length);ctx.fillStyle='#ffffffaa';ctx.font='18px Arial';ctx.fillText(label,x,643);ctx.fillStyle='#fff9ef';ctx.font='27px Arial';ctx.fillText(value,x,684);});
  ctx.fillStyle='#ffffffaa';ctx.font='18px Arial';ctx.fillText(`As of ${snapshotDate(card.asOf)} · Net of fees · Simulated performance`,62,751);
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!blob)throw new Error('Could not export this card.');return blob;
}
