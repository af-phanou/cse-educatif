/* CSE Éducatif V26 — L'espace salarié affiche les PDF réellement importés puis attribués dans le navigateur. */
(function(){
"use strict";
if(!window.CSETicketStore || typeof ticketsPage!=="function")return;
const store=window.CSETicketStore;
const safe=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const arg=s=>JSON.stringify(String(s)).replace(/"/g,"&quot;");
function ticketsPageV26(){
 return header("Ma billetterie","Retrouvez vos PDF après validation du paiement ou autorisation de l'administrateur.")+
 '<div class="notice">Les billets ci-dessous proviennent de l’administration de démonstration, dans ce navigateur uniquement. Les PDF ne sont pas transmis par email.</div>'+
 '<div class="card"><h3>Mes billets disponibles</h3><div class="tablewrap"><table class="t26-employee-table"><thead>'+
 '<tr><th>Billet PDF</th><th>Date de commande</th><th>Facture</th><th>Fournisseur</th><th>Document</th></tr></thead>'+
 '<tbody id="t26EmployeeRows"><tr><td colspan="5">Chargement des billets...</td></tr></tbody></table></div>'+
 '<p class="small muted" id="t26EmployeeNote"></p></div>';
}
ticketsPage=ticketsPageV26;
async function showEmployeeTickets(){
 const target=document.getElementById("t26EmployeeRows");
 if(!target)return;
 try{
  const data=await store.list();
  if(typeof page==="undefined"||page!=="tickets"||typeof mode==="undefined"||mode!=="employee")return;
  const current=document.getElementById("t26EmployeeRows");if(!current)return;
  const key=String(profile.first+" "+profile.last).toLocaleLowerCase("fr").trim();
  const mine=data.filter(t=>t.status==="Vendu"&&String(t.ownerName||"").toLocaleLowerCase("fr").trim()===key);
  current.innerHTML=mine.map(t=>
   '<tr><td><b>'+safe(t.displayName)+'</b><small>'+safe(t.category||"Billetterie")+'</small></td>'+
   '<td>'+safe(t.orderDate||String(t.soldAt||"").slice(0,10))+'</td>'+
   '<td>'+safe(t.invoice||"Non renseignée")+'<small>'+safe(t.orderId||"")+'</small></td>'+
   '<td>'+safe(t.supplier)+'</td>'+
   '<td><button class="btn primary" onclick="cseEmployeeDownloadTicket('+arg(t.id)+')">↓ Télécharger le PDF</button></td></tr>'
  ).join("")||'<tr><td colspan="5" class="empty">Aucun billet PDF attribué à votre compte de démonstration. Depuis l’administration, attribuez un billet à '+safe(profile.first+" "+profile.last)+'.</td></tr>';
  const note=document.getElementById("t26EmployeeNote");
  if(note)note.textContent=mine.length+" billet(s) disponibles dans votre espace.";
 }catch(err){
  target.innerHTML='<tr><td colspan="5">Impossible de lire la billetterie locale : '+safe(err.message)+'</td></tr>';
 }
}
async function downloadEmployeeTicket(id){
 try{
  const record=await store.get(id);
  if(!record||record.status!=="Vendu"||String(record.ownerName||"").toLocaleLowerCase("fr")!==String(profile.first+" "+profile.last).toLocaleLowerCase("fr")){
   notify("Ce billet n'appartient pas au profil de démonstration.");return;
  }
  await store.downloadById(id);
 }catch(e){notify("Téléchargement impossible : "+e.message)}
}
window.cseEmployeeDownloadTicket=downloadEmployeeTicket;
const previousRender=render;
render=function(){
 previousRender();
 if(typeof mode!=="undefined"&&mode==="employee"&&typeof page!=="undefined"&&page==="tickets")showEmployeeTickets();
};
window.addEventListener("storage",event=>{
 if(event.key===store.SUPPLIER_KEY&&typeof mode!=="undefined"&&mode==="employee"&&page==="tickets")showEmployeeTickets();
});
})();