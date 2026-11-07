/* V20 : effet décoratif saisonnier sur le site public uniquement. */
(function(){
"use strict";
if(!window.CSESeasons)return;
const source=CSESeasons;
const icons={
 christmas:["❄","✧","❄","✦"],
 halloween:["🎃","✦","◆"],
 spring:["✿","❀","✧"],
 summer:["☀","✦","•"],
 autumn:["🍂","❧","🍁"],
 winter:["❄","✳","❅"],
 valentine:["♥","♡","✧"]
};
let signature="";
function refreshSeason(){
 const setting=source.load();
 const enabled=typeof mode==="undefined"||mode==="public";
 const active=enabled?setting.theme:"none";
 const shouldAnimate=active!=="none"&&setting.animation;
 document.body.dataset.cseTheme=active;
 let layer=document.getElementById("cseSeasonParticles");
 if(!shouldAnimate){
  if(layer)layer.remove();
  signature="";
  return;
 }
 let nextSig=active+"|"+setting.animation;
 if(layer&&nextSig===signature)return;
 if(layer)layer.remove();
 layer=document.createElement("div");
 layer.id="cseSeasonParticles";layer.className="cse-season-particles";
 layer.setAttribute("aria-hidden","true");
 const particles=icons[active]||["✦"];
 for(let i=0;i<16;i++){
  const el=document.createElement("span");el.className="cse-season-particle";
  el.textContent=particles[i%particles.length];
  el.style.setProperty("--x",((i*37+7)%97)+"%");
  el.style.setProperty("--size",(i%3===0?16:i%3===1?12:21)+"px");
  el.style.setProperty("--duration",(17+i%7*3)+"s");
  el.style.setProperty("--delay",(-i*2.6)+"s");
  el.style.setProperty("--drift",(i%2===0?85:-65)+"px");
  el.style.setProperty("--turn",(i%2===0?160:-140)+"deg");
  layer.appendChild(el);
 }
 document.body.appendChild(layer);
 signature=nextSig;
}
const oldRender=render;
render=function(){oldRender();refreshSeason()};
window.addEventListener("storage",e=>{if(e.key===source.KEY)refreshSeason()});
window.addEventListener("cse:theme-updated",refreshSeason);
refreshSeason();
})();