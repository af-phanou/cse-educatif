/* CSE Éducatif V28 — Site salarié : commandes reliées aux PDF disponibles.
 * Paiement et email restent simulés ; aucune livraison avant validation. */
(function(){
"use strict";
if(!window.CSETicketFlow)return;
const flow=window.CSETicketFlow;
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const euro=x=>Number(x||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});
const arg=id=>JSON.stringify(String(id)).replace(/"/g,"&quot;");
let busy=false;
const oldCheckout=checkout;
checkout=async function(){
 if(busy)return;
 if(typeof mode==="undefined"||mode!=="employee"){
  modal("<h2>Commande réservée aux salariés</h2><p>Connectez-vous à votre espace salarié de démonstration.</p>");
  return;
 }
 if(!cart.length){notify("Votre panier est vide.");return}
 busy=true;
 try{
  const base=cartTotal();
  const discount=promo==="BIENVENUE10"?Math.round(base*.1*100)/100:0;
  const order=await flow.createOrder({cartRows:cart.map(x=>({...x})),
    employee:profile,total:base-discount,promo});
  cart=[];promo="";
  render();
  modal('<div class="v28-confirm"><div class="v28-success">✓</div>'+
    '<h2>Commande '+safe(order.id)+' enregistrée</h2>'+
    '<p><b>'+order.reservedCount+' billet(s) PDF réservé(s)</b> dans la billetterie du CSE.</p>'+
    '<p>Les billets ne seront pas livrés avant la confirmation du paiement et la validation automatique ou administrative.</p>'+
    '<div class="v28-confirm-actions"><button class="btn primary" onclick="cseV28Pay('+arg(order.id)+')">Simuler le paiement (test)</button>'+
    '<button class="btn" onclick="closeModal();go(\'orders\')">Voir mes commandes</button></div>'+
    '<p class="small muted">Paiement et envoi d’email fictifs dans cette maquette.</p></div>');
 }catch(e){notify("Commande non enregistrée : "+e.message);alert("Commande impossible : "+e.message)}
 finally{busy=false}
};
async function simulatePayment(id){
 if(busy)return;busy=true;
 try{
  const confirmed=flow.confirmPayment(id,"Paiement de test");
  if(flow.isAutoEnabled()){
   await flow.paidAutoFinalize(id);
   notify("Paiement simulé : billets attribués. Email automatique simulé.");
  }else notify("Paiement simulé : la commande attend la validation de l'administrateur.");
  closeModal();render();go("orders");
 }catch(e){alert("Impossible de simuler le paiement : "+e.message)}
 finally{busy=false}
}
function myOrders(){return flow.getOrders().filter(o=>
  String(o.employee.email||"").toLowerCase()===String(profile.email||"").toLowerCase()||
  (String(o.employee.first).toLowerCase()===String(profile.first).toLowerCase()&&
   String(o.employee.last).toLowerCase()===String(profile.last).toLowerCase())
)}
function ordersFromShop(){
 const orders=myOrders();
 return header("Mes commandes","Suivez le paiement, la préparation et la mise à disposition de vos billets PDF.")+
 '<div class="v28-client-orders">'+
 (orders.length?orders.map(o=>
  '<article class="v28-client-order"><div class="v28-client-order-top"><div><span class="v28-overline">'+safe(o.createdAt?.slice(0,10)||"")+'</span>'+
  '<h3>Commande '+safe(o.id)+'</h3></div><span class="v28-order-state '+(o.status==="Livrée"?"ready":"")+'">'+safe(o.status)+'</span></div>'+
  '<div class="v28-client-order-items">'+o.items.map(i=>'<div><span>'+safe(i.productName)+" · "+safe(i.variantName)+' × '+i.qty+'</span><b>'+euro(Number(i.price)*i.qty)+'</b></div>').join("")+'</div>'+
  '<div class="v28-client-order-bottom"><div><span>Total :</span> <b>'+euro(o.total)+'</b><small>'+
  ' · '+Number(o.reservedCount||0)+' billet(s) réservé(s)'+
  (o.status==="Livrée"?' · PDF dans « Mes billets »':'')+'</small></div>'+
  '<div class="v28-client-buttons">'+(o.paymentStatus==="En attente"&&o.status!=="Annulée"?
  '<button class="btn primary" onclick="cseV28Pay('+arg(o.id)+')">Simuler le paiement</button>':'')+
  '<button class="btn" onclick="cseV28OrderDetails('+arg(o.id)+')">Détails</button>'+
  (o.status==="Livrée"?'<button class="btn primary" onclick="go(\'tickets\')">Voir mes billets</button>':'')+
  '</div></div></article>').join(""):
  '<div class="v28-client-empty"><h3>Aucune commande récente</h3><p>Vos prochaines commandes apparaîtront ici après confirmation.</p>'+
  '<button class="btn primary" onclick="go(\'catalog\')">Découvrir la boutique</button></div>')+
 '</div><div class="notice">Maquette de démonstration : les paiements et l’envoi des emails ne sont pas réels. Les billets sont conservés dans ce navigateur.</div>';
}
function details(id){
 const order=myOrders().find(o=>o.id===id);if(!order)return;
 modal('<h2>Commande '+safe(order.id)+'</h2><p>Passée le '+safe(order.createdAt?.slice(0,10)||"")+'</p>'+
  '<div class="v28-detail-lines">'+order.items.map(i=>'<div><span>'+safe(i.productName)+" — "+safe(i.variantName)+' × '+i.qty+'</span><b>'+euro(i.price*i.qty)+'</b></div>').join("")+'</div>'+
  '<p><b>Total :</b> '+euro(order.total)+'</p>'+
  '<p><b>État du paiement :</b> '+safe(order.paymentStatus)+'</p>'+
  '<p><b>Billets :</b> '+safe(order.status)+'</p>'+
  '<p><b>Notification :</b> '+safe(order.emailStatus||"Non envoyée")+'</p>'+
  '<p><b>Facture :</b> '+safe(order.invoice)+'</p>'+
  '<p class="small muted">Le QR code du PDF reste inchangé lors du renommage.</p>');
}
window.cseV28Pay=simulatePayment;
window.cseV28OrderDetails=details;
ordersPage=ordersFromShop;
window.addEventListener("storage",e=>{
 if(e.key===flow.ORDERS_KEY&&mode==="employee"&&(page==="orders"||page==="tickets"))render();
});
window.addEventListener("cse:v28-orders",()=>{
 if(mode==="employee"&&(page==="orders"||page==="tickets"))render();
});
})();