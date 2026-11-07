/* CSE Educatif V29 — analyse CSV RH mensuelle.
 * Fonctions de lecture / reconciliation pures, sans modifications automatiques.
 * Les noms et prenoms ne sont pas des identifiants uniques : transferts et homonymes
 * demandent toujours une confirmation manuelle.
 */
(function(){
"use strict";
const KEY="cse_v29_salaries_rh";
const norm=s=>String(s??"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"")
 .replace(/[’‘']/g," ").replace(/[-‐‑–—]/g," ").replace(/\s+/g," ").trim().toLocaleUpperCase("fr");
const clean=s=>String(s??"").replace(/^\uFEFF/,"").trim().replace(/\s+/g," ");
const code=s=>clean(s).replace(/\s+/g,"");
const establishment=e=>{
 const c=code(e?.estNumber||e?.numeroEtablissement||e?.numEtablissement||"");
 if(c)return c;
 const m=String(e?.est||"").match(/(?:[Nn][°ºo]?\s*)?(\d{1,10})\s*$/);
 return m?m[1]:"";
};
const nameKey=(last,first)=>norm(last)+"|"+norm(first);
const recordKey=r=>nameKey(r.last,r.first)+"|"+code(r.number);
function delimCounts(line){
 const counts={";":0,",":0,"\t":0};
 let inQuotes=false;
 for(let i=0;i<line.length;i++){
  if(line[i]==='"'){if(inQuotes&&line[i+1]==='"')i++;else inQuotes=!inQuotes}
  else if(!inQuotes&&Object.prototype.hasOwnProperty.call(counts,line[i]))counts[line[i]]++;
 }
 return counts;
}
function detectDelimiter(text){
 const line=String(text).split(/\r?\n/).find(x=>x.trim())||"";
 const count=delimCounts(line);
 return Object.keys(count).sort((a,b)=>count[b]-count[a])[0]||";";
}
function splitCSV(text,delimiter){
 const value=String(text??"").replace(/^\uFEFF/,"");
 const all=[];let line=1,recordLine=1,record=[],cell="",inQuotes=false;
 for(let i=0;i<value.length;i++){
  const char=value[i],next=value[i+1];
  if(char==='"'){if(inQuotes&&next==='"'){cell+='"';i++}else inQuotes=!inQuotes;continue}
  if(!inQuotes&&char===delimiter){record.push(cell);cell="";continue}
  if(!inQuotes&&(char==='\r'||char==='\n')){
   if(char==='\r'&&next==='\n')i++;
   record.push(cell);
   if(record.some(c=>c.trim()))all.push({line:recordLine,values:record});
   record=[];cell="";line++;recordLine=line;continue;
  }
  if(char==='\n')line++;
  cell+=char;
 }
 if(inQuotes)throw new Error("Guillemet non refermé dans le CSV (ligne "+recordLine+").");
 record.push(cell);
 if(record.some(c=>c.trim()))all.push({line:recordLine,values:record});
 return all;
}
function normalizeHeader(text){
 return norm(text).replace(/[^A-Z0-9]+/g,"");
}
function headers(values){
 const normalized=values.map(normalizeHeader);
 const getIndex=(choices)=>normalized.findIndex(x=>choices.includes(x));
 const last=getIndex(["NOM","NOMDEFAMILLE","NOMSALARIE","LASTNAME","SURNAME"]);
 const first=getIndex(["PRENOM","PRENOMS","PRENOMSALARIE","FIRSTNAME","GIVENNAME"]);
 const number=getIndex(["NUMEROETABLISSEMENT","NUMERODELETABLISSEMENT",
   "NUMETABLISSEMENT","NUMETAB","NUMERODETABLISSEMENT","NUMEROETAB",
   "CODEETABLISSEMENT","CODEETAB","ETABLISSEMENT","ETAB","NDETABLISSEMENT",
   "NOETABLISSEMENT","NOMETABLISSEMENT","NUMERODETAB","CODEETS"]);
 if(last>=0&&first>=0&&number>=0&&new Set([last,first,number]).size===3)return {last,first,number};
 return null;
}
function parse(text){
 const raw=String(text??"").replace(/^\uFEFF/,"");
 if(!raw.trim())throw new Error("Le fichier CSV est vide.");
 const delimiter=detectDelimiter(raw),lines=splitCSV(raw,delimiter);
 if(!lines.length)throw new Error("Aucune ligne trouvée.");
 if(lines.length>20001)throw new Error("Fichier trop volumineux : maximum 20 000 lignes.");
 let map=headers(lines[0].values),withHeader=!!map,firstIndex=1,warnings=[];
 if(!map){
  const cols=lines[0].values.length;
  if(cols!==3)throw new Error("En-têtes introuvables. Utilisez nom;prenom;numero_etablissement (ou exactement trois colonnes sans en-tête).");
  map={last:0,first:1,number:2};firstIndex=0;
  warnings.push("En-tête non reconnu : ordre présumé nom, prénom, numéro d'établissement.");
 }
 const result=[];
 for(let i=firstIndex;i<lines.length;i++){
  const raw=lines[i],v=raw.values;
  const last=clean(v[map.last]),first=clean(v[map.first]),number=code(v[map.number]);
  const issues=[];
  if(!last)issues.push("Nom manquant");
  if(!first)issues.push("Prénom manquant");
  if(!number)issues.push("Numéro d'établissement manquant");
  if(number&&!/^\d{1,10}$/.test(number))issues.push("Numéro d'établissement invalide : chiffres uniquement");
  if(last.length>120||first.length>120)issues.push("Nom ou prénom trop long");
  const rec={line:raw.line,first,last,number,valid:!issues.length,issues,
    rawColumns:v.length};
  result.push(rec);
 }
 if(!result.length)throw new Error("Le CSV ne contient aucun salarié.");
 const seen=new Map();
 for(const r of result){
  if(!r.valid)continue;
  const key=recordKey(r);
  if(seen.has(key)){r.valid=false;r.issues.push("Doublon de la ligne "+seen.get(key));}
  else seen.set(key,r.line);
 }
 const byPerson=new Map();
 for(const r of result.filter(r=>r.valid)){
  const k=nameKey(r.last,r.first);const nums=byPerson.get(k)||new Set();
  nums.add(r.number);byPerson.set(k,nums);
 }
 for(const r of result){
  if(r.valid&&(byPerson.get(nameKey(r.last,r.first))?.size||0)>1){
   r.valid=false;r.issues.push("Même nom et prénom sur plusieurs établissements dans le fichier");
  }
 }
 return {delimiter,hasHeader:withHeader,warnings,records:result,
  validCount:result.filter(x=>x.valid).length,invalidCount:result.filter(x=>!x.valid).length};
}
function reconcile(parsed,employees,decisions={},options={}){
 const input=parsed?.records||[];
 const current=Array.isArray(employees)?employees:[];
 const entries=current.map(e=>({...e,number:establishment(e)}));
 const exact=new Map(),byPerson=new Map();
 for(const e of entries){
  const full=nameKey(e.last,e.first),key=full+"|"+e.number;
  exact.set(key,(exact.get(key)||[]).concat(e));
  byPerson.set(full,(byPerson.get(full)||[]).concat(e));
 }
 const actions=[],matched=new Set(),blocked=[];
 for(const r of input){
  if(!r.valid){
   const action={...r,action:"error",message:r.issues.join(" ; "),candidates:[]};
   actions.push(action);blocked.push(action);continue;
  }
  const candidates=exact.get(recordKey(r))||[];
  let status="",id=null,message="",possibles=[];
  if(candidates.length===1){id=candidates[0].id;status=candidates[0].active?"present":"reactivate"}
  else if(candidates.length>1){status="review";possibles=candidates;message="Plusieurs fiches identiques existantes"}
  else{
   possibles=byPerson.get(nameKey(r.last,r.first))||[];
   if(possibles.length){status="review";message=possibles.length===1?
    "Établissement différent : transfert ou homonyme à confirmer":
    "Homonymie : sélectionnez la fiche concernée ou créez une nouvelle identité"}
   else status="new";
  }
  if(status==="review"){
   const chosen=String(decisions[String(r.line)]||"");
   if(chosen==="new"){status="new";message="Création distincte validée par l'administrateur"}
   else if(chosen&&possibles.some(e=>String(e.id)===chosen)){
    id=possibles.find(e=>String(e.id)===chosen).id;
    status="transfer";message="Rapprochement manuel confirmé";
   }
   else{blocked.push({...r,action:"review",message,candidates:possibles})}
  }
  if(id!==null){
   if(matched.has(String(id))){status="error";message="La même fiche salarié serait liée à plusieurs lignes";}
   else matched.add(String(id));
  }
  if(status==="error")blocked.push({...r,action:status,message,candidates:possibles});
  actions.push({...r,action:status,existingId:id,message,candidates:possibles});
 }
 const includeAbsent=!!options.deactivateMissing;
 const absent=entries.filter(e=>e.active&&e.csvManaged&&!matched.has(String(e.id)));
 const result={
  actions,blocked,absent,willDeactivate:includeAbsent?absent:[],
  counters:{
   lines:input.length,valid:input.length-input.filter(r=>!r.valid).length,
   new:actions.filter(x=>x.action==="new").length,
   present:actions.filter(x=>x.action==="present").length,
   reactivated:actions.filter(x=>x.action==="reactivate").length,
   transfer:actions.filter(x=>x.action==="transfer").length,
   review:actions.filter(x=>x.action==="review").length,
   errors:actions.filter(x=>x.action==="error").length,
   absent:absent.length,
   deactivated:includeAbsent?absent.length:0
  },
  canApply:!!input.length&&!blocked.length&&!actions.some(a=>a.action==="review"||a.action==="error")
 };
 return result;
}
function applyReconciliation(parsed,preview,employees,establishments,period,opts={}){
 if(!preview?.canApply)throw new Error("Certaines lignes doivent encore être corrigées ou rapprochées.");
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period)))throw new Error("Mois du fichier invalide.");
 const next=JSON.parse(JSON.stringify(employees));
 const establishmentsNext=[...establishments];
 const today=new Date().toISOString(),max=Math.max(0,...next.map(x=>Number(x.id)||0));
 let newId=max;
 for(const act of preview.actions){
  if(act.action==="error"||act.action==="review")throw new Error("Import incomplet.");
  const est="Établissement "+act.number;
  if(!establishmentsNext.includes(est))establishmentsNext.push(est);
  if(act.action==="new"){
   next.push({id:++newId,first:act.first,last:act.last,est,estNumber:act.number,
     email:"",phone:"",address:"",alias:"",active:true,csvManaged:true,
     csvLastSeen:period,csvImportedAt:today});
  }else{
   const person=next.find(x=>String(x.id)===String(act.existingId));
   if(!person)throw new Error("Fiche salariée introuvable pendant l'import : "+act.existingId);
   Object.assign(person,{first:act.first,last:act.last,est,estNumber:act.number,
     active:true,csvManaged:true,csvLastSeen:period,csvImportedAt:today});
   // Ne jamais effacer email, téléphone, commandes ni historique de factures.
  }
 }
 for(const old of preview.willDeactivate){
  const target=next.find(e=>String(e.id)===String(old.id));
  if(target&&target.active){
   target.active=false;target.csvInactiveAt=today;target.csvInactivePeriod=period;
  }
 }
 return {employees:next,establishments:establishmentsNext};
}
window.CSEEmployeeCSV={KEY,norm,clean,code,establishment,nameKey,recordKey,
 detectDelimiter,splitCSV,parse,reconcile,applyReconciliation};
})();