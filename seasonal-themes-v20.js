/* V20 : theme choisi dans Pages du site. Un seul theme actif a la fois. */
(function(){
"use strict";
const KEY="cse_fusion_v20_seasonal_theme";
const themes=[
{id:"none",name:"Aucun thème",description:"Bleu et blanc CSE",glyph:"◯",symbol:""},
{id:"christmas",name:"Noël",description:"Flocons et étoiles",glyph:"✦",symbol:"❄"},
{id:"halloween",name:"Halloween",description:"Petites citrouilles",glyph:"🎃",symbol:"🎃"},
{id:"spring",name:"Printemps",description:"Pétales et fleurs",glyph:"✿",symbol:"✿"},
{id:"summer",name:"Été",description:"Soleils légers",glyph:"☀",symbol:"☀"},
{id:"autumn",name:"Automne",description:"Feuilles qui tombent",glyph:"🍂",symbol:"🍂"},
{id:"winter",name:"Hiver",description:"Neige qui tombe",glyph:"❄",symbol:"❄"},
{id:"valentine",name:"Saint-Valentin",description:"Cœurs discrets",glyph:"♥",symbol:"♥"}
];
function normalize(value){
 const v=typeof value==="string"?{theme:value,animation:true}:value||{};
 return {theme:themes.some(t=>t.id===v.theme)?v.theme:"none",animation:v.animation!==false};
}
function load(){try{return normalize(JSON.parse(localStorage.getItem(KEY)))}catch(e){return normalize({theme:"none",animation:true})}}
function save(settings){
 const data=normalize(settings);
 try{localStorage.setItem(KEY,JSON.stringify(data))}catch(e){return false}
 window.dispatchEvent(new CustomEvent("cse:theme-updated",{detail:data}));
 return true;
}
function theme(id){return themes.find(t=>t.id===id)||themes[0]}
window.CSESeasons={KEY,themes,theme,load,save};
})();