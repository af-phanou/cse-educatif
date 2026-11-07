/* CSE Educatif V24 – Compositions vectorielles sobres et direction artistique saisonniere.
   Aucune illustration cartoon. Ne touche ni aux commandes ni au catalogue. */
(function(){
"use strict";
if(!window.CSESeasons||typeof render!=="function")return;
const SOURCE=window.CSESeasons;
const NS="http://www.w3.org/2000/svg";
function pineSprig(x,y,rot,scale){
 let needles="";
 for(let i=0;i<13;i++){
  const px=15+i*10,py=-5*Math.sin(px/160*Math.PI)+px*.025;
  const len=25+i*.3;
  needles+='<path d="M'+px.toFixed(1)+' '+py.toFixed(1)+
   ' Q'+(px-12).toFixed(1)+' '+(py-11).toFixed(1)+' '+(px-len).toFixed(1)+' '+(py-24).toFixed(1)+'"/>';
  needles+='<path d="M'+px.toFixed(1)+' '+py.toFixed(1)+
   ' Q'+(px-11).toFixed(1)+' '+(py+13).toFixed(1)+' '+(px-len+2).toFixed(1)+' '+(py+25).toFixed(1)+'"/>';
 }
 return '<g transform="translate('+x+' '+y+') rotate('+rot+') scale('+scale+')" stroke="#dfc898" stroke-opacity=".67" stroke-width="1.5" fill="none" stroke-linecap="round">'+
 '<path d="M0 0Q70-14 160 9" stroke-width="2"/>'+needles+'</g>';
}
function goldenSpecks(){
 let out="";
 for(let i=0;i<30;i++){
  const x=29+((i*89)%410),y=12+((i*67)%360),r=.7+(i%4)*.5;
  out+='<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="#f7e2ae" opacity="'+(.17+(i%5)*.12).toFixed(2)+'"/>';
 }
 return out;
}
const CHRISTMAS_SVG=
 '<svg class="cse-v24-canvas" viewBox="0 0 510 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="'+NS+'">'+
 '<defs><radialGradient id="c24light"><stop stop-color="#f3d9a5" stop-opacity=".66"/><stop offset=".45" stop-color="#e0c389" stop-opacity=".22"/><stop offset="1" stop-color="#d6bc85" stop-opacity="0"/></radialGradient>'+
 '<radialGradient id="c24soft"><stop stop-color="#fbefcd" stop-opacity=".9"/><stop offset="1" stop-color="#e1bd81" stop-opacity="0"/></radialGradient></defs>'+
 '<circle class="cse-v24-halo" cx="315" cy="181" r="206" fill="url(#c24light)"/>'+
 '<circle cx="332" cy="190" r="128" stroke="#f4deae" stroke-width="1" opacity=".28" fill="none"/>'+
 '<circle cx="332" cy="190" r="112" stroke="#f4deae" stroke-width=".65" opacity=".17" fill="none"/>'+
 '<circle cx="328" cy="191" r="92" fill="url(#c24soft)" opacity=".2"/>'+
 pineSprig(170,48,-10,1.06)+pineSprig(470,20,115,1.2)+
 pineSprig(440,310,-150,1.1)+pineSprig(165,348,-35,.85)+
 goldenSpecks()+
 '<g fill="none" stroke="#f9e7c4" stroke-opacity=".58" stroke-width="1">'+
 '<path d="M336 95v18m-9-9h18m-15-6 12 12m0-12-12 12"/>'+
 '<path d="M218 249v13m-6.5-6.5h13m-10-3 7 7m0-7-7 7"/>'+
 '<path d="M420 245v12m-6-6h12"/>'+
 '</g>'+
 '<circle cx="267" cy="166" r="9" fill="#f6dc9f" opacity=".1"/><circle cx="420" cy="141" r="17" fill="#f6dc9f" opacity=".11"/>'+
 '</svg>';
const BAT_PATH='M0 8C-11-4-24-17-38-12C-46-8-46-1-45 7C-61-13-80-12-93-3C-85 12-71 17-57 14C-48 25-35 26-25 19C-13 18-6 25 0 29C6 25 13 18 25 19C35 26 48 25 57 14C71 17 85 12 93-3C80-12 61-13 45 7C46-1 46-8 38-12C24-17 11-4 0 8Z';
function bat(x,y,scale,opacity,delayed){
 return '<g transform="translate('+x+' '+y+') scale('+scale+')" opacity="'+opacity+'"><g class="cse-v24-bat'+(delayed?' delay':'')+'" fill="#140e20"><path d="'+BAT_PATH+'"/></g></g>';
}
const HALLOWEEN_SVG=
 '<svg class="cse-v24-canvas" viewBox="0 0 510 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true" xmlns="'+NS+'">'+
 '<defs><radialGradient id="c24moon"><stop stop-color="#fff3d9"/><stop offset=".75" stop-color="#eec69a"/><stop offset="1" stop-color="#c59465"/></radialGradient>'+
 '<radialGradient id="c24glow"><stop stop-color="#f4c58c" stop-opacity=".32"/><stop offset=".38" stop-color="#d6a47a" stop-opacity=".15"/><stop offset="1" stop-color="#f4c58c" stop-opacity="0"/></radialGradient>'+
 '<linearGradient id="c24mist" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d5a99e" stop-opacity="0"/><stop offset="1" stop-color="#b8a1b2" stop-opacity=".25"/></linearGradient>'+
 '<filter id="c24blur"><feGaussianBlur stdDeviation="14"/></filter></defs>'+
 '<circle class="cse-v24-halo" cx="335" cy="174" r="188" fill="url(#c24glow)"/>'+
 '<circle cx="345" cy="177" r="93" fill="url(#c24moon)" opacity=".91"/>'+
 '<circle cx="345" cy="177" r="98" stroke="#eac69f" stroke-width="1.4" fill="none" opacity=".27"/>'+
 '<circle cx="314" cy="155" r="20" fill="#dcb18f" opacity=".07"/><circle cx="366" cy="203" r="13" fill="#bb9578" opacity=".09"/>'+
 bat(209,97,.26,.9,false)+bat(436,99,.32,.84,true)+bat(274,256,.19,.64,false)+
 '<g fill="none" stroke="#e6bfab" stroke-opacity=".18" stroke-width="1.2">'+
 '<path d="M490 0L335 170M490 0L392 191M490 0L452 201M490 0L500 205M490 0L340 65M490 0L385 35"/>'+
 '<path d="M452 38Q437 43 419 56Q411 78 418 84M414 84Q433 85 442 96Q454 110 458 132M382 118Q416 107 445 117Q466 130 476 155"/>'+
 '</g>'+
 '<g filter="url(#c24blur)" opacity=".54"><ellipse cx="323" cy="370" rx="210" ry="45" fill="#cf98a3"/>'+
 '<ellipse cx="420" cy="332" rx="170" ry="28" fill="#a68bb4"/></g>'+
 '<path d="M0 373Q104 332 206 367T510 363V400H0Z" fill="url(#c24mist)"/>'+
 '<g fill="#f2cda8" opacity=".45"><circle cx="246" cy="164" r="1.5"/><circle cx="413" cy="248" r="1.2"/><circle cx="289" cy="64" r=".9"/></g>'+
 '</svg>';
let renderedTheme="";
function settings(){
 const s=SOURCE.load();
 const inPublic=typeof mode==="undefined"||mode==="public";
 return {theme:inPublic?s.theme:"none",animation:s.animation!==false};
}
function removeOld(){
 document.getElementById("cseV24Ribbon")?.remove();
 document.getElementById("cseV24Motes")?.remove();
 document.querySelectorAll(".cse-v24-visual").forEach(x=>x.remove());
 document.getElementById("cseV23Banner")?.remove();
 document.getElementById("cseV23Overlay")?.remove();
 document.getElementById("cseV23Header")?.remove();
 document.querySelectorAll(".cse-festive-hero-art").forEach(x=>x.remove());
}
function particles(theme){
 const count=theme==="christmas"?24:9;
 const layer=document.createElement("div");
 layer.id="cseV24Motes";layer.className="cse-v24-stardust";
 layer.setAttribute("aria-hidden","true");
 for(let i=0;i<count;i++){
  const el=document.createElement("span");
  el.className="cse-v24-mote "+theme;
  el.style.setProperty("--sx",((i*47+13)%97)+"%");
  el.style.setProperty("--sz",(theme==="christmas"?1.6+(i%4)*1.05:1.4+(i%3)*.9)+"px");
  el.style.setProperty("--speed",(theme==="christmas"?15:21)+(i%9)*2.4+"s");
  el.style.setProperty("--delay",(-i*1.89)+"s");
  el.style.setProperty("--drift",((i%2===0)?-42:45)+(i%3*7)+"px");
  el.style.setProperty("--opacity",(.28+(i%5)*.1).toFixed(2));
  layer.appendChild(el);
 }
 document.body.appendChild(layer);
}
function decorate(){
 const s=settings();
 const isPremium=s.theme==="christmas"||s.theme==="halloween";
 renderedTheme=s.theme;
 removeOld();
 if(!isPremium)return;
 document.getElementById("cseSeasonParticles")?.remove(); // retire les anciens flocons/émoticônes
 const nav=document.getElementById("nav");
 if(nav){
  const ribbon=document.createElement("div");
  ribbon.id="cseV24Ribbon";
  ribbon.className="cse-v24-ribbon "+s.theme;
  ribbon.textContent=s.theme==="christmas"?"L'ESPRIT DES FÊTES · ÉDITION DE NOËL":"ÉDITION D'AUTOMNE · HALLOWEEN";
  nav.insertAdjacentElement("afterend",ribbon);
 }
 const hero=document.querySelector("#app .hero");
 if(hero){
  const container=document.createElement("div");
  container.className="cse-v24-visual";
  container.setAttribute("aria-hidden","true");
  container.innerHTML=s.theme==="christmas"?CHRISTMAS_SVG:HALLOWEEN_SVG;
  hero.appendChild(container);
 }
 const reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 if(s.animation&&!reduce)particles(s.theme);
}
const oldRender=render;
render=function(){oldRender();decorate()};
window.addEventListener("storage",e=>{if(e.key===SOURCE.KEY)decorate()});
window.addEventListener("cse:theme-updated",decorate);
if(window.matchMedia){
 const mq=window.matchMedia("(prefers-reduced-motion: reduce)");
 if(mq.addEventListener)mq.addEventListener("change",decorate);
}
decorate();
})();