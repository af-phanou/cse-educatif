/* CSE Éducatif V28 — Commande → réservation PDF → validation → attribution.
 * Démonstration locale : pas de paiement confirmé par une banque, pas d'email expédié.
 * Réservations atomiques dans IndexedDB, même stock pour les onglets/iframes du navigateur.
 */
(function(){
"use strict";
if(!window.CSETicketStore||!window.CSECatalog)return;
const store=window.CSETicketStore;
const ORDERS_KEY="cse_v28_commandes_site";
const MAPPING_KEY="cse_v28_fournisseurs_billets";
const AUTO_KEY="cse_fusion_v13_auto_paid";
const seed={"product-kinepolis":"Cinéma Lumière","product-parc":"Parc Aventure"};
const validStatuses=["Libre","Réservé","Vendu"];
function getOrders(){
 try{const x=JSON.parse(localStorage.getItem(ORDERS_KEY));return Array.isArray(x)?x:[]}
 catch(e){return []}
}
function saveOrders(all){
 localStorage.setItem(ORDERS_KEY,JSON.stringify(all));
 window.dispatchEvent(new CustomEvent("cse:v28-orders",{detail:{count:all.length}}));
 return all;
}
function getOrder(id){return getOrders().find(o=>o.id===id)||null}
function updateOrder(id,update){
 const all=getOrders(),i=all.findIndex(o=>o.id===id);
 if(i<0)throw new Error("Commande introuvable");
 const next={...all[i],...update,updatedAt:new Date().toISOString()};
 all[i]=next;saveOrders(all);return next;
}
function getMapping(){
 try{
  const old=JSON.parse(localStorage.getItem(MAPPING_KEY));
  if(old&&typeof old==="object"&&!Array.isArray(old))return {...seed,...old};
 }catch(e){}
 return {...seed};
}
function setMapping(productId,supplier){
 if(!CSECatalog.load().products.some(p=>String(p.id)===String(productId)))throw new Error("Produit introuvable");
 const map=getMapping();map[String(productId)]=String(supplier||"").trim();
 localStorage.setItem(MAPPING_KEY,JSON.stringify(map));
 window.dispatchEvent(new Event("cse:v28-mapping"));
 return map;
}
function resolveSupplier(product){
 const mapping=getMapping(),name=mapping[String(product.id)]||"";
 return store.suppliers().some(s=>s.name===name)?name:"";
}
function isTicketCategory(category){
 return /cin[eé]ma|parc|billet|spectacle|concert|mus[eé]e|loisir|sport|culture/i.test(String(category||""));
}
function nextId(){
 const date=new Date().toISOString().slice(2,10).replace(/-/g,"");
 const digits=window.crypto?.randomUUID?.().replace(/-/g,"").slice(0,7).toUpperCase()||
  Math.random().toString(36).slice(2,9).toUpperCase();
 return "WEB-"+date+"-"+digits;
}
function idbRun(mode,handler){
 return store.openDb().then(db=>new Promise((resolve,reject)=>{
  const tx=db.transaction("pdfTickets",mode),table=tx.objectStore("pdfTickets");
  let output=null,abortReason=null;
  tx.oncomplete=()=>{db.close();resolve(output)};
  tx.onabort=()=>{db.close();reject(abortReason||tx.error||new Error("Transaction de billets annulée"))};
  tx.onerror=()=>{abortReason=tx.error||new Error("Erreur de stockage")};
  const ok=value=>{output=value};
  const fail=err=>{abortReason=err instanceof Error?err:new Error(String(err));tx.abort()};
  try{handler(table,ok,fail)}catch(err){fail(err)}
 }));
}
/* Réservation multi-fournisseur atomique : aucun PDF vendu/réservé ne peut être repris. */
async function reserve(order){
 if(!order?.id)throw new Error("Numéro de commande manquant");
 const lines=(order.items||[]).filter(x=>x.ticketSupplier);
 if(!lines.length)return {ids:[],count:0};
 return idbRun("readwrite",(table,ok,fail)=>{
  const req=table.getAll();
  req.onerror=()=>fail(req.error||new Error("Stock de billets inaccessible"));
  req.onsuccess=()=>{
   const rows=req.result||[],reserved=[];
   const already=rows.filter(t=>t.orderId===order.id&&t.status!=="Libre");
   if(already.length){
    ok({ids:already.map(t=>t.id),count:already.length,existing:true});
    return;
   }
   const used=new Set();
   for(const item of lines){
    const needed=Number(item.qty);
    if(!Number.isInteger(needed)||needed<1||needed>99)return fail(new Error("Quantité de billets invalide"));
    const eligible=rows.filter(t=>!used.has(t.id)&&t.status==="Libre"&&
       t.supplier===item.ticketSupplier &&
       (!t.variantId || String(t.variantId)===String(item.variantId)));
    eligible.sort((a,b)=>{
      const preferredA=String(a.variantId||"")===String(item.variantId)?0:1;
      const preferredB=String(b.variantId||"")===String(item.variantId)?0:1;
      return preferredA-preferredB||String(a.createdAt).localeCompare(String(b.createdAt));
    });
    if(eligible.length<needed){
     return fail(new Error("Stock PDF insuffisant pour "+item.productName+" ("+item.variantName+
      ") chez "+item.ticketSupplier+" : "+eligible.length+" disponible(s), "+needed+" demandé(s)."));
    }
    const chosen=eligible.slice(0,needed);
    for(const t of chosen){used.add(t.id);reserved.push({...t,
      status:"Réservé",folder:"Réservés",orderId:order.id,variantId:Number(item.variantId),
      reservedAt:new Date().toISOString(),ownerName:order.employee.first+" "+order.employee.last,
      ownerEmail:order.employee.email||"",ownerId:order.employee.employeeId??null
    })}
   }
   for(const t of reserved)table.put(t);
   ok({ids:reserved.map(x=>x.id),count:reserved.length,existing:false});
  };
 });
}
/* Paiement confirmé (simulation) et décision admin ou auto : renommage atomique. */
async function finalize(orderId,opts={}){
 const order=getOrder(orderId);
 if(!order)throw new Error("Commande introuvable");
 if(order.status==="Livrée")return {order,assigned:[],already:true};
 if(order.paymentStatus!=="Confirmé"&&!opts.force)
  throw new Error("Le paiement doit être confirmé avant délivrance.");
 const items=(order.items||[]).filter(i=>i.ticketSupplier);
 const count=items.reduce((sum,i)=>sum+Number(i.qty||0),0);
 const result=await idbRun("readwrite",(table,ok,fail)=>{
  const req=table.getAll();
  req.onerror=()=>fail(req.error);
  req.onsuccess=()=>{
   const all=req.result||[];
   const reserved=all.filter(t=>t.orderId===orderId&&t.status==="Réservé");
   const sold=all.filter(t=>t.orderId===orderId&&t.status==="Vendu");
   if(reserved.length+sold.length!==count){
    return fail(new Error("Les PDF réservés ne correspondent pas à la commande ("+
      (reserved.length+sold.length)+"/"+count+")."));
   }
   const now=new Date().toISOString(),ids=[];
   for(const t of reserved){
    const renamed=store.soldName(order.employee.first,order.employee.last,t.originalName);
    const next={...t,status:"Vendu",folder:"Vendu",displayName:renamed,
      ownerName:order.employee.first+" "+order.employee.last,
      ownerEmail:order.employee.email||"",
      orderDate:order.createdAt.slice(0,10),invoice:order.invoice,
      soldAt:now,forced:!!opts.force};
    table.put(next);ids.push(t.id);
   }
   ok({ids,already:sold.length,count});
  };
 });
 const mode=opts.auto?"auto":"manual";
 const next=updateOrder(orderId,{
  status:"Livrée",deliveredAt:new Date().toISOString(),deliveryMode:mode,
  emailStatus:opts.auto?"Envoi simulé (aucun email réel)":"Brouillon à exporter",
  forceDelivery:!!opts.force,
  audit:(order.audit||[]).concat({at:new Date().toISOString(),type:"attribution",
    description:result.count+" billets PDF déplacés dans Vendu; mode "+mode})
 });
 return {order:next,assigned:result.ids,already:false};
}
async function release(orderId){
 const order=getOrder(orderId);
 if(!order)throw new Error("Commande introuvable");
 const result=await idbRun("readwrite",(table,ok,fail)=>{
  const req=table.getAll();
  req.onerror=()=>fail(req.error);
  req.onsuccess=()=>{
   const rows=(req.result||[]).filter(t=>t.orderId===orderId&&t.status==="Réservé");
   for(const t of rows)table.put({...t,status:"Libre",folder:"Libres",orderId:null,reservedAt:null,
     ownerName:null,ownerEmail:null,ownerId:null,variantId:null});
   ok({released:rows.length});
  };
 });
 const next=updateOrder(orderId,{status:"Annulée",cancelledAt:new Date().toISOString(),
   audit:(order.audit||[]).concat({at:new Date().toISOString(),type:"annulation",
     description:result.released+" billet(s) remis dans Libres"})});
 return {order:next,...result};
}
function formatItems(cartRows){
 const catalog=CSECatalog.load();
 const all=CSECatalog.flatten(catalog);
 const productsById=new Map(catalog.products.map(p=>[String(p.id),p]));
 const mapping=getMapping();
 return cartRows.map(x=>{
  const row=all.find(p=>Number(p.id)===Number(x.id));
  if(!row)throw new Error("Une déclinaison du panier n'existe plus dans le catalogue.");
  const product=productsById.get(String(row.productId));
  if(!product)throw new Error("Produit introuvable");
  const qty=Number(x.qty);
  if(!Number.isInteger(qty)||qty<1||qty>99)throw new Error("Quantité invalide dans le panier.");
  const supplier=resolveSupplier(product);
  if(isTicketCategory(product.category)&&!supplier){
   throw new Error("Aucun fournisseur de PDF n'est relié au produit « "+product.name+
      " ». Demandez à l'administrateur de configurer l'association en billetterie.");
  }
  return {variantId:row.id,productId:product.id,productName:product.name,
    variantName:row.name,category:product.category,qty,price:Number(row.cse),
    ticketSupplier:supplier||null};
 });
}
async function createOrder({cartRows,employee,total,promo}){
 if(!Array.isArray(cartRows)||!cartRows.length)throw new Error("Panier vide");
 if(!employee?.first||!employee?.last)throw new Error("Identité du salarié manquante");
 const items=formatItems(cartRows);
 const order={
  id:nextId(),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  employee:{first:String(employee.first),last:String(employee.last),
    email:String(employee.email||""),est:String(employee.est||""),
    employeeId:employee.employeeId??null},
  items,total:Number(total),promo:String(promo||""),
  invoice:"F-"+new Date().getFullYear()+"-"+Math.random().toString(36).slice(2,8).toUpperCase(),
  paymentStatus:"En attente",paidAt:null,status:"En attente de paiement",
  deliveryMode:null,emailStatus:"Non envoyé",reservedCount:0,
  audit:[{at:new Date().toISOString(),type:"commande",description:"Commande créée sur le site salarié"}]
 };
 const booked=await reserve(order);
 order.reservedCount=booked.count;
 order.status=booked.count>0?"Billets réservés • paiement en attente":"En attente de paiement";
 order.audit.push({at:new Date().toISOString(),type:"réservation",description:booked.count+" billet(s) réservés"});
 try{saveOrders([order,...getOrders()])}
 catch(e){
  // Si la commande n'est pas persistée, libérer les billets précédemment réservés.
  await releaseUnpersisted(order.id);
  throw new Error("Stockage des commandes indisponible; les billets ont été libérés.");
 }
 return order;
}
async function releaseUnpersisted(id){
 return idbRun("readwrite",(table,ok,fail)=>{
  const req=table.getAll();
  req.onerror=()=>fail(req.error);
  req.onsuccess=()=>{
   let n=0;
   for(const t of req.result||[]){
    if(t.orderId===id&&t.status==="Réservé"){
      table.put({...t,status:"Libre",folder:"Libres",orderId:null,ownerName:null,
        ownerEmail:null,ownerId:null,reservedAt:null,variantId:null});n++;
    }
   }
   ok(n);
  };
 });
}
function confirmPayment(id,method){
 const current=getOrder(id);
 if(!current)throw new Error("Commande introuvable");
 if(current.status==="Annulée")throw new Error("Une commande annulée ne peut pas être encaissée");
 if(current.paymentStatus==="Confirmé")return current;
 return updateOrder(id,{paymentStatus:"Confirmé",paidAt:new Date().toISOString(),
   paymentMethod:method||"Démonstration",
   status:"Payée • en attente de validation",
   audit:(current.audit||[]).concat({at:new Date().toISOString(),
     type:"paiement",description:"Paiement confirmé (simulation)"})});
}
const isAutoEnabled=()=>{try{return localStorage.getItem(AUTO_KEY)==="true"}catch(e){return false}};
async function paidAutoFinalize(id){
 const order=getOrder(id);
 if(!order||order.paymentStatus!=="Confirmé"||order.status==="Livrée"||!isAutoEnabled())return null;
 return finalize(id,{auto:true});
}
async function orderTickets(id){
 const rows=await store.list();
 return rows.filter(t=>t.orderId===id&&t.status==="Vendu");
}
window.CSETicketFlow={
 ORDERS_KEY,MAPPING_KEY,AUTO_KEY,getOrders,getOrder,updateOrder,saveOrders,
 getMapping,setMapping,resolveSupplier,isTicketCategory,formatItems,
 reserve,finalize,release,createOrder,confirmPayment,isAutoEnabled,paidAutoFinalize,orderTickets
};
})();