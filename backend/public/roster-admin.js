"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const login=$("login"),workspace=$("workspace"),fileInput=$("file");
  let token="",csvText="",demoMode=false,previewOk=false;

  function message(value,error=false){
    $("message").textContent=value;
    $("message").className=error?"error":"ok";
  }

  async function api(path,method="GET",payload){
    const response=await fetch(path,{
      method,cache:"no-store",credentials:"omit",
      headers:{
        "X-CSE-Roster-Token":token,
        ...(payload?{"Content-Type":"application/json"}:{})
      },
      ...(payload?{body:JSON.stringify(payload)}:{})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===401)throw Error("Jeton incorrect.");
      if(response.status===429)throw Error("Trop de tentatives. Réessayez ultérieurement.");
      if(response.status===422)throw Error(result.message||"Fichier CSV non conforme.");
      if(response.status===409)throw Error("Ce lot n'est plus en attente d'activation.");
      throw Error("Erreur serveur ("+response.status+").");
    }
    return result;
  }

  function createCell(row,value){
    const td=document.createElement("td");
    td.textContent=String(value);
    row.append(td);
    return td;
  }

  function date(value){
    if(!value)return "—";
    const v=new Date(value);
    return Number.isNaN(v.valueOf())?"—":v.toLocaleString("fr-FR");
  }

  async function refreshImports(){
    const result=await api("/api/imports");
    if(!Array.isArray(result.imports))throw Error("Réponse serveur invalide.");
    const active=result.imports.find(x=>x.status==="active");
    $("activeImport").textContent=active
      ? "Lot "+active.fingerprint+" · "+active.rows+" lignes · activé le "+date(active.activatedAt)
      : "Aucun lot actif. Les nouvelles inscriptions doivent passer en validation manuelle.";
    const body=$("imports");
    body.replaceChildren();
    $("noImports").hidden=result.imports.length!==0;
    for(const item of result.imports){
      const tr=document.createElement("tr");
      createCell(tr,date(item.createdAt));
      createCell(tr,item.fingerprint);
      createCell(tr,item.rows);
      const statusCell=document.createElement("td");
      const status=document.createElement("span");
      status.className="pill "+(item.status==="active"?"active":item.status==="staged"?"staged":"");
      status.textContent=({active:"Actif",staged:"À activer",archived:"Archivé"})[item.status]||"Inconnu";
      statusCell.append(status);tr.append(statusCell);
      const action=document.createElement("td");
      if(item.status==="staged" || item.status==="archived"){
        const activate=document.createElement("button");
        activate.type="button";
        activate.textContent=item.status==="archived"?"Réactiver ce lot":"Activer ce lot";
        activate.addEventListener("click",async()=>{
          const confirmation=prompt(
            "L'activation archive le précédent CSV actif. Les personnes absentes "+
            "du nouveau CSV ne seront plus reconnues comme éligibles pour une nouvelle inscription. "+
            "Aucun compte existant ne sera automatiquement désactivé. "+
            (item.status==="archived"?
              " ATTENTION : vous réactivez un ancien CSV, vérifiez qu'il correspond bien au personnel actuellement éligible.":"")+
            " Pour confirmer, saisissez ACTIVER :"
          );
          if(confirmation!=="ACTIVER")return;
          activate.disabled=true;
          try{
            const result=await api("/api/imports/"+encodeURIComponent(item.id)+"/activate","POST",{confirm:true});
            if(result.status!=="active")throw Error("Activation non confirmée.");
            await refreshImports();
            message("Liste d'éligibilité activée. Précédent lot archivé.");
          }catch(error){
            message(error.message,true);
            activate.disabled=false;
          }
        });
        action.append(activate);
      }else{
        action.textContent="—";
      }
      tr.append(action);body.append(tr);
    }
  }

  function resetFile(){
    csvText="";
    demoMode=false;
    previewOk=false;
    fileInput.value="";
    $("previewResult").hidden=true;
    $("stage").disabled=true;
    $("demoWarning").hidden=true;
  }

  async function doPreview(){
    previewOk=false;
    $("stage").disabled=true;
    $("previewResult").hidden=true;
    try{
      if(!demoMode){
        const file=fileInput.files?.[0];
        if(!file)throw Error("Choisissez d'abord un fichier CSV.");
        if(file.size>2*1024*1024)throw Error("Le fichier dépasse la limite de 2 Mio.");
        csvText=await file.text();
      }
      if(!csvText)throw Error("Le fichier est vide.");
      $("preview").disabled=true;
      const data=await api("/api/preview","POST",{csv:csvText});
      $("stats").textContent=data.rows+" lignes · "+data.duplicateRows+
        " doublons supplémentaires · "+data.ambiguousGroups+
        " groupe(s) avec homonymes.";
      $("establishments").textContent="Répartition par établissement : "+
        data.establishments.map(x=>x.code+" ("+x.count+")").join(", ")+
        ". Aucune autre colonne n'est stockée.";
      $("duplicateWarning").hidden=data.ambiguousGroups===0;
      $("demoWarning").hidden=!demoMode;
      $("previewResult").hidden=false;
      previewOk=true;
      $("stage").disabled=demoMode;
      message(demoMode?"Aperçu fictif réussi. Aucun enregistrement effectué.":
        "Aperçu validé : le fichier peut être importé en attente.");
    }catch(error){
      message(error.message,true);
    }finally{
      $("preview").disabled=false;
    }
  }

  $("connect").addEventListener("click",async()=>{
    token=$("token").value.trim();
    $("token").value="";
    if(!/^[a-f0-9]{64}$/i.test(token)){
      token="";
      message("Le jeton doit comporter 64 caractères hexadécimaux.",true);
      return;
    }
    $("connect").disabled=true;
    try{
      await refreshImports();
      login.hidden=true;workspace.hidden=false;
      message("Accès au référentiel d'éligibilité ouvert.");
    }catch(error){
      token="";
      message(error.message,true);
    }finally{
      $("connect").disabled=false;
    }
  });

  $("lock").addEventListener("click",()=>{
    token="";resetFile();
    $("imports").replaceChildren();
    workspace.hidden=true;login.hidden=false;
    message("Panneau verrouillé.");
  });
  $("refresh").addEventListener("click",async()=>{
    try{await refreshImports();message("Liste actualisée.");}
    catch(error){message(error.message,true);}
  });
  fileInput.addEventListener("change",()=>{
    csvText="";demoMode=false;previewOk=false;
    $("previewResult").hidden=true;$("stage").disabled=true;
  });
  $("demo").addEventListener("click",()=>{
    resetFile();
    demoMode=true;
    csvText="nom;prenom;numero_etablissement\n"+
      "DUPONT;Alice;01\n"+
      "MARTIN;Jean;05\n"+
      "DUPONT;Alice;01\n";
    doPreview();
  });
  $("clear").addEventListener("click",()=>{
    resetFile();message("Sélection effacée de votre navigateur.");
  });
  $("preview").addEventListener("click",doPreview);

  $("stage").addEventListener("click",async()=>{
    if(!previewOk||demoMode||!csvText){
      message("Prévisualisez d'abord un fichier local valide.",true);
      return;
    }
    if(!confirm("Importer les données du fichier dans PostgreSQL avec le statut « à activer » ? "+
      "Pour le moment, utilisez uniquement des données entièrement fictives."))return;
    $("stage").disabled=true;
    try{
      const result=await api("/api/imports","POST",{csv:csvText});
      resetFile();
      await refreshImports();
      message(result.status==="already_exists"
        ?"Ce fichier est déjà présent. Statut : "+result.importStatus+"."
        :"Fichier importé en attente ("+result.rows+" lignes). L'activation reste manuelle.");
    }catch(error){
      message(error.message,true);
      $("stage").disabled=false;
    }
  });
})();
