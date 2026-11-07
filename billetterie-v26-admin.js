/* CSE Éducatif V26 — Administration billetterie.
   Dossiers catégorie → fournisseur → Libres/Vendu, import PDF, attribution par commande.
   Tous les PDF restent dans IndexedDB local jusqu'au véritable backend OVH. */
(function(){
"use strict";
if(!window.CSETicketStore||typeof ticketsView!=="function")return;
const store=window.CSETicketStore;
const escHtml=typeof esc==="function"?esc:(s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])));
let v26Cat="Toutes",v26Supplier="Cinéma Lumière",v26Folder="Libres",v26Search="",v26PriorityId=null;
let lastTickets=[],updateSerial=0;
const jsArg=s=>JSON.stringify(String(s)).replace(/"/g,"&quot;");
const orderSupplier=o=>Number(o.product)===1?"Cinéma Lumière":Number(o.product)===2?"Parc Aventure":null;
function selectCategory(c){v26Cat=c;const x=store.suppliers().filter(x=>c==="Toutes"||x.category===c);if(!x.some(y=>y.name===v26Supplier))v26Supplier=x[0]?.name||"";if(typeof render==="function")render()}
function selectSupplier(name){v26Supplier=name;v26Folder="Libres";v26PriorityId=null;if(typeof render==="function")render()}
function selectFolder(name){v26Folder=name;if(typeof render==="function")render()}
function setSearch(value){v26Search=value;refresh()}
function supplierForm(){
 const name=prompt("Nom du nouveau fournisseur :");if(!name?.trim())return;
 const cats=[...new Set(["Cinéma","Parcs d'attractions","Sport","Spectacles & concerts","Musées & culture","Loisirs & activités","Autres",...store.suppliers().map(x=>x.category)])];
 const category=prompt("Catégorie du fournisseur :\n"+cats.join("\n"),v26Cat==="Toutes"?"Cinéma":v26Cat);
 if(category===null)return;if(!category.trim()){toast("Catégorie obligatoire");return}
 if(!store.saveSupplier(name.trim(),category.trim())){toast("Impossible d'enregistrer le fournisseur");return}
 v26Supplier=name.trim();v26Cat=category.trim();v26Folder="Libres";render();
}
function cardForSupplier(s,entries){
 const count=entries.filter(t=>t.supplier===s.name&&t.status==="Libre").length;
 const sold=entries.filter(t=>t.supplier===s.name&&t.status==="Vendu").length;
 return '<button type="button" class="t26-supplier '+(v26Supplier===s.name?"selected":"")+'" onclick="cseTicketSelectSupplier('+jsArg(s.name)+')">'+
 '<div class="t26-supplier-icon">▤</div><div><strong>'+escHtml(s.name)+'</strong><small>'+escHtml(s.category)+'</small></div>'+
 '<div class="t26-supplier-count">'+count+' libre(s)<br>'+sold+' vendu(s)</div></button>';
}
function body(){
 const all=store.suppliers();
 const categories=["Toutes",...new Set(all.map(s=>s.category))];
 const available=all.filter(s=>v26Cat==="Toutes"||s.category===v26Cat);
 if(v26Supplier&&!available.some(s=>s.name===v26Supplier))v26Supplier=available[0]?.name||"";
 const chosen=all.find(x=>x.name===v26Supplier);
 const byOrders=orders.filter(o=>orderSupplier(o)===v26Supplier);
 return heading("Billetterie · Gestion des PDF","Importez les billets dans le fournisseur, attribuez-les à une commande payée, retrouvez-les dans « Vendu ».","<div class=\"row\"><button class=\"btn primary\" onclick=\"cseTicketOpenImport()\">⇧ Importer des billets PDF</button><button class=\"btn\" onclick=\"cseTicketNewSupplier()\">＋ Fournisseur</button></div>")+
 '<div class="t26-summary" id="t26Summary"><div class="t26-metric"><small>PDF stockés</small><strong>…</strong></div><div class="t26-metric"><small>Billets libres</small><strong>…</strong></div><div class="t26-metric"><small>Billets vendus</small><strong>…</strong></div><div class="t26-metric"><small>Fournisseurs</small><strong>'+all.length+'</strong></div></div>'+
 '<div class="t26-layout"><section class="t26-sidebar"><h3>Catégories</h3><div class="t26-category-list">'+categories.map(c=>'<button class="'+(v26Cat===c?"selected":"")+'" onclick="cseTicketCategory('+jsArg(c)+')">'+escHtml(c)+'</button>').join("")+'</div>'+
 '<h3>Fournisseurs</h3><input type="search" class="t26-input" placeholder="Rechercher un fournisseur…" aria-label="Filtrer les fournisseurs" oninput="cseTicketFilterSuppliers(this.value)">'+
 '<div id="t26Suppliers">'+(available.map(s=>cardForSupplier(s,lastTickets)).join("")||'<p>Aucun fournisseur</p>')+'</div></section>'+
 '<section class="t26-main">'+(chosen?
 '<div class="t26-main-head"><div><div class="t26-overline">'+escHtml(chosen.category)+'</div><h2>'+escHtml(chosen.name)+'</h2><p>Les PDF importés sont conservés en « Libres » jusqu’à leur attribution.</p></div><span class="t26-badge">Mode démonstration</span></div>'+
 '<div class="t26-droparea" id="t26Drop" ondragover="event.preventDefault();this.classList.add(\'hover\')" ondragleave="this.classList.remove(\'hover\')" ondrop="cseTicketDrop(event)">'+
 '<div class="t26-upload-icon">⇧</div><strong>Déposer les PDF de '+escHtml(chosen.name)+' ici</strong>'+
 '<p>Glissez-déposez vos billets ou sélectionnez plusieurs fichiers PDF.</p>'+
 '<label class="btn primary t26-upload-btn">＋ Importer des billets PDF<input id="t26Input" type="file" accept="application/pdf,.pdf" multiple hidden onchange="cseTicketImport(this.files)"></label>'+
 '<small>PDF uniquement, 12 Mo maximum par fichier. Noms de fichiers identiques refusés pour un même fournisseur.</small></div>'+
 '<div class="t26-assign-box"><h3>Attribuer automatiquement à une commande</h3><p>Les billets libres sont attribués dans l’ordre d’import. Après l’attribution, leur nom est préfixé par prénom et nom, puis ils passent dans « Vendu ».</p>'+
 '<div class="t26-assign-form"><label class="t26-field">Commande <select id="t26Order" onchange="cseTicketUpdateOrder()"><option value="">Choisir une commande...</option>'+
 byOrders.map(o=>'<option value="'+escHtml(o.id)+'">'+escHtml(o.id)+' · '+escHtml((E(o.emp)?.first||"")+" "+(E(o.emp)?.last||""))+' · '+o.qty+' billet(s) · '+(o.paid?"payée":"non payée")+'</option>').join("")+'</select></label>'+
 '<label class="t26-force"><input id="t26Force" type="checkbox"> Forçage administrateur si non payée</label>'+
 '<button class="btn primary" onclick="cseTicketAssignOrder()">✓ Attribuer les billets</button></div><div id="t26OrderHelp" class="t26-footnote"></div>'+
 (byOrders.length?"":'<p class="t26-notice">Aucune commande fictive ne correspond à ce fournisseur. Les correspondances produit/fournisseur seront gérées par la base de données en production.</p>')+'</div>'+
 '<div class="t26-file-head"><div class="t26-tabs"><button onclick="cseTicketFolder(\'Libres\')" class="'+(v26Folder==="Libres"?"active":"")+'">▤ Libres <span id="t26FreeCount"></span></button>'+
 '<button onclick="cseTicketFolder(\'Vendu\')" class="'+(v26Folder==="Vendu"?"active":"")+'">✓ Vendu <span id="t26SoldCount"></span></button></div>'+
 '<label class="t26-search">Rechercher <input id="t26Search" type="search" placeholder="Nom de fichier, salarié, commande…" value="'+escHtml(v26Search)+'" oninput="cseTicketSearch(this.value)"></label></div>'+
 '<div class="tablewrap"><table class="t26-table"><thead><tr><th>PDF</th><th>Commande / salarié</th><th>Date</th><th>État</th><th>Action</th></tr></thead><tbody id="t26Table"><tr><td colspan="5">Chargement...</td></tr></tbody></table></div>'+
 '<p class="t26-footnote">Un billet vendu garde le même PDF ; son nom de téléchargement est modifié et son état passe dans le dossier « Vendu ». Aucune pièce jointe ni email réel n’est envoyé par la maquette.</p>'
 :'<section class="panel"><h3>Sélectionnez un fournisseur</h3><p>Choisissez une catégorie ou créez un fournisseur pour importer des billets.</p></section>')+
 '</section></div>';
}
function view(){
 const html=body();
 Promise.resolve().then(refresh).catch(e=>console.warn("Billetterie démo",e));
 return html;
}
async function refresh(){
 const token=++updateSerial;
 const entries=await store.list();
 if(token!==updateSerial||typeof route==="undefined"||route!=="tickets")return;
 lastTickets=entries;
 const stats=document.getElementById("t26Summary");
 if(stats){
  const total=entries.length,free=entries.filter(x=>x.status==="Libre").length,sold=entries.filter(x=>x.status==="Vendu").length;
  stats.innerHTML=[["PDF stockés",total],["Billets libres",free],["Billets vendus",sold],["Fournisseurs",store.suppliers().length]].map(x=>'<div class="t26-metric"><small>'+x[0]+'</small><strong>'+x[1]+'</strong></div>').join("");
 }
 const all=store.suppliers().filter(s=>v26Cat==="Toutes"||s.category===v26Cat);
 const target=document.getElementById("t26Suppliers");
 if(target)target.innerHTML=all.map(x=>cardForSupplier(x,entries)).join("")||'<p class="t26-footnote">Aucun fournisseur.</p>';
 const free=entries.filter(t=>t.supplier===v26Supplier&&t.status==="Libre");
 const sold=entries.filter(t=>t.supplier===v26Supplier&&t.status==="Vendu");
 if(document.getElementById("t26FreeCount"))document.getElementById("t26FreeCount").textContent=free.length;
 if(document.getElementById("t26SoldCount"))document.getElementById("t26SoldCount").textContent=sold.length;
 const keyword=v26Search.toLocaleLowerCase("fr");
 const list=(v26Folder==="Libres"?free:sold).filter(t=>[t.displayName,t.originalName,t.ownerName,t.orderId,t.invoice].join(" ").toLocaleLowerCase("fr").includes(keyword));
 const tbody=document.getElementById("t26Table");
 if(tbody)tbody.innerHTML=list.map(t=>'<tr><td><b class="t26-file">▧ '+escHtml(t.displayName)+'</b><small>Original : '+escHtml(t.originalName)+'</small></td>'+
 '<td>'+(t.orderId?'<b>'+escHtml(t.orderId)+'</b><small>'+escHtml(t.ownerName||"")+' · '+escHtml(t.invoice||"")+'</small>':'—')+'</td>'+
 '<td>'+escHtml((t.soldAt||t.createdAt||"").slice(0,10))+'</td>'+
 '<td><span class="t26-status '+(t.status==="Vendu"?"sold":"free")+'">'+escHtml(t.status)+'</span></td>'+
 '<td><div class="t26-actions"><button class="btn" onclick="cseTicketDownload('+jsArg(t.id)+')">↓ PDF</button>'+
 (t.status==="Libre"?'<button class="btn t26-assign-btn" onclick="cseTicketChoose('+jsArg(t.id)+')">Attribuer</button>':'')+'</div></td></tr>').join("")||
 '<tr><td colspan="5" class="t26-empty">Aucun PDF dans le dossier « '+v26Folder+' ». '+(v26Folder==="Libres"?"Importez des billets ci-dessus pour commencer.":"Les billets attribués apparaîtront ici.")+'</td></tr>';
}
function filterSuppliers(term){
 const q=String(term||"").trim().toLocaleLowerCase("fr");
 document.querySelectorAll("#t26Suppliers .t26-supplier").forEach(el=>{
  el.hidden=!el.textContent.toLocaleLowerCase("fr").includes(q);
 });
}
async function importTickets(files){
 try{
  if(!v26Supplier){toast("Sélectionnez d'abord un fournisseur.");return}
  const supplier=store.suppliers().find(x=>x.name===v26Supplier);
  const result=await store.importFiles(files,v26Supplier,supplier?.category||"Autres");
  v26Folder="Libres";
  const input=document.getElementById("t26Input");if(input)input.value="";
  render();
  toast(result.added+" billet(s) PDF importé(s)."+(result.duplicates.length?" "+result.duplicates.length+" doublon(s) ignoré(s).":""));
 }catch(e){alert("Import impossible : "+e.message)}
}
function drop(ev){
 ev.preventDefault();ev.currentTarget.classList.remove("hover");
 if(ev.dataTransfer?.files)importTickets(ev.dataTransfer.files);
}
function choose(id){
 v26PriorityId=id;
 const select=document.getElementById("t26Order");
 if(!select)return;
 select.focus();
 document.getElementById("t26OrderHelp").textContent="Le billet sélectionné sera attribué en priorité lors de la validation de la commande.";
 document.getElementById("t26OrderHelp").scrollIntoView({behavior:"smooth",block:"center"});
}
function updateOrder(){
 const id=document.getElementById("t26Order")?.value,order=orders.find(o=>o.id===id);
 const help=document.getElementById("t26OrderHelp");if(!help)return;
 help.textContent=order?"Commande "+order.id+" — "+order.qty+" billet(s) — "+(order.paid?"paiement validé":"paiement non validé")+
   ". Les billets seront associés à "+(E(order.emp)?.first||"")+" "+(E(order.emp)?.last||"")+".":"";
}
async function assign(){
 const id=document.getElementById("t26Order")?.value;
 const order=orders.find(o=>o.id===id);
 if(!order){toast("Choisissez une commande pour attribuer les billets.");return}
 const employee=E(order.emp);if(!employee){toast("Le salarié est introuvable.");return}
 if(orderSupplier(order)!==v26Supplier){toast("Le fournisseur ne correspond pas à la commande.");return}
 const forced=!!document.getElementById("t26Force")?.checked;
 if(!order.paid&&!forced){toast("Le règlement n'est pas validé. Utilisez une commande payée ou un forçage administrateur.");return}
 if(!order.paid&&forced&&!confirm("Cette commande n'est pas payée. Confirmez-vous explicitement le forçage administrateur pour délivrer les billets de démonstration ?"))return;
 const qty=Number(order.qty)||1;
 if(!confirm("Attribuer les billets de "+id+" à "+employee.first+" "+employee.last+
  " ?\nLe nom des PDF sera préfixé par le nom du salarié et les fichiers passeront dans « Vendu ».\n\nAucun email réel ne sera envoyé."))return;
 try{
  const result=await store.assignToOrder({
   orderId:order.id, supplier:v26Supplier,quantity:qty,
   employee,orderDate:order.date,invoice:"F-2027-"+order.id.slice(-3),
   force:forced,prioritizeId:v26PriorityId
  });
  v26PriorityId=null;
  v26Folder="Vendu";
  order.pdfTicketCount=(order.pdfTicketCount||0)+result.assigned.length;
  if(order.paid)order.status="Validée";
  render();
  toast(result.assigned.length+" billet(s) attribué(s) et déplacé(s) dans Vendu. Téléchargement disponible.");
 }catch(e){alert("Attribution impossible : "+e.message)}
}
async function download(id){
 try{await store.downloadById(id)}catch(e){alert("Téléchargement impossible : "+e.message)}
}
function openImport(){
 const input=document.getElementById("t26Input");
 if(!input){toast("Sélectionnez un fournisseur dans la liste pour importer des billets.");return}
 input.click();
}
window.cseTicketOpenImport=openImport;
window.cseTicketCategory=selectCategory;
window.cseTicketSelectSupplier=selectSupplier;
window.cseTicketFolder=selectFolder;
window.cseTicketSearch=setSearch;
window.cseTicketFilterSuppliers=filterSuppliers;
window.cseTicketNewSupplier=supplierForm;
window.cseTicketImport=importTickets;
window.cseTicketDrop=drop;
window.cseTicketChoose=choose;
window.cseTicketUpdateOrder=updateOrder;
window.cseTicketAssignOrder=assign;
window.cseTicketDownload=download;

/* Raccourci depuis la commande vers l'attribution de billets PDF. */
function fromOrder(id){
 const order=orders.find(x=>x.id===id);
 if(!order)return;
 const supplier=orderSupplier(order);
 if(!supplier){toast("Cette commande n'est pas identifiée comme une commande de billetterie.");return}
 v26Cat="Toutes";v26Supplier=supplier;v26Folder="Libres";
 closeModal();
 navigate("tickets");
 const dropdown=document.getElementById("t26Order");
 if(dropdown){dropdown.value=id;updateOrder()}
}
window.cseTicketFromOrder=fromOrder;
if(typeof openOrder==="function"){
 const priorOpenOrderTicketV26=openOrder;
 openOrder=function(id){
  priorOpenOrderTicketV26(id);
  const order=orders.find(x=>x.id===id);
  if(!order||!orderSupplier(order))return;
  const container=document.querySelector(".modal");
  if(!container||document.getElementById("cseOrderTicketLinkV26"))return;
  const box=document.createElement("div");
  box.id="cseOrderTicketLinkV26";
  box.className="note";
  box.innerHTML='<b>Billetterie PDF</b><p class="small muted">Les billets de cette commande seront renommés et classés dans « Vendu » après attribution à un salarié.</p>'+
   '<button class="btn primary" onclick="cseTicketFromOrder('+JSON.stringify(id).replace(/"/g,"&quot;")+')">▧ Ouvrir l’attribution des billets PDF</button>';
  container.appendChild(box);
 };
}
ticketsView=view;
window.addEventListener("storage",e=>{
 if(e.key===store.SUPPLIER_KEY&&typeof route!=="undefined"&&route==="tickets")render();
});
if(typeof route!=="undefined"&&route==="tickets"&&typeof render==="function")render();
})();