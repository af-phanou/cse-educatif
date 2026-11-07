/* Catalogue V18 : administration indépendante, style CSE bleu et blanc. */
(function(){
"use strict";
let data=CSECatalog.load(), currentCat="Toutes", keyword="", draft=null, activeEditId=null;
const $=id=>document.getElementById(id), esc=CSECatalog.esc, euro=CSECatalog.money;
function refresh(){data=CSECatalog.load();if(typeof products!=="undefined")products=CSECatalog.flatten(data).map(p=>({...p}));if(typeof categories!=="undefined")categories=data.categories.slice();}
function commit(){
 try{
  data=CSECatalog.save(data);
  refresh();
  if(typeof render==="function")render();
  return true;
 }catch(e){alert("Enregistrement impossible : "+e.message+"\nRéduisez la taille de l'image, ou vérifiez le stockage local.");return false}
}
function categorised(){return data.products.filter(p=>(currentCat==="Toutes"||p.category===currentCat)&&[p.name,p.category,p.description,...p.variants.map(v=>v.name)].join(" ").toLocaleLowerCase("fr").includes(keyword.toLocaleLowerCase("fr")))}
function thumb(p){return p.image?'<img src="'+p.image+'" alt="'+esc(p.name)+'">':'<div class="c18-placeholder">▧ <span>Image produit</span></div>'}
function adminView(){
 refresh();
 return '<div class="c18-main"><div class="c18-top"><div><h1>Catalogue de produits</h1><p>Gestion par catégories, produits principaux et déclinaisons de chaque produit.</p></div><div class="c18-buttons"><button class="btn" onclick="c18CategoryDialog()">＋ Catégorie</button><button class="btn primary" onclick="c18OpenProduct()">＋ Nouveau produit</button></div></div>'+
 '<div class="c18-layout"><nav class="c18-categories" aria-label="Catégories"><b>Catégories</b>'+["Toutes",...data.categories].map(c=>'<button class="'+(currentCat===c?"active":"")+'" onclick="c18SelectCategory('+JSON.stringify(c).replace(/"/g,"&quot;")+')">'+esc(c)+' <small>'+data.products.filter(p=>c==="Toutes"||p.category===c).length+'</small></button>').join("")+'</nav>'+
 '<div><div class="c18-toolbar"><input type="search" placeholder="Rechercher un produit, une déclinaison…" value="'+esc(keyword)+'" oninput="c18Search(this.value)"><span class="c18-info">'+categorised().length+' produits · '+categorised().reduce((a,p)=>a+p.variants.length,0)+' déclinaisons</span></div>'+
 '<div class="c18-product-grid">'+categorised().map(p=>'<article class="c18-card"><div class="c18-image">'+thumb(p)+'</div><div class="c18-card-body"><span class="c18-category">'+esc(p.category)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||"Aucune description")+'</p><div class="c18-line"><b>'+p.variants.length+' déclinaison(s)</b>'+(p.featured?'<span>★ À la une</span>':'')+'</div>'+
 '<div class="c18-variants">'+p.variants.slice(0,3).map(v=>'<div><span>'+esc(v.name)+'</span><b>'+euro(v.cse)+'</b></div>').join("")+(p.variants.length>3?'<small>… et '+(p.variants.length-3)+' autre(s)</small>':'')+'</div>'+
 '<button class="btn primary c18-editbtn" onclick="c18OpenProduct('+JSON.stringify(p.id).replace(/"/g,"&quot;")+')">Modifier le produit et ses déclinaisons</button></div></article>').join("")+
 (categorised().length===0?'<section class="panel"><p>Aucun produit correspondant.</p></section>':"")+'</div></div></div></div>';
}
function selectCategory(c){currentCat=c;if(typeof render==="function")render()}
function search(q){keyword=q;const element=document.activeElement,loc=element?.selectionStart;render();const input=document.querySelector(".c18-toolbar input");input?.focus();try{input.setSelectionRange(loc,loc)}catch(e){}}
function categoriesDialog(){
 show('<h2>Gérer les catégories</h2><div class="c18-row"><input id="c18NewCategory" placeholder="Nouvelle catégorie" maxlength="90"><button class="btn primary" onclick="c18AddCategory()">＋ Ajouter</button></div>'+
 '<div class="c18-catlist">'+data.categories.map((c,i)=>'<div><span>'+esc(c)+' <small>('+data.products.filter(p=>p.category===c).length+' produits)</small></span><button class="btn" onclick="c18RenameCategory('+i+')">Renommer</button><button class="btn" onclick="c18RemoveCategory('+i+')">Supprimer</button></div>').join("")+'</div>');
}
function addCategory(){let input=$("c18NewCategory"),v=input.value.trim();if(!v||data.categories.some(c=>c.toLocaleLowerCase("fr")===v.toLocaleLowerCase("fr"))){alert("Catégorie vide ou déjà existante");return}data.categories.push(v);if(commit())categoriesDialog()}
function renameCategory(i){const name=data.categories[i],v=prompt("Nouveau nom",name)?.trim();if(!v)return;if(data.categories.some((c,j)=>j!==i&&c.toLocaleLowerCase("fr")===v.toLocaleLowerCase("fr"))){alert("Ce nom existe déjà");return}data.categories[i]=v;data.products.forEach(p=>{if(p.category===name)p.category=v});if(currentCat===name)currentCat=v;if(commit())categoriesDialog()}
function removeCategory(i){const c=data.categories[i];if(data.products.some(p=>p.category===c))return alert("Déplacez d'abord les produits de cette catégorie.");if(!confirm("Supprimer la catégorie « "+c+" » ?"))return;data.categories.splice(i,1);if(currentCat===c)currentCat="Toutes";if(commit())categoriesDialog()}
function newVariant(){return {id:nextVariantId(),name:"",public:0,cse:0,stock:0,unlimited:false,longDelay:false}}
function nextVariantId(){return Math.max(1000,...CSECatalog.flatten(data).map(x=>Number(x.id)||0),...(draft?.variants||[]).map(x=>Number(x.id)||0))+1}
function openProduct(id){
 const p=data.products.find(x=>x.id===id);
 draft=p?JSON.parse(JSON.stringify(p)):{id:CSECatalog.uid(),name:"",category:currentCat!=="Toutes"?currentCat:data.categories[0],description:"",image:"",featured:false,variants:[]};
 activeEditId=p?p.id:null;
 if(!draft.variants.length)draft.variants.push(newVariant());
 drawProductEditor();
}
function drawProductEditor(){
 const p=draft;
 show('<div class="c18-editor-head"><div><h2>'+(activeEditId?"Modifier":"Créer")+' un produit</h2><p>Une fiche principale, une image et autant de déclinaisons que nécessaire.</p></div><button class="btn" onclick="c18Close()">Fermer</button></div>'+
 '<div class="c18-editcols"><div class="c18-upload"><div class="c18-largeimage" id="c18ImgPreview">'+thumb(p)+'</div><label class="btn c18-uploadbtn">📷 Ajouter / remplacer l’image <input type="file" accept="image/*" onchange="c18ChooseImage(this)" hidden></label><p class="small muted">Image commune aux déclinaisons. JPEG, PNG ou WebP · maximum 8 Mo. Adaptée automatiquement pour la maquette.</p></div>'+
 '<div class="c18-fields"><div class="c18-field"><label>Nom du produit *</label><input id="c18name" value="'+esc(p.name)+'" oninput="c18Set(\'name\',this.value)" placeholder="Ex. Kinépolis"></div>'+
 '<div class="c18-field"><label>Catégorie *</label><select onchange="c18Set(\'category\',this.value)">'+data.categories.map(c=>'<option '+(p.category===c?"selected":"")+'>'+esc(c)+'</option>').join("")+'</select></div>'+
 '<div class="c18-field"><label>Description du produit</label><textarea id="c18description" oninput="c18Set(\'description\',this.value)" placeholder="Présentation générale…">'+esc(p.description)+'</textarea></div>'+
 '<label class="c18-check"><input type="checkbox" '+(p.featured?"checked":"")+' onchange="c18Set(\'featured\',this.checked)"> Mettre ce produit en avant sur la page d’accueil</label></div></div>'+
 '<div class="c18-variant-head"><div><h3>Déclinaisons du produit</h3><p>Chaque déclinaison possède son prix public, son prix CSE, son stock et son délai.</p></div><button class="btn primary" onclick="c18AddVariant()">＋ Ajouter une déclinaison</button></div>'+
 '<div class="c18-tablewrap"><table class="c18-table"><thead><tr><th>Déclinaison / formule *</th><th>Prix public barré (€)</th><th>Prix CSE (€)</th><th>Stock</th><th>Illimité</th><th>Délai fournisseur long</th><th>Action</th></tr></thead><tbody>'+
 p.variants.map((v,i)=>'<tr><td><input value="'+esc(v.name)+'" placeholder="Ex. Carte 5 entrées" oninput="c18SetVariant('+i+',\'name\',this.value)"></td>'+
 '<td><input type="number" min="0" step="0.01" value="'+v.public+'" oninput="c18SetVariant('+i+',\'public\',this.value)"></td>'+
 '<td><input type="number" min="0" step="0.01" value="'+v.cse+'" oninput="c18SetVariant('+i+',\'cse\',this.value)"></td>'+
 '<td><input type="number" min="0" step="1" value="'+v.stock+'" '+(v.unlimited?"disabled":"")+' oninput="c18SetVariant('+i+',\'stock\',this.value)"></td>'+
 '<td><input type="checkbox" '+(v.unlimited?"checked":"")+' onchange="c18SetVariant('+i+',\'unlimited\',this.checked);c18DrawProductEditor()"></td>'+
 '<td><input type="checkbox" '+(v.longDelay?"checked":"")+' onchange="c18SetVariant('+i+',\'longDelay\',this.checked)"></td>'+
 '<td><button class="btn" onclick="c18RemoveVariant('+i+')" title="Supprimer la déclinaison">✕</button></td></tr>').join("")+'</tbody></table></div>'+
 '<div class="c18-editor-foot"><span class="small muted">Les commandes anciennes liées à une déclinaison ne peuvent pas être supprimées.</span>'+
 '<div class="c18-row">'+(activeEditId?'<button class="btn danger" onclick="c18DeleteProduct()">Supprimer ce produit</button>':'')+
 '<button class="btn" onclick="c18Close()">Annuler</button><button class="btn primary" onclick="c18SaveProduct()">Enregistrer le produit</button></div></div>');
}
function set(k,v){draft[k]=v}
function setVariant(i,k,v){draft.variants[i][k]=["public","cse","stock"].includes(k)?Number(v):v}
function addVariant(){draft.variants.push(newVariant());drawProductEditor()}
function removeVariant(i){
 if(draft.variants.length<2)return alert("Conservez au moins une déclinaison.");
 const id=draft.variants[i].id;
 if(typeof orders!=="undefined"&&orders.some(o=>o.product===id))return alert("Déclinaison utilisée par une commande : suppression impossible.");
 draft.variants.splice(i,1);drawProductEditor();
}
async function chooseImage(el){
 const file=el.files?.[0];if(!file)return;
 try{draft.image=await CSECatalog.imageFromFile(file);drawProductEditor()}catch(e){alert(e.message)}
}
function saveProduct(){
 if(!draft.name.trim()||!data.categories.includes(draft.category)||!draft.variants.length)return alert("Renseignez le nom, la catégorie et une déclinaison.");
 for(const v of draft.variants){
  if(!v.name.trim()||!Number.isFinite(v.public)||!Number.isFinite(v.cse)||v.public<0||v.cse<0||!Number.isInteger(v.stock)||v.stock<0)return alert("Vérifiez le nom, les prix et les stocks des déclinaisons.");
 }
 // A variant cannot be deleted if referenced by a past order.
 if(activeEditId){
  const previous=data.products.find(p=>p.id===activeEditId);
  const remaining=new Set(draft.variants.map(v=>v.id));
  if(typeof orders!=="undefined"&&previous?.variants.some(v=>!remaining.has(v.id)&&orders.some(o=>o.product===v.id)))return alert("Suppression d'une déclinaison figurant dans une commande : opération refusée.");
  Object.assign(previous,draft);
 }else data.products.push(JSON.parse(JSON.stringify(draft)));
 if(commit()){close();alert("Produit et déclinaisons enregistrés. La boutique salariée peut afficher les changements.")}
}
function deleteProduct(){
 if(typeof orders!=="undefined"&&draft.variants.some(v=>orders.some(o=>o.product===v.id)))return alert("Ce produit est présent dans l'historique des commandes.");
 if(!confirm("Supprimer le produit « "+draft.name+" » et toutes ses déclinaisons ?"))return;
 data.products=data.products.filter(p=>p.id!==activeEditId);
 if(commit())close();
}
function show(body){
 close();
 const root=document.createElement("div");root.className="c18-overlay";root.id="c18Modal";
 root.innerHTML='<div class="c18-dialog">'+body+'</div>';
 root.addEventListener("click",e=>{if(e.target===root)close()});
 document.body.appendChild(root);
}
function close(){document.getElementById("c18Modal")?.remove()}
window.c18SelectCategory=selectCategory;window.c18Search=search;window.c18CategoryDialog=categoriesDialog;
window.c18AddCategory=addCategory;window.c18RenameCategory=renameCategory;window.c18RemoveCategory=removeCategory;
window.c18OpenProduct=openProduct;window.c18Close=close;window.c18Set=set;window.c18SetVariant=setVariant;
window.c18AddVariant=addVariant;window.c18RemoveVariant=removeVariant;window.c18ChooseImage=chooseImage;
window.c18DrawProductEditor=drawProductEditor;window.c18SaveProduct=saveProduct;window.c18DeleteProduct=deleteProduct;
if(typeof productsView==="function")productsView=adminView;
window.addEventListener("cse:catalog-updated",()=>{if(typeof route!=="undefined"&&route==="products")render()});
refresh();
})();