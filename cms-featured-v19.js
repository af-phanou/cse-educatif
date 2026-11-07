/* V19 : bloc CMS "Nos offres à la une" connecté au catalogue V18. */
(function(){
"use strict";
if(!window.CSECatalog || typeof cmsRenderBlock!=="function" || typeof cmsEditorFields!=="function")return;
const oldRender=cmsRenderBlock,oldEditor=cmsEditorFields;
const esc=CSECatalog.esc,money=CSECatalog.money;
function selectedProducts(){return CSECatalog.load().products.filter(p=>p.featured).slice(0,8)}
function renderFeatured(b){
 const selected=selectedProducts().slice(0,Math.max(1,Math.min(8,Number(b.limit)||8)));
 const rows=selected.map(p=>{
  const variants=(p.variants||[]).filter(v=>Number.isFinite(Number(v.cse)));
  const cheapest=variants.length?variants.reduce((m,v)=>Number(v.cse)<Number(m.cse)?v:m):null;
  const image=p.image?'<img src="'+p.image+'" alt="'+esc(p.name)+'" class="c19-preview-image">':
    '<div class="c19-preview-placeholder">▧</div>';
  return '<article class="c19-preview-card">'+image+
    '<div><div class="c19-small">'+esc(p.category)+'</div>'+
    '<h4>'+esc(p.name)+'</h4>'+
    (cheapest?'<div class="c19-prices"><s>'+money(cheapest.public)+'</s><strong>À partir de '+money(cheapest.cse)+'</strong></div>':'<p>Aucune déclinaison disponible</p>')+
    '<small>'+variants.length+' formule(s)</small></div></article>';
 }).join("");
 return '<div class="c19-featured-block"><h2>'+esc(b.title||"Nos offres à la une")+'</h2>'+
  (selected.length?'<div class="c19-preview-grid">'+rows+'</div>':
  '<div class="c19-empty"><strong>Aucun produit mis en avant.</strong><p>Sélectionnez les produits à afficher dans le panneau de droite, ou dans Catalogue → Modifier un produit.</p></div>')+
  '<p class="c19-small">'+selected.length+' produit(s) sur '+(Number(b.limit)||8)+' emplacements · 2 colonnes sur ordinateur.</p></div>';
}
cmsRenderBlock=function(b){if(b?.type==="featured")return renderFeatured(b);return oldRender(b)};
function updateFeatured(id,value){
 const data=CSECatalog.load();
 const p=data.products.find(p=>p.id===id);
 if(!p)return;
 if(value&&!p.featured&&data.products.filter(x=>x.featured).length>=8){
  if(typeof toast==="function")toast("Maximum 8 produits mis en avant. Décochez d'abord un produit.");
  if(typeof render==="function")render();return;
 }
 p.featured=value;
 try{
  CSECatalog.save(data);
  if(typeof products!=="undefined")products=CSECatalog.flatten(data).map(x=>({...x}));
  if(typeof render==="function")render();
 }catch(e){alert("Enregistrement impossible : "+e.message)}
}
window.c19UpdateFeatured=updateFeatured;
cmsEditorFields=function(b){
 if(b?.type!=="featured")return oldEditor(b);
 const all=CSECatalog.load().products;
 const shown=all.filter(p=>p.featured).length;
 return '<h3>Nos offres à la une</h3>'+
 '<div class="field"><label>Titre du bloc</label><input value="'+esc(b.title||"")+'" oninput="cmsSetBlockField(\'title\',this.value)"></div>'+
 '<div class="field"><label>Nombre à afficher (maximum 8)</label><select onchange="cmsSetBlockField(\'limit\',Number(this.value))">'+
 [2,4,6,8].map(n=>'<option '+(Number(b.limit)===n?'selected':'')+' value="'+n+'">'+n+' produits</option>').join("")+'</select></div>'+
 '<p class="c19-small">Cochez les produits à afficher. Les informations et les prix proviennent du catalogue V18.</p>'+
 '<div class="c19-count"><b>'+shown+' / 8</b> produits sélectionnés</div>'+
 '<div class="c19-selector">'+all.map(p=>
 '<label class="c19-product-option"><input type="checkbox" '+(p.featured?'checked':'')+
 ' onchange="c19UpdateFeatured('+JSON.stringify(p.id).replace(/"/g,'&quot;')+',this.checked)">'+
 (p.image?'<img src="'+p.image+'" alt="">':'<span class="c19-mini-placeholder">▧</span>')+
 '<span><b>'+esc(p.name)+'</b><small>'+esc(p.category)+' · '+(p.variants||[]).length+' déclinaison(s)</small></span></label>'
 ).join("")+'</div>'+
 (!all.length?'<p class="note">Ajoutez d’abord des produits dans le catalogue.</p>':'')+
 '<p class="c19-small">Le choix est enregistré immédiatement. Pour publier le contenu de la page, cliquez également sur « Enregistrer la page ».</p>';
};
window.addEventListener("storage",e=>{
 if(e.key===CSECatalog.KEY && typeof route!=="undefined" && route==="cms" && typeof render==="function")render();
});
})();