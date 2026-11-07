/* V20 : panneau de choix des saisons, visible dans Pages du site. */
(function(){
"use strict";
if(!window.CSESeasons || typeof cms!=="function")return;
const source=CSESeasons;
let draft=source.load();
const oldCMS=cms;
function escTheme(text){return String(text).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function currentLabel(){
 const saved=source.load();
 return saved.theme==="none"?"Aucun thème saisonnier actif":source.theme(saved.theme).name+(saved.animation?" · animation activée":" · animation désactivée");
}
function panel(){
 const chosen=source.theme(draft.theme);
 const previews=source.themes.map(t=>
  '<label class="cse-season-option"><input type="radio" name="cse-season-theme" value="'+t.id+'"'+(draft.theme===t.id?' checked':'')+' onchange="cseChooseSeason(\''+t.id+'\')">'+
  '<span class="season-glyph" aria-hidden="true">'+t.glyph+'</span><span>'+escTheme(t.name)+'<small>'+escTheme(t.description)+'</small></span></label>'
 ).join("");
 return '<section id="cseSeasonPanel" class="cse-season-manager" aria-label="Personnalisation saisonnière du site public">'+
 '<div class="row" style="justify-content:space-between;align-items:center"><div><h3>Thème du site public</h3>'+
 '<p class="sub">Choisissez une ambiance saisonnière. Le logo reste identifiable ; les couleurs du site évoluent selon le thème.</p></div>'+
 '<span class="badge">'+escTheme(currentLabel())+'</span></div>'+
 '<div class="cse-season-options">'+previews+'</div>'+
 '<div class="cse-season-preview '+chosen.id+'"><span class="preview-symbol" aria-hidden="true">'+(chosen.symbol||"✦")+'</span>'+
 '<strong>Aperçu : '+escTheme(chosen.name)+'</strong><p>'+escTheme(chosen.description)+
 '. Le contenu des pages, les produits et leurs tarifs restent inchangés.</p></div>'+
 '<div class="cse-season-toolbar"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox"'+(draft.animation?' checked':'')+
 ' onchange="cseSetSeasonAnimation(this.checked)"> Activer les petites animations décoratives</label>'+
 '<button class="btn primary" onclick="cseApplySeason()">✓ Appliquer au site public</button>'+
 '<button class="btn" onclick="cseCancelSeason()">Annuler les modifications</button>'+
 '</div><p class="sub">Les animations sont désactivées automatiquement pour les personnes qui préfèrent réduire les mouvements. Ce réglage de démonstration est enregistré dans ce navigateur.</p></section>';
}
window.cseChooseSeason=id=>{draft={...draft,theme:id};if(typeof render==="function")render()};
window.cseSetSeasonAnimation=on=>{draft={...draft,animation:Boolean(on)};if(typeof render==="function")render()};
window.cseApplySeason=()=>{
 if(!source.save(draft)){if(typeof toast==="function")toast("Enregistrement local indisponible");return}
 if(typeof toast==="function")toast("Thème « "+source.theme(draft.theme).name+" » appliqué au site public");
 if(typeof render==="function")render();
};
window.cseCancelSeason=()=>{draft=source.load();if(typeof render==="function")render()};
cms=function(){return panel()+oldCMS()};

/* Navigation explicite : l'outil reste dans Pages du site, mais dispose d'un accès direct. */
if(typeof navRender==="function"){
  const oldNavRenderSeason=navRender;
  navRender=function(){
    oldNavRenderSeason();
    const nav=document.getElementById("nav");
    if(!nav || document.getElementById("seasonNavButton"))return;
    const button=document.createElement("button");
    button.id="seasonNavButton";
    button.type="button";
    button.textContent="✦  Thèmes du site";
    button.title="Ouvrir le sélecteur des thèmes saisonniers";
    button.onclick=()=>{
      if(typeof navigate==="function")navigate("cms");
      else if(typeof route!=="undefined"){route="cms";render()}
      const target=document.getElementById("cseSeasonPanel");
      if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
    };
    const pageButton=Array.from(nav.querySelectorAll("button")).find(el=>el.textContent.includes("Pages du site"));
    if(pageButton)pageButton.insertAdjacentElement("afterend",button);
    else nav.prepend(button);
  };
}
/* Garantie d'affichage même si une autre extension a remplacé l'éditeur de pages. */
if(typeof render==="function"){
  const oldRenderSeason=render;
  render=function(){
    oldRenderSeason();
    if(typeof route==="undefined" || route!=="cms")return;
    const content=document.getElementById("content");
    if(content && !document.getElementById("cseSeasonPanel")){
      content.insertAdjacentHTML("afterbegin",panel());
    }
  };
}
window.addEventListener("storage",e=>{
 if(e.key===source.KEY && typeof route!=="undefined" && route==="cms"){
  draft=source.load();if(typeof render==="function")render();
 }
});
})();