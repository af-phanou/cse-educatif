/* CSE Éducatif V23 — Direction artistique festive : Noël / Halloween.
   Visuels SVG originaux construits dans le code, animations non bloquantes.
   Les autres saisons conservent le fonctionnement de V20. */
(function(){
"use strict";
if(!window.CSESeasons || typeof render!=="function")return;
const source=window.CSESeasons;
const SVG_CHRISTMAS='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 275" aria-hidden="true">'+
'<defs><linearGradient id="tree" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b9d61"/><stop offset="1" stop-color="#075035"/></linearGradient><linearGradient id="bauble" x1="0" x2="1"><stop stop-color="#ff8c76"/><stop offset="1" stop-color="#aa192f"/></linearGradient></defs>'+
'<g opacity=".6" fill="#fff6d5"><circle cx="45" cy="37" r="3"/><circle cx="320" cy="48" r="4"/><circle cx="180" cy="35" r="3"/><circle cx="357" cy="108" r="2"/><circle cx="88" cy="151" r="3"/></g>'+
'<path d="M210 17L221 48L255 48L228 67L240 97L211 78L182 97L195 67L168 48L202 48Z" fill="#ffe18b" class="star-twinkle"/>'+
'<path d="M212 64L277 151H249L312 224H114L175 151H144Z" fill="url(#tree)" stroke="#bce4b6" stroke-width="4"/>'+
'<path d="M196 222h31v38h-31z" fill="#75402b"/><path d="M152 171q60 35 119 0M135 215q75 32 153-2" fill="none" stroke="#eac66f" stroke-width="6" stroke-linecap="round"/>'+
'<circle cx="191" cy="129" r="10" fill="#e1c67a"/><circle cx="237" cy="173" r="11" fill="url(#bauble)"/><circle cx="180" cy="205" r="10" fill="#ee6c71"/>'+
'<rect x="45" y="215" width="69" height="46" rx="5" fill="#b92b39" stroke="#fff1de" stroke-width="3"/><path d="M79 215v46M45 234h69" stroke="#efdb95" stroke-width="8"/>'+
'<rect x="305" y="226" width="60" height="37" rx="5" fill="#ead18a"/><path d="M335 226v37M305 243h60" stroke="#bd3038" stroke-width="8"/>'+
'<g class="swing-ornament"><path d="M83 0v72" stroke="#f5dfb0" stroke-width="3"/><circle cx="83" cy="89" r="17" fill="#d9343e" stroke="#fae1ab" stroke-width="4"/></g>'+
'<g class="swing-ornament"><path d="M345 0v33" stroke="#f5dfb0" stroke-width="3"/><circle cx="345" cy="46" r="15" fill="#e5c479" stroke="#fff4dd" stroke-width="3"/></g>'+
'</svg>';
const SVG_HALLOWEEN='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 275" aria-hidden="true">'+
'<defs><radialGradient id="moon"><stop stop-color="#fff2ad"/><stop offset="1" stop-color="#f3a840"/></radialGradient><linearGradient id="pump"><stop stop-color="#ffad33"/><stop offset="1" stop-color="#d65a0b"/></linearGradient></defs>'+
'<circle cx="309" cy="70" r="52" fill="url(#moon)" opacity=".9"/>'+
'<path d="M30 71q17-19 35 0l-9-3 8 18-17-9-16 9 6-18Z M116 35q18-13 37 5l-11-1 5 18-17-10-15 7 5-13Z" fill="#180f26"/>'+
'<path d="M56 241q4-35 35-34 25 3 35 30l-11-7-12 10-11-8-14 7-10-8Z" fill="#b36da3" opacity=".5"/>'+
'<g class="float-ghost"><path d="M234 103q-4-57 39-59 45-3 45 58v104l-18-12-16 13-17-14-17 16-16-16z" fill="#fffdf1" stroke="#e9d5f1" stroke-width="3"/>'+
'<ellipse cx="255" cy="115" rx="7" ry="11" fill="#221533"/><ellipse cx="291" cy="115" rx="7" ry="11" fill="#221533"/><ellipse cx="273" cy="144" rx="9" ry="11" fill="#221533"/><path d="M250 166q25 11 49-2" fill="none" stroke="#ded0f1" stroke-width="3"/></g>'+
'<path d="M107 199c-2-20 15-25 40-25 28-2 51 5 51 34 0 36-24 56-49 56-28 0-43-26-42-65Z" fill="url(#pump)" stroke="#ffbd5f" stroke-width="4"/>'+
'<path d="M145 178c-1-15 3-26 15-34" stroke="#306937" stroke-width="10" fill="none" stroke-linecap="round"/>'+
'<path d="M122 199l14-17 13 17-27 0 M164 198l13-17 12 17-25 0 M128 225q26 28 55-1l-15 5-9-6-9 7-11-7Z" fill="#29152c"/>'+
'<path d="M39 155q13-11 23 0l-7-1 4 14-11-8-11 7 4-14Z" fill="#ffad34"/>'+
'<g fill="#fff2b6" opacity=".8"><circle cx="352" cy="191" r="3"/><circle cx="66" cy="106" r="3"/><circle cx="198" cy="37" r="4"/></g></svg>';
const HEADER_CHRISTMAS='<svg class="cse-ornament" viewBox="0 0 65 65" aria-hidden="true">'+
'<path d="M32 0V16" stroke="#e8d6a8" stroke-width="3"/><circle cx="32" cy="36" r="19" fill="#bf2636" stroke="#f4d18c" stroke-width="3"/><path d="M16 36q16-12 32 0" fill="none" stroke="#ffd891" stroke-width="4"/></svg>';
const HEADER_HALLOWEEN='<svg class="cse-ornament" viewBox="0 0 70 70" aria-hidden="true">'+
'<path d="M13 35q-10-17-4-21 8-5 20 3 8-15 15 0 15-9 18-1 4 10-6 19-11-11-20 0-12-11-23 0Z" fill="#f99023"/><path d="M28 33l7-9 7 9" stroke="#29162e" stroke-width="5" fill="none"/></svg>';
let signature="";
function clear(){
 document.getElementById("cseV23Banner")?.remove();
 document.getElementById("cseV23Overlay")?.remove();
 document.getElementById("cseV23Header")?.remove();
 document.querySelectorAll(".cse-festive-hero-art").forEach(el=>el.remove());
 document.querySelectorAll(".cse-season-special").forEach(el=>el.classList.remove("cse-season-special"));
}
function buildDecor(theme,animations){
 const isXmas=theme==="christmas";
 const header=document.querySelector(".top");
 const nav=document.getElementById("nav");
 const main=document.getElementById("app");
 if(!header||!nav||!main)return;
 const banner=document.createElement("div");
 banner.id="cseV23Banner";banner.className="cse-festive-banner";
 banner.innerHTML=isXmas?'La magie de Noël s’invite au CSE ! <small>Découvrez vos offres et avantages dans une ambiance festive.</small>':
 'Halloween s’invite au CSE ! <small>Une ambiance ensorcelante pour découvrir vos offres et avantages.</small>';
 nav.insertAdjacentElement("afterend",banner);
 const decoration=document.createElement("div");
 decoration.id="cseV23Header";decoration.className="cse-festive-header";
 decoration.innerHTML=isXmas?HEADER_CHRISTMAS:HEADER_HALLOWEEN;
 header.style.position="relative";header.appendChild(decoration);
 const hero=main.querySelector(".hero");
 if(hero){
  hero.classList.add("cse-season-special");
  const art=document.createElement("div");art.className="cse-festive-hero-art";
  art.setAttribute("aria-hidden","true");
  art.innerHTML=isXmas?SVG_CHRISTMAS:SVG_HALLOWEEN;
  hero.appendChild(art);
 }
 if(animations && !window.matchMedia("(prefers-reduced-motion: reduce)").matches){
  const overlay=document.createElement("div");
  overlay.id="cseV23Overlay";overlay.className="cse-festive-overlay";
  overlay.setAttribute("aria-hidden","true");
  // Old V20 snow layer remains for Christmas. Halloween uses richer, lower-density animated symbols.
  const alphabet=isXmas?["✦","❄","✧"]:["👻","🦇","🎃","✦"];
  for(let i=0;i<(isXmas?18:13);i++){
   const span=document.createElement("span");
   span.className="cse-season-festive-particle";
   span.textContent=alphabet[i%alphabet.length];
   span.style.setProperty("--x",((i*43+11)%98)+"%");
   span.style.setProperty("--size",(isXmas?14+(i%4)*4:17+(i%3)*6)+"px");
   span.style.setProperty("--duration",(isXmas?15:19)+i%8*3+"s");
   span.style.setProperty("--delay",(-i*2.1)+"s");
   span.style.setProperty("--drift",((i%2)?-75:92)+"px");
   span.style.setProperty("--turn",((i%2)?-150:190)+"deg");
   overlay.appendChild(span);
  }
  document.body.appendChild(overlay);
 }
}
function sync(){
 const settings=window.CSESeasons.load();
 const active=typeof mode==="undefined"||mode==="public";
 const type=active?settings.theme:"none";
 const key=type+"|"+settings.animation+"|"+(document.getElementById("app")?.firstElementChild?.className||"");
 // Main render replaces the HTML, so always refresh its hero/decorations but avoid extra render loops.
 signature=key;clear();
 if(type!=="christmas"&&type!=="halloween")return;
 buildDecor(type,settings.animation);
 // V20 animation is redundant for Halloween: remove old falling pumpkins.
 if(type==="halloween")document.getElementById("cseSeasonParticles")?.remove();
}
const originalRender=render;
render=function(){originalRender();sync()};
window.addEventListener("storage",e=>{if(e.key===window.CSESeasons.KEY)sync()});
window.addEventListener("cse:theme-updated",sync);
window.matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change",sync);
sync();
})();