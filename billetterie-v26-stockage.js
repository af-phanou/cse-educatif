/* CSE Éducatif V26 — Stockage de billets PDF en démonstration.
   IndexedDB conserve les octets des fichiers dans le navigateur.
   Un billet attribué est logiquement renommé et déplacé dans "Vendu".
   Aucune requête à GitHub, Dropbox ou OVH n'est effectuée. */
(function(){
"use strict";
const DB_NAME="cse-educatif-billetterie-test-v26", STORE="pdfTickets", VERSION=1;
const SUPPLIER_KEY="cse-educatif-fournisseurs-test-v26";
const initialSuppliers=[
 {name:"Cinéma Lumière",category:"Cinéma"},
 {name:"Parc Aventure",category:"Parcs d'attractions"}
];
const openDb=()=>{
 if(!window.indexedDB)return Promise.reject(new Error("Votre navigateur ne permet pas IndexedDB."));
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open(DB_NAME,VERSION);
  request.onupgradeneeded=()=>{
   const db=request.result;
   if(!db.objectStoreNames.contains(STORE)){
    const store=db.createObjectStore(STORE,{keyPath:"id"});
    store.createIndex("status","status");
    store.createIndex("supplier","supplier");
    store.createIndex("orderId","orderId");
   }
  };
  request.onerror=()=>reject(request.error||new Error("Impossible d'ouvrir le stockage"));
  request.onsuccess=()=>resolve(request.result);
 });
};
const txDone=(db,mode,cb)=>new Promise((resolve,reject)=>{
 const tx=db.transaction(STORE,mode),store=tx.objectStore(STORE);
 let value, failure;
 tx.oncomplete=()=>{db.close();resolve(value)};
 tx.onabort=()=>{db.close();reject(failure||tx.error||new Error("Transaction annulée"))};
 tx.onerror=()=>{failure=tx.error||new Error("Erreur de transaction")};
 try{cb(store,tx,v=>value=v,err=>{failure=err;tx.abort()})}catch(err){failure=err;tx.abort()}
});
async function list(){
 const db=await openDb();
 return txDone(db,"readonly",(store,tx,result)=>{
  const req=store.getAll();
  req.onsuccess=()=>result(req.result||[]);
 });
}
async function get(id){
 const db=await openDb();
 return txDone(db,"readonly",(store,tx,result)=>{
  const req=store.get(id);req.onsuccess=()=>result(req.result||null);
 });
}
function namesafe(text){
 return String(text||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-zA-Z0-9_-]+/g,"_").replace(/_+/g,"_").replace(/^_+|_+$/g,"")||"Salarié";
}
function soldName(first,last,originalName){
 const clean=String(originalName||"billet.pdf").replace(/^.*[\\/]/,"");
 return namesafe(first)+"_"+namesafe(last)+"_"+clean;
}
function suppliers(){
 try{
  const arr=JSON.parse(localStorage.getItem(SUPPLIER_KEY));
  if(Array.isArray(arr)&&arr.length)return arr.filter(x=>x&&x.name);
 }catch(e){}
 return initialSuppliers.slice();
}
function saveSupplier(name,category){
 name=String(name||"").trim();category=String(category||"Autres").trim();
 if(!name)return false;
 const all=suppliers();
 const existing=all.find(x=>x.name.toLocaleLowerCase("fr")===name.toLocaleLowerCase("fr"));
 if(existing)existing.category=category;
 else all.push({name,category});
 try{localStorage.setItem(SUPPLIER_KEY,JSON.stringify(all))}catch(e){return false}
 return true;
}
async function importFiles(files,supplier,category,variant={}){
 if(!supplier)throw new Error("Sélectionnez un fournisseur avant l'import.");
 const input=Array.from(files||[]);
 if(!input.length)throw new Error("Choisissez des fichiers PDF.");
 const valid=[];
 for(const file of input){
  if(!/\.pdf$/i.test(file.name)||file.size>12*1024*1024||file.size<100){
   throw new Error("Seuls les fichiers PDF de 12 Mo maximum sont autorisés : "+file.name);
  }
  const header=await file.slice(0,5).arrayBuffer();
  const chars=String.fromCharCode(...new Uint8Array(header));
  if(chars!=="%PDF-")throw new Error("Le fichier ne semble pas être un PDF valide : "+file.name);
  valid.push(file);
 }
 const old=await list();
 const keys=new Set(old.map(t=>t.supplier.toLocaleLowerCase("fr")+"|"+t.originalName.toLocaleLowerCase("fr")));
 const accepted=[],duplicates=[];
 for(const file of valid){
  const name=file.name.replace(/^.*[\\/]/,"");
  const key=supplier.toLocaleLowerCase("fr")+"|"+name.toLocaleLowerCase("fr");
  if(keys.has(key)){duplicates.push(name);continue}
  keys.add(key);
  accepted.push({
   id:window.crypto?.randomUUID?.()||"ticket-"+Date.now()+"-"+Math.random().toString(36).slice(2),
   originalName:name,displayName:name,category, supplier,
   variantId:variant.variantId?Number(variant.variantId):null,
   originalVariantId:variant.variantId?Number(variant.variantId):null,
   variantName:String(variant.variantName||""),
   status:"Libre", folder:"Libres",
   createdAt:new Date().toISOString(),soldAt:null,
   ownerId:null,ownerName:null,orderId:null,invoice:null,
   pdf:new Blob([file],{type:"application/pdf"}),size:file.size
  });
 }
 if(accepted.length){
  const db=await openDb();
  await txDone(db,"readwrite",store=>{accepted.forEach(t=>store.add(t))});
 }
 saveSupplier(supplier,category);
 return {added:accepted.length,duplicates};
}
async function assignToOrder({orderId,supplier,quantity,employee,orderDate,invoice,force=false,prioritizeId}){
 if(!orderId||!supplier||!employee||!employee.first||!employee.last)throw new Error("Commande, salarié ou fournisseur manquant.");
 const count=Number(quantity);
 if(!Number.isInteger(count)||count<1||count>99)throw new Error("Quantité de billets invalide.");
 const db=await openDb();
 return txDone(db,"readwrite",(store,tx,resolve,abort)=>{
  const req=store.getAll();
  req.onsuccess=()=>{
   const all=req.result||[];
   const already=all.filter(t=>t.status==="Vendu"&&t.orderId===orderId&&t.supplier===supplier).length;
   const needed=Math.max(0,count-already);
   if(!needed){resolve({assigned:[],already,needed:0});return}
   const available=all.filter(t=>t.status==="Libre"&&t.supplier===supplier);
   available.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));
   if(prioritizeId){
    const i=available.findIndex(t=>t.id===prioritizeId);
    if(i>=0)available.unshift(available.splice(i,1)[0]);
   }
   if(available.length<needed){
    abort(new Error("Billets insuffisants : "+available.length+" libre(s) pour "+needed+" demandé(s)."));
    return;
   }
   const now=new Date().toISOString(),chosen=available.slice(0,needed);
   for(const ticket of chosen){
    const updated={...ticket,
      displayName:soldName(employee.first,employee.last,ticket.originalName),
      status:"Vendu",folder:"Vendu",soldAt:now,
      ownerId:employee.id??null,
      ownerName:employee.first+" "+employee.last,
      orderId,orderDate:orderDate||now.slice(0,10),
      invoice:invoice||"",
      forced:!!force
    };
    store.put(updated);
   }
   resolve({assigned:chosen.map(t=>t.id),already,needed});
  };
  req.onerror=()=>abort(req.error||new Error("Lecture des billets impossible"));
 });
}
function download(record){
 if(!record||!(record.pdf instanceof Blob))throw new Error("Le contenu PDF n'est pas disponible.");
 const url=URL.createObjectURL(record.pdf);
 const a=document.createElement("a");
 a.href=url;a.download=record.displayName;a.style.display="none";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function downloadById(id){
 const row=await get(id);
 if(!row)throw new Error("Billet introuvable");
 download(row);
}
window.CSETicketStore={DB_NAME,SUPPLIER_KEY,openDb,list,get,importFiles,assignToOrder,downloadById,saveSupplier,suppliers,namesafe,soldName};
})();