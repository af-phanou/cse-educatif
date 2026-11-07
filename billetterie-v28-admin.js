/* CSE Éducatif V28 — Administration des commandes web, stock PDF et emails préparés.
 * Un email réellement expédié nécessitera l'intégration OVH (non disponible sur GitHub Pages).
 */
(function(){
"use strict";
if(!window.CSETicketFlow||!window.CSETicketStore)return;
const flow=window.CSETicketFlow, store=window.CSETicketStore;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>Number(n||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const arg=s=>JSON.stringify(String(s)).replace(/"/g,"&quot;");
let pumping=false,orderActionBusy=false;
const eventStyle=(s)=>s==="Livrée"?"v28-ready":s==="Annulée"?"v28-cancel":"";
function mappingHtml(){
 const map=flow.getMapping(),suppliers=store.suppliers();
 const products=CSECatalog.load().products.filter(p=>flow.isTicketCategory(p.category));
 return '<section class="panel v28-panel" id="v28Mappings"><div class="v28-section-head"><div><h3>Associer les produits aux fournisseurs de billets PDF</h3>'+
 '<p>Cette correspondance permet de choisir automatiquement le bon dossier PDF lorsque le salarié commande une déclinaison.</p></div>'+
 '<span class="v28-badge">Configuration requise</span></div>'+
 '<div class="v28-mapping-list">'+products.map(p=>{
  const current=map[String(p.id)]||"";
  return '<label class="v28-mapping"><span><b>'+esc(p.name)+'</b><small>'+esc(p.category)+' · '+(p.variants?.length||0)+' formule(s)</small></span>'+
   '<select aria-label="Fournisseur de billets pour '+esc(p.name)+'" onchange="cseV28Map('+arg(p.id)+',this.value)">'+
   '<option value="">— Aucun fournisseur —</option>'+suppliers.map(s=>'<option value="'+esc(s.name)+'" '+(current===s.name?'selected':'')+'>'+esc(s.name)+'</option>').join("")+
   '</select></label>';
 }).join("")+'</div>'+
 '<p class="v28-hint">Les associations « Kinépolis → Cinéma Lumière » et « Parc partenaire → Parc Aventure » sont uniquement des exemples de démonstration. Corrigez-les pour utiliser vos fournisseurs réels.</p></section>';
}
function orderRow(order){
 const status=order.status;
 const canPay=order.paymentStatus!=="Confirmé"&&status!=="Annulée";
 const hasPdf=order.items.some(i=>!!i.ticketSupplier);
 const canRelease=hasPdf&&status!=="Livrée"&&status!=="Annulée";
 const canCancel=status!=="Livrée"&&status!=="Annulée";
 const canMail=status==="Livrée";
 return '<tr><td><b>'+esc(order.id)+'</b><small>'+esc((order.createdAt||"").slice(0,10))+'</small></td>'+
 '<td><b>'+esc(order.employee.first+" "+order.employee.last)+'</b><small>'+esc(order.employee.email||"Aucun email")+'</small></td>'+
 '<td>'+order.items.map(x=>'<span class="v28-item">'+esc(x.productName)+' — '+esc(x.variantName)+' × '+x.qty+
   '<small>PDF : '+esc(x.ticketSupplier||"Non applicable")+'</small></span>').join("")+'</td>'+
 '<td>'+money(order.total)+'</td>'+
 '<td><span class="v28-status '+eventStyle(status)+'">'+esc(status)+'</span>'+
 '<small>'+esc(order.paymentStatus==='Confirmé'?"Paiement confirmé (test)":"Paiement non confirmé")+'</small></td>'+
 '<td><div class="v28-mini-actions">'+
 (canPay?'<button class="btn" onclick="cseV28MarkPaid('+arg(order.id)+')">✓ Confirmer paiement</button>':'')+
 (canRelease?'<button class="btn primary" onclick="cseV28ReleaseOrder('+arg(order.id)+')">Valider & attribuer</button>':'')+
 (canMail?'<label class="v28-template-choice">Modèle de mail<select id="v28tpl-'+esc(order.id)+'" aria-label="Modèle de mail">'+
   mailTemplates.map((_,i)=>'<option value="'+i+'">Modèle '+(i+1)+'</option>').join("")+'</select></label>'+
   '<button class="btn" onclick="cseV28ExportEmail('+arg(order.id)+')">↓ Email avec PDF (.eml)</button>'+
   '<button class="btn" onclick="cseV28MarkMail('+arg(order.id)+')">Marquer email envoyé</button>':'')+
 (canCancel?'<button class="link" onclick="cseV28CancelOrder('+arg(order.id)+')">Annuler</button>':'')+
 (!hasPdf?'<small>Commande sans billetterie : préparation à traiter séparément.</small>':'')+
 '</div><small>'+esc(order.emailStatus||"")+'</small></td></tr>';
}
function webOrdersPanel(onlyTickets=false){
 const all=flow.getOrders().filter(o=>!onlyTickets||o.items.some(i=>i.ticketSupplier));
 const pending=all.filter(o=>o.status!=="Livrée"&&o.status!=="Annulée").length;
 const paid=all.filter(o=>o.paymentStatus==="Confirmé").length;
 return '<section class="panel v28-panel" id="v28Orders"><div class="v28-section-head"><div><h3>Commandes passées sur le site salarié</h3>'+
 '<p>Les PDF sont réservés dès la commande, puis classés dans « Vendu » après confirmation du paiement et validation.</p></div>'+
 '<div class="v28-stats"><span><b>'+all.length+'</b> commandes</span><span><b>'+pending+'</b> en attente</span><span><b>'+paid+'</b> paiements confirmés (test)</span></div></div>'+
 '<div class="v28-autoline"><label><input type="checkbox" '+(flow.isAutoEnabled()?'checked':'')+
 ' onchange="toggleAutomaticPaidOrders(this.checked)"> Validation automatique des commandes entièrement payées</label>'+
 '<small>Modification protégée par le code PIN administrateur déjà prévu. Envoi de mails uniquement simulé.</small></div>'+
 '<div class="tablewrap"><table class="v28-orders-table"><thead><tr><th>Commande</th><th>Salarié</th><th>Produits / PDF</th><th>Montant</th><th>État</th><th>Actions</th></tr></thead>'+
 '<tbody id="v28OrdersRows">'+(all.length?all.map(orderRow).join(""):'<tr><td colspan="6" class="empty">Aucune commande provenant du site salarié. Effectuez une commande dans « Espace salarié → Boutique ».</td></tr>')+'</tbody></table></div>'+
 '<p class="v28-hint">L’export .eml contient le véritable PDF attribué et permet un envoi manuel depuis votre messagerie. Aucun email n’est expédié automatiquement depuis GitHub Pages.</p></section>';
}
function refreshRows(){
 const tbody=document.getElementById("v28OrdersRows");
 if(tbody){
  const onlyTickets=!!tbody.closest(".v28-tickets-queue");
  const all=flow.getOrders().filter(o=>!onlyTickets||o.items.some(i=>i.ticketSupplier));
  tbody.innerHTML=all.length?all.map(orderRow).join(""):'<tr><td colspan="6" class="empty">Aucune commande web.</td></tr>';
 }
}
async function autoCheck(){
 if(pumping||!flow.isAutoEnabled())return;
 const pending=flow.getOrders().filter(o=>o.paymentStatus==="Confirmé"&&o.status!=="Livrée"&&o.status!=="Annulée");
 if(!pending.length)return;
 pumping=true;
 try{
  for(const order of pending){
   try{await flow.paidAutoFinalize(order.id)}
   catch(e){console.warn("Auto-attribution PDF",order.id,e)}
  }
  if(typeof route!=="undefined"&&(route==="orders"||route==="tickets"))render();
 }finally{pumping=false}
}
function mapProduct(id,supplier){
 try{flow.setMapping(id,supplier);render();toast("Association produit / fournisseur enregistrée.")}
 catch(e){alert(e.message)}
}
function orderFromStore(id){const o=flow.getOrder(id);if(!o)throw new Error("Commande introuvable");return o}
function confirmPaid(id){
 if(orderActionBusy)return;
 const o=orderFromStore(id);
 if(o.paymentStatus==="Confirmé")return;
 if(!confirm("Confirmer manuellement le paiement (SIMULATION) de la commande "+id+" ?"))return;
 try{
  flow.confirmPayment(id,"Saisie administrateur (simulation)");
  if(flow.isAutoEnabled())autoCheck();
  render();
  toast("Paiement de démonstration confirmé.");
 }catch(e){alert(e.message)}
}
async function validateAndDeliver(id){
 if(orderActionBusy)return;orderActionBusy=true;
 try{
  const order=orderFromStore(id);
  if(order.status==="Livrée"){toast("Billets déjà attribués.");return}
  let forced=false;
  if(order.paymentStatus!=="Confirmé"){
   if(!confirm("ATTENTION : paiement non confirmé.\n\nConfirmer la dérogation administrative et délivrer malgré l'absence de règlement (simulation) ?")){
    return;
   }
   forced=true;
  }
  if(!confirm("Attribuer les PDF réservés à "+order.employee.first+" "+order.employee.last+
    " et les déplacer dans « Vendu » ?\n\nL'email ne sera PAS réellement envoyé."))return;
  const result=await flow.finalize(id,{auto:false,force:forced});
  render();
  toast(result.assigned.length+" billet(s) classé(s) « Vendu ». Exportez le brouillon email pour un envoi manuel.");
 }catch(e){alert("Attribution refusée : "+e.message)}
 finally{orderActionBusy=false}
}
async function cancel(id){
 if(orderActionBusy)return;
 const order=orderFromStore(id);
 if(order.status==="Livrée"){toast("Une commande livrée ne peut pas être annulée dans cette maquette.");return}
 if(!confirm("Annuler "+id+" et remettre les PDF réservés dans « Libres » ?"))return;
 orderActionBusy=true;
 try{
  const res=await flow.release(id);
  render();toast(res.released+" billet(s) remis dans Libres.");
 }catch(e){alert("Annulation impossible : "+e.message)}
 finally{orderActionBusy=false}
}
function b64(bytes){
 const chunk=0x8000;let raw="";
 for(let i=0;i<bytes.length;i+=chunk)raw+=String.fromCharCode.apply(null,bytes.subarray(i,i+chunk));
 return btoa(raw);
}
function b64text(text){return b64(new TextEncoder().encode(text))}
function lines(text){return String(text).match(/.{1,76}/g)?.join("\r\n")||""}
function escapeHeader(s){return String(s||"").replace(/[\r\n]+/g," ").trim()}
async function exportEmail(id){
 if(orderActionBusy)return;orderActionBusy=true;
 try{
  const order=orderFromStore(id);
  if(order.status!=="Livrée")throw new Error("Les billets n'ont pas été validés et attribués.");
  if(!order.employee.email||!/^.+@.+\..+$/.test(order.employee.email))throw new Error("Adresse email du salarié manquante ou invalide.");
  const billets=await flow.orderTickets(id);
  const needs=order.items.filter(x=>x.ticketSupplier).reduce((x,i)=>x+Number(i.qty),0);
  if(billets.length!==needs)throw new Error("Pièces jointes manquantes : "+billets.length+"/"+needs);
  const boundary="CSE-"+id.replace(/[^a-zA-Z0-9]/g,"")+"-"+Date.now();
  const subject="CSE Éducatif — Vos billets • commande "+id;
  const chosenTemplate=Number(document.getElementById("v28tpl-"+id)?.value||0);
  const template=mailTemplates[chosenTemplate]||mailTemplates[0];
  const message=template.replaceAll("{prenom}",order.employee.first).replaceAll("{commande}",id)+
   "\n\nLes billets PDF et leurs QR codes sont joints à ce message.\n\nBien cordialement,\nLe CSE Éducatif";
  const head="MIME-Version: 1.0\r\nTo: "+escapeHeader(order.employee.email)+
   "\r\nSubject: =?UTF-8?B?"+b64text(subject)+"?=\r\n"+
   'Content-Type: multipart/mixed; boundary="'+boundary+'"\r\n\r\n';
  let body="--"+boundary+"\r\nContent-Type: text/plain; charset=UTF-8\r\n"+
   "Content-Transfer-Encoding: base64\r\n\r\n"+lines(b64text(message))+"\r\n";
  for(const t of billets){
   const safeName=store.namesafe(t.displayName.replace(/\.pdf$/i,""))+".pdf";
   const bytes=new Uint8Array(await t.pdf.arrayBuffer());
   body+="--"+boundary+"\r\nContent-Type: application/pdf; name=\""+safeName+"\"\r\n"+
     "Content-Transfer-Encoding: base64\r\n"+
     "Content-Disposition: attachment; filename=\""+safeName+"\"\r\n\r\n"+
     lines(b64(bytes))+"\r\n";
  }
  body+="--"+boundary+"--\r\n";
  const url=URL.createObjectURL(new Blob([head+body],{type:"message/rfc822"}));
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="CSE_email_"+id.replace(/[^a-zA-Z0-9_-]/g,"")+".eml";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
  flow.updateOrder(id,{emailStatus:"Brouillon .eml exporté (non envoyé)",emailDraftAt:new Date().toISOString()});
  toast("Brouillon .eml téléchargé avec "+billets.length+" PDF. Ouvrez-le dans votre messagerie pour l'envoyer.");
  render();
 }catch(e){alert("Préparation de l’email impossible : "+e.message)}
 finally{orderActionBusy=false}
}
function markMail(id){
 const order=orderFromStore(id);
 if(order.status!=="Livrée")return;
 if(!confirm("Confirmez-vous avoir réellement envoyé le mail via votre propre messagerie ?\nCeci enregistre seulement l'information dans la maquette."))return;
 flow.updateOrder(id,{emailStatus:"Déclaré envoyé manuellement",emailMarkedAt:new Date().toISOString()});
 render();toast("Envoi manuel enregistré dans la maquette.");
}
window.cseV28Map=mapProduct;
window.cseV28MarkPaid=confirmPaid;
window.cseV28ReleaseOrder=validateAndDeliver;
window.cseV28CancelOrder=cancel;
window.cseV28ExportEmail=exportEmail;
window.cseV28MarkMail=markMail;
const previousTicketsView=ticketsView;
ticketsView=function(){
 const html=previousTicketsView();
 Promise.resolve().then(autoCheck);
 return html+mappingHtml()+'<div class="v28-tickets-queue">'+webOrdersPanel(true)+'</div>';
};
const previousOrdersView=ordersView;
ordersView=function(){
 Promise.resolve().then(autoCheck);
 let old="";
 try{old=previousOrdersView()}catch(e){
  console.warn("Ancien affichage de commandes de démonstration indisponible",e);
  old='<section class="panel"><p class="muted">Les anciennes commandes fictives ne sont pas reliées au nouveau catalogue. Utilisez les commandes web ci-dessus.</p></section>';
 }
 return webOrdersPanel(false)+old;
};
window.addEventListener("storage",e=>{
 if(e.key===flow.AUTO_KEY){if(flow.isAutoEnabled())autoCheck();if(route==="orders"||route==="tickets")render();}
 if(e.key===flow.ORDERS_KEY){if(flow.isAutoEnabled())autoCheck();if(route==="orders"||route==="tickets")render();}
});
window.addEventListener("cse:v28-orders",()=>{
 if(flow.isAutoEnabled())autoCheck();
 if(typeof route!=="undefined"&&(route==="orders"||route==="tickets"))render();
});
window.addEventListener("cse:v28-mapping",()=>{if(typeof route!=="undefined"&&route==="tickets")render()});
if(typeof route!=="undefined"&&(route==="tickets"||route==="orders")&&typeof render==="function")render();
})();