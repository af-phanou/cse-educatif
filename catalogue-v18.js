/* CSE Educatif – Modele de catalogue V18, partage entre administration et espace salarie. */
(function(){
"use strict";
const KEY="cse_fusion_v18_catalogue", LEGACY="cse_fusion_v9_catalogue";
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=> "ID-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,8);
const initial={
 categories:["Cinéma","Parcs d'attractions","Spectacles","Sport","Paniers fraîcheur","Parfumerie"],
 products:[
 {id:"product-kinepolis",name:"Kinépolis",category:"Cinéma",description:"Billets et cartes pour les séances de cinéma.",image:"",featured:true,variants:[
 {id:1001,name:"Voucher individuel",public:13.6,cse:6.9,stock:20,unlimited:false,longDelay:false},
 {id:1002,name:"Carte 5 entrées",public:48,cse:34,stock:12,unlimited:false,longDelay:false},
 {id:1003,name:"Carte 8 entrées",public:68.8,cse:54,stock:7,unlimited:false,longDelay:false}]},
 {id:"product-ugc",name:"UGC",category:"Cinéma",description:"Places de cinéma et cartes multi-entrées.",image:"",featured:true,variants:[
 {id:1004,name:"Place individuelle",public:14.6,cse:6,stock:30,unlimited:false,longDelay:false},
 {id:1005,name:"Carte 5 entrées",public:63,cse:29.5,stock:8,unlimited:false,longDelay:false}]},
 {id:"product-parc",name:"Parc partenaire",category:"Parcs d'attractions",description:"Billets parcs d'attractions.",image:"",featured:true,variants:[
 {id:1006,name:"Entrée adulte",public:59,cse:39,stock:12,unlimited:false,longDelay:true},
 {id:1007,name:"Entrée enfant",public:48,cse:32,stock:12,unlimited:false,longDelay:true}]},
 {id:"product-panier",name:"Panier fraîcheur",category:"Paniers fraîcheur",description:"Produits frais selon la période.",image:"",featured:false,variants:[
 {id:1008,name:"Panier de saison",public:28,cse:21,stock:25,unlimited:false,longDelay:false}]}],
 updated:Date.now()
};
function migrateLegacy(){
 try{
 const raw=JSON.parse(localStorage.getItem(LEGACY));
 if(!raw||!Array.isArray(raw.products)||!raw.products.length)return null;
 const groups=new Map();
 const categories=Array.isArray(raw.categories)?raw.categories.slice():[];
 for(const old of raw.products){
   const cat=String(old.cat||old.category||"Autres");
   if(!categories.includes(cat))categories.push(cat);
   const name=String(old.supplier||old.name||"Produit");
   const key=cat+"|"+name;
   if(!groups.has(key))groups.set(key,{id:uid(),name,category:cat,description:"",image:String(old.image||""),featured:!!old.featured,variants:[]});
   const g=groups.get(key);
   g.featured=g.featured||!!old.featured;
   g.variants.push({id:Number(old.id)||Math.floor(Math.random()*1e8),name:String(old.name||"Formule"),public:Number(old.public)||0,cse:Number(old.cse)||0,stock:Number(old.stock)||0,unlimited:!!old.unlimited,longDelay:!!old.longDelay});
 }
 return {categories,products:[...groups.values()],updated:Date.now()};
 }catch(e){return null}
}
function load(){
 try{
 const raw=JSON.parse(localStorage.getItem(KEY));
 if(raw&&Array.isArray(raw.categories)&&Array.isArray(raw.products))return raw;
 }catch(e){}
 const migrated=migrateLegacy();
 return migrated||clone(initial);
}
function flatten(data){
 const out=[];
 for(const p of data.products)for(const v of p.variants||[]){
 out.push({id:v.id,name:v.name,cat:p.category,category:p.category,supplier:p.name,productId:p.id,productName:p.name,image:p.image||"",description:p.description||"",public:Number(v.public)||0,cse:Number(v.cse)||0,stock:Number(v.stock)||0,unlimited:!!v.unlimited,longDelay:!!v.longDelay,featured:!!p.featured});
 }
 return out;
}
function save(data){
 const next=clone(data);next.updated=Date.now();
 const serialized=JSON.stringify(next);
 // localStorage can fail when images are very large: avoid overwriting legacy if failure.
 localStorage.setItem(KEY,serialized);
 localStorage.setItem(LEGACY,JSON.stringify({products:flatten(next),categories:next.categories,updated:next.updated}));
 window.dispatchEvent(new CustomEvent("cse:catalog-updated",{detail:{updated:next.updated}}));
 return next;
}
function esc(x){return String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function money(x){return Number(x||0).toLocaleString("fr-FR",{style:"currency",currency:"EUR"});}
function imageFromFile(file){
 return new Promise((resolve,reject)=>{
 if(!file||!file.type.startsWith("image/"))return reject(new Error("Sélectionnez une image valide."));
 if(file.size>8*1024*1024)return reject(new Error("Image trop volumineuse (8 Mo maximum)."));
 const reader=new FileReader();
 reader.onerror=()=>reject(new Error("Impossible de lire le fichier."));
 reader.onload=()=>{
   const im=new Image();im.onerror=()=>reject(new Error("L'image n'est pas valide."));
   im.onload=()=>{
    const scale=Math.min(1,500/Math.max(im.width,im.height));
    const canvas=document.createElement("canvas");
    canvas.width=Math.max(1,Math.round(im.width*scale));canvas.height=Math.max(1,Math.round(im.height*scale));
    const context=canvas.getContext("2d");
    context.fillStyle="white";context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(im,0,0,canvas.width,canvas.height);
    resolve(canvas.toDataURL("image/jpeg",0.74));
   };
   im.src=reader.result;
 };
 reader.readAsDataURL(file);
 });
}
window.CSECatalog={KEY,LEGACY,uid,load,save,flatten,esc,money,imageFromFile};
})();