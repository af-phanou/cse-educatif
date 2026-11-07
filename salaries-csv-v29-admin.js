/* CSE Éducatif V29 — Interface d'import mensuel des salariés.
 * Entrée : CSV nom / prénom / numéro d'établissement.
 * Toutes les mises à jour passent par un aperçu et une confirmation.
 * La maquette ne téléverse pas le fichier vers un serveur.
 */
(function(){
"use strict";
if(!window.CSEEmployeeCSV||typeof employeesView!=="function")return;
const core=window.CSEEmployeeCSV,escHtml=typeof esc==="function"?esc:(s=>String(s??""));
const NOW=()=>new Date().toISOString();
let history=[],loaded=false;
let pending=null,importBusy=false;
function hydrate(){
 try{
  const raw=JSON.parse(localStorage.getItem(core.KEY));
  if(!raw||!Array.isArray(raw.employees)||!Array.isArray(raw.establishments))return;
  if(!raw.employees.every(x=>x&&typeof x.id!=="undefined"&&typeof x.first==="string"&&typeof x.last==="string"))return;
  employees.splice(0,employees.length,...raw.employees);
  const newEst=raw.establishments.filter(x=>typeof x==="string"&&x.trim());
  establishments.splice(0,establishments.length,...new Set(newEst));
  history=Array.isArray(raw.history)?raw.history.slice(0,24):[];
  loaded=true;
 }catch(e){console.warn("Récupération des données CSV des salariés",e)}
}
function persist(nextEmployees=employees,nextEstablishments=establishments,nextHistory=history){
 const snapshot={
  version:29,updatedAt:NOW(),
  employees:nextEmployees,establishments:nextEstablishments,history:nextHistory.slice(0,24)
 };
 localStorage.setItem(core.KEY,JSON.stringify(snapshot));
 return snapshot;
}
function periodDefault(){
 const d=new Date();
 return String(d.getFullYear())+"-"+String(d.getMonth()+1).padStart(2,"0");
}
function safeString(s){return escHtml(String(s??""))}
function offerSample(){
 const data="\uFEFFnom;prenom;numero_etablissement\r\n"+
   "Martin;Sophie;101\r\n"+
   "Bernard;Karim;102\r\n"+
   "Petit;Julie;103\r\n"+
   "Leroy;Claire;105\r\n"+
   "Durand;Camille;101\r\n"+
   "Moreau;Alex;106\r\n";
 const a=document.createElement("a");
 const url=URL.createObjectURL(new Blob([data],{type:"text/csv;charset=utf-8"}));
 a.href=url;a.download="exemple-salaries-mensuel.csv";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function loadFile(file){
 if(!file)return;
 if(!/\.csv$|\.txt$/i.test(file.name)){alert("Sélectionnez un fichier .csv (ou .txt délimité).");return}
 if(file.size>6*1024*1024){alert("Fichier trop volumineux : maximum 6 Mo.");return}
 importBusy=true;
 try{
  const binary=await file.arrayBuffer();
  let text,encoding="UTF-8";
  try{text=new TextDecoder("utf-8",{fatal:true}).decode(binary)}
  catch(e){
   text=new TextDecoder("windows-1252").decode(binary);
   encoding="Windows-1252";
  }
  const parsed=core.parse(text);
  pending={
   parsed,fileName:file.name,encoding,period:periodDefault(),
   decisions:{},deactivateMissing:false,
   importedAt:NOW(),fileSize:file.size
  };
  toast("CSV lu : "+parsed.records.length+" ligne(s), "+parsed.invalidCount+" erreur(s).");
  if(typeof route!=="undefined"&&route!=="employees")navigate("employees");
  else render();
 }catch(e){pending=null;alert("Impossible de lire le fichier CSV : "+e.message)}
 finally{importBusy=false}
}
function onFile(input){
 loadFile(input.files?.[0]);input.value="";
}
function drop(event){
 event.preventDefault();
 event.currentTarget.classList.remove("v29-hover");
 const files=event.dataTransfer?.files;
 if(files?.length!==1){alert("Déposez un seul fichier CSV mensuel à la fois.");return}
 loadFile(files[0]);
}
function decision(line,value){
 if(!pending)return;
 if(value)pending.decisions[String(line)]=value;
 else delete pending.decisions[String(line)];
 render();
}
function selectPeriod(value){
 if(!pending)return;
 pending.period=value;
 render();
}
function setAbsent(checked){
 if(!pending)return;
 pending.deactivateMissing=!!checked;
 render();
}
function cancelPreview(){pending=null;render()}
const labels={
 present:"Présent",reactivate:"Réactivation",new:"Nouveau",
 transfer:"Transfert confirmé",review:"À rapprocher",error:"Anomalie CSV"
};
function decisionSelect(action){
 if(action.action!=="review"&&!(action.action==="transfer"||action.action==="new") || !action.candidates?.length)return "";
 const v=pending.decisions[String(action.line)]||"";
 return '<select class="v29-decision" aria-label="Décision pour la ligne '+action.line+'" onchange="cseCsvDecision('+action.line+',this.value)">'+
 '<option value="">— Sélectionner une décision —</option>'+
 '<option value="new" '+(v==="new"?"selected":"")+'>Créer une fiche distincte</option>'+
 (action.candidates||[]).map(e=>
  '<option value="'+safeString(e.id)+'" '+(String(v)===String(e.id)?"selected":"")+'>'+
  'Rattacher à #'+safeString(e.id)+' · '+safeString(e.first+" "+e.last)+
  ' · '+safeString(core.establishment(e))+'</option>').join("")+
 '</select>';
}
function previewView(){
 if(!pending)return "";
 const outcome=core.reconcile(pending.parsed,employees,pending.decisions,{deactivateMissing:pending.deactivateMissing});
 const c=outcome.counters;
 const flags=[
  ["Nouveaux",c.new,"new"],["Déjà présents",c.present,"present"],
  ["Réactivations",c.reactivated,"reactivate"],["Transferts validés",c.transfer,"transfer"],
  ["À vérifier",c.review+c.errors,"review"],["Départs possibles",c.absent,"absent"]
 ];
 const month=history[0]?.period;
 const older=month&&pending.period<month;
 const applyDisabled=!outcome.canApply||older||importBusy;
 return '<section class="panel v29-panel v29-preview" id="v29Preview">'+
 '<div class="v29-preview-head"><div><h3>3. Prévisualisation du rapprochement</h3>'+
 '<p><b>'+safeString(pending.fileName)+'</b> · '+pending.parsed.records.length+' lignes · '+pending.encoding+
 ' · séparateur '+safeString(pending.parsed.delimiter==="\t"?"tabulation":pending.parsed.delimiter)+'</p></div>'+
 '<button class="btn" onclick="cseCsvCancel()">Annuler cet import</button></div>'+
 '<div class="v29-scope"><label>Import du mois <input type="month" id="v29Period" value="'+safeString(pending.period)+'" onchange="cseCsvMonth(this.value)"></label>'+
 '<label class="v29-absents"><input type="checkbox" '+(pending.deactivateMissing?"checked":"")+' onchange="cseCsvAbsents(this.checked)">'+
 '<span><b>Désactiver les absents du fichier</b><small>Concerne uniquement les salariés déjà suivis par les imports CSV précédents. À cocher uniquement si le fichier contient la liste complète du mois.</small></span></label></div>'+
 (older?'<div class="v29-error">Le mois '+safeString(pending.period)+' est antérieur au dernier import ('+safeString(month)+'). Choisissez le mois courant ou suivant.</div>':"")+
 pending.parsed.warnings.map(x=>'<div class="v29-warning">'+safeString(x)+'</div>').join("")+
 '<div class="v29-stats">'+flags.map(([name,n,kind])=>'<div class="v29-stat '+kind+'"><small>'+name+'</small><strong>'+n+'</strong></div>').join("")+'</div>'+
 (c.absent?'<div class="v29-warning">'+c.absent+' salarié(s) déjà suivi(s) par le CSV ne figurent plus dans cette liste. '+
 (pending.deactivateMissing?"Ils seront désactivés lors de la validation.":"Ils restent actifs tant que l'option de désactivation n'est pas cochée.")+'</div>':"")+
 '<div class="tablewrap"><table class="v29-preview-table"><thead><tr><th>Ligne</th><th>Nom</th><th>Prénom</th><th>N° établissement</th><th>Action prévue</th><th>Contrôle administratif</th></tr></thead>'+
 '<tbody>'+outcome.actions.slice(0,200).map(a=>'<tr class="v29-row-'+a.action+'"><td>'+a.line+'</td><td><b>'+safeString(a.last)+'</b></td>'+
 '<td>'+safeString(a.first)+'</td><td>'+safeString(a.number)+'</td>'+
 '<td><span class="v29-status '+a.action+'">'+(labels[a.action]||safeString(a.action))+'</span></td>'+
 '<td>'+((a.action==="review"||(a.candidates?.length&&pending.decisions[String(a.line)]))?decisionSelect(a):
 a.action==="error"?'<span class="v29-red">'+safeString(a.message)+'</span>':
 a.action==="transfer"?'<span class="v29-note">'+safeString(a.message)+'</span>':
 a.action==="reactivate"?'<span class="v29-note">Réactivation de la fiche #'+safeString(a.existingId)+'</span>':
 a.action==="present"?'<span class="v29-note">Fiche #'+safeString(a.existingId)+'</span>':"—")+'</td></tr>').join("")+'</tbody></table></div>'+
 (outcome.actions.length>200?'<p class="sub">Aperçu limité aux 200 premières lignes sur '+outcome.actions.length+' ; toutes les lignes sont contrôlées à la validation.</p>':"")+
 (outcome.blocked.length?'<p class="v29-error">'+outcome.blocked.length+
 ' ligne(s) bloquent l’import. Corrigez les anomalies dans le CSV ou choisissez manuellement un rapprochement pour les homonymes/transferts.</p>':"")+
 '<div class="v29-preview-footer"><div><strong>'+c.new+' création(s), '+c.reactivated+' réactivation(s), '+c.transfer+
 ' transfert(s), '+(pending.deactivateMissing?c.deactivated:0)+' désactivation(s).</strong>'+
 '<p>Les coordonnées personnelles, commandes, factures et billets déjà enregistrés seront conservés.</p></div>'+
 '<div class="v29-preview-buttons"><button class="btn" onclick="cseCsvDownloadReport()">↓ Rapport CSV</button>'+
 '<button class="btn primary" '+(applyDisabled?"disabled":"")+' onclick="cseCsvApply()">✓ Valider l’import mensuel</button></div></div>'+
 '</section>';
}
function importPanel(){
 const last=history[0];
 return '<section class="panel v29-panel" id="v29Importer">'+
 '<div class="v29-header"><div><div class="v29-kicker">FICHIER RH MENSUEL</div><h3>Importer les salariés depuis un CSV</h3>'+
 '<p>Rapprochement par <b>nom + prénom + numéro d’établissement</b>, sans suppression de l’historique.</p></div>'+
 '<span class="v29-pill">Local · démonstration</span></div>'+
 '<div class="v29-sensitive"><b>⚠ Fichier RH confidentiel :</b> utilisez uniquement des données fictives dans cette maquette publique. Le véritable import mensuel sera hébergé dans un espace administrateur sécurisé sur OVH.</div>'+
 '<div class="v29-steps"><span><b>1</b> Importer le fichier</span><span><b>2</b> Contrôler les écarts</span><span><b>3</b> Valider les modifications</span></div>'+
 '<div class="v29-drop" ondragover="event.preventDefault();this.classList.add(\'v29-hover\')" ondragleave="this.classList.remove(\'v29-hover\')" ondrop="cseCsvDrop(event)">'+
 '<div class="v29-dropicon">⇧</div><div><strong>Déposez votre fichier salariés du mois</strong>'+
 '<p>CSV UTF-8 ou Windows-1252 · séparateur ; , ou tabulation · jusqu’à 20 000 lignes</p></div>'+
 '<label class="btn primary">＋ Choisir un fichier CSV<input hidden type="file" accept=".csv,.txt,text/csv,text/plain" onchange="cseCsvUpload(this)"></label>'+
 '</div>'+
 '<div class="v29-instructions"><div><b>Colonnes attendues</b><code>nom;prenom;numero_etablissement</code>'+
 '<small>Ordre des colonnes libre si les en-têtes sont présents. Un numéro tel que 101 correspond à l’établissement 101.</small></div>'+
 '<button class="btn" onclick="cseCsvSample()">↓ Télécharger un CSV d’exemple</button></div>'+
 (last?'<div class="v29-last"><span>Dernier import : <b>'+safeString(last.period)+'</b> — '+safeString(last.fileName)+
 '</span><span>'+last.imported+' ligne(s) · '+last.new+' création(s) · '+last.deactivated+' départ(s)</span></div>':
 '<div class="v29-last">Aucun import mensuel appliqué pour le moment. Les salariés de démonstration restent présents.</div>')+
 '</section>'+previewView()+
 '<section class="panel v29-panel v29-history"><h3>Historique des imports</h3>'+
 (history.length?'<div class="tablewrap"><table><thead><tr><th>Date</th><th>Mois RH</th><th>Fichier</th><th>Salariés</th><th>Créations</th><th>Réactivations</th><th>Transferts</th><th>Désactivations</th></tr></thead>'+
 '<tbody>'+history.slice(0,12).map(x=>'<tr><td>'+safeString(x.at?.slice(0,10))+'</td><td>'+safeString(x.period)+'</td><td>'+safeString(x.fileName)+'</td>'+
 '<td>'+x.imported+'</td><td>'+x.new+'</td><td>'+x.reactivated+'</td><td>'+x.transfer+'</td><td>'+x.deactivated+'</td></tr>').join("")+'</tbody></table></div>':
 '<p class="sub">Les dates, volumes et résultats des imports seront historisés ici.</p>')+
 '<p class="v29-privacy">Aucun CSV brut n’est téléversé sur un serveur ni conservé dans l’historique. La maquette stocke les fiches mises à jour dans ce navigateur uniquement.</p></section>';
}
function downloadReport(){
 if(!pending)return;
 const report=core.reconcile(pending.parsed,employees,pending.decisions,{deactivateMissing:pending.deactivateMissing});
 const csvRows=[["ligne","nom","prenom","numero_etablissement","action","details"],
  ...report.actions.map(a=>[a.line,a.last,a.first,a.number,a.action,a.message||""]),
  ...report.willDeactivate.map(e=>["",e.last,e.first,core.establishment(e),"desactivation","Absent du CSV mensuel"])];
 const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
 const text="\uFEFF"+csvRows.map(row=>row.map(q).join(";")).join("\r\n");
 const href=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));
 const a=document.createElement("a");a.href=href;
 a.download="controle-salaries-"+pending.period+".csv";
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(href),2000);
}
function apply(){
 if(!pending||importBusy)return;
 const report=core.reconcile(pending.parsed,employees,pending.decisions,{deactivateMissing:pending.deactivateMissing});
 if(!report.canApply){alert("Import bloqué : corrigez les anomalies ou validez les rapprochements.");return}
 if(history[0]?.period&&pending.period<history[0].period){alert("Mois antérieur au dernier import.");return}
 const c=report.counters;
 const message="Appliquer le fichier RH du mois "+pending.period+" ?\n"+
  c.new+" nouveau(x) salarié(s)\n"+c.reactivated+" réactivation(s)\n"+
  c.transfer+" transfert(s) confirmé(s)\n"+c.deactivated+" désactivation(s)\n\n"+
  "Les factures, commandes, billets et coordonnées existantes seront préservés.\n"+
  "Cette opération modifie les fiches locales du navigateur.";
 if(!confirm(message))return;
 importBusy=true;
 try{
  const revised=core.applyReconciliation(pending.parsed,report,employees,establishments,pending.period);
  const entry={
   period:pending.period,at:NOW(),fileName:pending.fileName,
   imported:pending.parsed.records.length,
   new:c.new,present:c.present,reactivated:c.reactivated,transfer:c.transfer,
   deactivated:c.deactivated,establishments:[...new Set(pending.parsed.records.map(r=>r.number))]
  };
  const newHistory=[entry,...history].slice(0,24);
  persist(revised.employees,revised.establishments,newHistory);
  employees.splice(0,employees.length,...revised.employees);
  establishments.splice(0,establishments.length,...revised.establishments);
  history=newHistory;
  pending=null;
  render();
  toast("Import RH validé : "+entry.imported+" lignes, "+entry.new+" créations, "+entry.deactivated+" désactivations.");
 }catch(e){alert("Import non appliqué : "+e.message)}
 finally{importBusy=false}
}
window.cseCsvSample=offerSample;
window.cseCsvUpload=onFile;
window.cseCsvDrop=drop;
window.cseCsvDecision=decision;
window.cseCsvMonth=selectPeriod;
window.cseCsvAbsents=setAbsent;
window.cseCsvCancel=cancelPreview;
window.cseCsvApply=apply;
window.cseCsvDownloadReport=downloadReport;
hydrate();
/* Accès direct dans le menu pour retrouver facilement l'injection mensuelle. */
if(typeof navRender==="function"){
 const previousCsvNav=navRender;
 navRender=function(){
  previousCsvNav();
  const nav=document.getElementById("nav");
  if(!nav||document.getElementById("v29CsvNavButton"))return;
  const btn=document.createElement("button");
  btn.type="button";btn.id="v29CsvNavButton";
  btn.textContent="⇧ Import CSV salariés";
  btn.title="Ouvrir l'import mensuel du fichier RH";
  btn.onclick=()=>{
   navigate("employees");
   document.getElementById("v29Importer")?.scrollIntoView({behavior:"smooth",block:"start"});
  };
  const employeeLink=[...nav.querySelectorAll("button")].find(x=>x.textContent.includes("Salariés"));
  if(employeeLink)employeeLink.insertAdjacentElement("afterend",btn);
  else nav.appendChild(btn);
 };
}
const originalViewV29=employeesView;
employeesView=function(){return importPanel()+originalViewV29()};
const originalSaveV29=saveEmployee;
saveEmployee=function(id){
 originalSaveV29(id);
 const person=employees.find(e=>String(e.id)===String(id));
 if(person?.csvManaged)person.estNumber=core.establishment({est:person.est});
 try{persist()}catch(e){toast("La fiche est modifiée mais la sauvegarde locale a échoué : "+e.message)}
};
const originalModalV29=employeeModal;
employeeModal=function(id){
 originalModalV29(id);
 const e=employees.find(x=>String(x.id)===String(id));
 if(!e||!e.csvManaged)return;
 const container=document.querySelector(".modal");
 if(!container)return;
 const node=document.createElement("p");
 node.className="v29-managed";
 node.innerHTML="Fiche rapprochée par CSV RH · établissement <b>"+safeString(core.establishment(e))+
 "</b> · vu dans l'import <b>"+safeString(e.csvLastSeen||"—")+"</b>.";
 container.appendChild(node);
};
window.addEventListener("storage",event=>{
 if(event.key!==core.KEY)return;
 hydrate();
 if(typeof route!=="undefined"&&["employees","dashboard"].includes(route))render();
});
if(typeof route!=="undefined"&&["employees","dashboard"].includes(route))render();
})();