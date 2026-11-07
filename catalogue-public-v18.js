/* Catalogue V18, affichage public et espace salarié. */
(function(){
"use strict";
const esc=CSECatalog.esc,euro=CSECatalog.money;
let shopCategoryV18="Toutes",shopSearchV18="",selectedVariantV18={};
function data(){return CSECatalog.load()}
function updateFlat(){
 const flattened=CSECatalog.flatten(data());
 // Existing cart/order prototype expects one flattened row per sellable variant.
 products=flattened.map(p=>({id:p.id,name:p.name,cat:p.cat,public:p.public,price:p.cse,
 emoji:"🎟️",desc:p.description||"",supplier:p.supplier,productName:p.productName,image:p.image,
 featured:p.featured,longDelay:p.longDelay,stock:p.stock,unlimited:p.unlimited}));
}
function cardImage(p){
 if(p.image)return '<img src="'+p.image+'" alt="'+esc(p.name)+'" class="c18-public-img">';
 return '<div class="c18-public-placeholder" aria-hidden="true">▧</div>';
}
function featuredCard(p){
 const v=p.variants?.[0];if(!v)return "";
 return '<article class="c18-public-featured">'+cardImage(p)+
 '<span class="small muted">'+esc(p.category)+'</span><h3>'+esc(p.name)+'</h3>'+
 '<p>'+esc(p.description||"")+'</p><div class="row"><s>'+euro(v.public)+'</s><b class="c18-newprice">À partir de '+euro(Math.min(...p.variants.map(x=>x.cse)))+'</b></div>'+
 '<button class="btn primary" onclick="c18PublicGotoCategory('+JSON.stringify(p.category).replace(/"/g,"&quot;")+')">Voir les déclinaisons</button></article>';
}
function featuredHTML(limit){
 let list=data().products.filter(p=>p.featured).slice(0,Math.max(1,Math.min(8,Number(limit)||8)));
 return '<div class="c18-public-featured-grid">'+list.map(featuredCard).join("")+'</div>';
}
function shopHTML(){
 const d=data();
 const cats=["Toutes",...d.categories];
 const found=d.products.filter(p=>
 (shopCategoryV18==="Toutes"||p.category===shopCategoryV18)&&
 [p.name,p.category,p.description,...p.variants.map(v=>v.name)].join(" ").toLocaleLowerCase("fr").includes(shopSearchV18.toLocaleLowerCase("fr")));
 return header("Boutique & billetterie","Choisissez une catégorie, puis un produit et sa déclinaison. Les tarifs affichés sont réservés aux salariés.")+
 '<div class="c18-public-filter"><div class="c18-public-cats">'+cats.map(c=>
 '<button class="filtertag '+(shopCategoryV18===c?"active":"")+'" onclick="c18PublicGotoCategory('+JSON.stringify(c).replace(/"/g,"&quot;")+')">'+esc(c)+'</button>').join("")+'</div>'+
 '<input type="search" placeholder="Rechercher produit ou formule..." value="'+esc(shopSearchV18)+'" oninput="c18PublicSearch(this.value)"></div>'+
 '<div class="c18-public-products">'+found.map(productHTML).join("")+(found.length?"":'<p>Aucun produit correspondant.</p>')+'</div>';
}
function productHTML(p){
 const variant=p.variants.find(v=>v.id===selectedVariantV18[p.id])||p.variants[0];
 if(!variant)return "";
 selectedVariantV18[p.id]=variant.id;
 const available=variant.unlimited||variant.stock>0;
 return '<article class="c18-public-product"><div class="c18-public-visual">'+cardImage(p)+'</div>'+
 '<div class="c18-public-detail"><span class="small muted">'+esc(p.category)+'</span><h3>'+esc(p.name)+'</h3>'+
 '<p>'+esc(p.description||"")+'</p><label for="c18variant-'+esc(p.id)+'">Choisissez votre formule</label>'+
 '<select id="c18variant-'+esc(p.id)+'" onchange="c18PublicSelect('+JSON.stringify(p.id).replace(/"/g,"&quot;")+',Number(this.value))">'+
 p.variants.map(v=>'<option value="'+v.id+'" '+(variant.id===v.id?"selected":"")+'>'+esc(v.name)+' — '+euro(v.cse)+'</option>').join("")+'</select>'+
 '<div class="c18-prices"><s>'+euro(variant.public)+'</s><b>'+euro(variant.cse)+'</b></div>'+
 (variant.longDelay?'<span class="c18-public-delay">⏳ Délai fournisseur plus important</span>':"")+
 '<p class="small muted">'+(available?"✓ Disponible":"Indisponible")+'</p>'+
 '<button class="btn primary" '+(available?"":"disabled")+' onclick="addCart('+variant.id+')">Ajouter au panier</button></div></article>';
}
function gotoCategory(c){shopCategoryV18=c;go("catalog")}
function selectVariant(id,v){selectedVariantV18[id]=v;render()}
function search(v){shopSearchV18=v;const pos=document.activeElement?.selectionStart;render();const el=document.querySelector(".c18-public-filter input");if(el){el.focus();try{el.setSelectionRange(pos,pos)}catch(e){}}}
window.c18PublicGotoCategory=gotoCategory;
window.c18PublicSelect=selectVariant;
window.c18PublicSearch=search;
// Public home uses publicFeatured in the previous version of the app.
if(typeof publicFeatured==="function")publicFeatured=featuredHTML;
// All pages that use catalog() will display the product/variation hierarchy.
catalog=shopHTML;
const previousProductCard=productCard;
productCard=function(p){
 if(p.image)return '<article class="card"><div class="c18-public-visual">'+cardImage(p)+'</div><span class="pill">'+esc(p.cat)+'</span><h3>'+esc(p.productName||p.supplier||p.name)+'</h3>'+
 '<p class="muted">'+esc(p.name)+'</p><div class="row"><s>'+euro(p.public)+'</s><b class="c18-newprice">'+euro(p.price)+'</b>'+
 '<button class="btn primary" onclick="addCart('+p.id+')">Ajouter</button></div></article>';
 return previousProductCard(p);
};
// Sync from admin changes even when iframe page remains open.
const priorSync=typeof cseSyncProducts==="function"?cseSyncProducts:null;
cseSyncProducts=function(){updateFlat();if(typeof render==="function")render()};
window.addEventListener("storage",ev=>{
 if(ev.key===CSECatalog.KEY||ev.key===CSECatalog.LEGACY){updateFlat();render()}
});
window.addEventListener("cse:catalog-updated",()=>{updateFlat();render()});
updateFlat();render();
})();