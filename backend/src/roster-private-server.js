"use strict";

/**
 * Panneau CSV de test, uniquement via tunnel SSH.
 * VPS: 127.0.0.1:8090 -> conteneur:3102. Windows: 127.0.0.1:18090.
 * Jamais de reverse proxy public ou de stockage des fichiers CSV bruts.
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const {
  previewImport, stageImport, listImports, activateImport, RosterError
} = require("./roster-import");
const {
  isValidPanelToken, requestPath, isAllowedRosterHost, isAllowedRosterOrigin
} = require("./private-admin-auth");

const dbPassword=fs.readFileSync(
  process.env.DB_PASSWORD_FILE || "/run/secrets/roster_db_password","utf8"
).trim();
const token=fs.readFileSync(
  process.env.ROSTER_TOKEN_FILE || "/run/secrets/roster_panel_token","utf8"
).trim();
if(!/^[a-f0-9]{64}$/i.test(dbPassword) || !/^[a-f0-9]{64}$/i.test(token)){
  throw new Error("Secrets du panneau CSV invalides.");
}
const pool=new Pool({
  host:process.env.DB_HOST || "db",
  port:Number(process.env.DB_PORT || 5432),
  database:process.env.DB_NAME || "cse_educatif",
  user:process.env.DB_USER || "cse_roster_manager",
  password:dbPassword,
  max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:30000
});
const port=Number(process.env.PORT || 3102);
const publicDir=path.resolve(__dirname,"../public");
const resources=new Map([
  ["/",["roster-admin.html","text/html; charset=utf-8"]],
  ["/csv.css",["roster-admin.css","text/css; charset=utf-8"]],
  ["/csv.js",["roster-admin.js","text/javascript; charset=utf-8"]]
]);
const headers={
  "Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff",
  "X-Frame-Options":"DENY",
  "Referrer-Policy":"no-referrer",
  "Permissions-Policy":"camera=(),microphone=(),geolocation=()",
  "Content-Security-Policy":[
    "default-src 'none'","script-src 'self'","style-src 'self'",
    "connect-src 'self'","img-src 'self'","base-uri 'none'",
    "form-action 'none'","frame-ancestors 'none'"
  ].join("; ")
};
function send(res,status,body,type="application/json; charset=utf-8"){
  res.writeHead(status,{...headers,"Content-Type":type});
  res.end(type.startsWith("application/json")?JSON.stringify(body):body);
}

const failures=new Map();
function authorize(req){
  const ip=req.socket.remoteAddress || "unknown",now=Date.now();
  let state=failures.get(ip);
  if(!state||now>state.until)state={count:0,until:now+10*60_000};
  if(state.count>=20)return 429;
  if(isValidPanelToken(req.headers["x-cse-roster-token"],token)){
    failures.delete(ip);
    return 200;
  }
  state.count++;
  failures.set(ip,state);
  return 401;
}

async function readJson(req){
  if(req.headers["content-type"]?.split(";")[0]?.trim().toLowerCase()!=="application/json"){
    const err=new Error("Format JSON obligatoire");err.httpStatus=415;throw err;
  }
  let bytes=0;
  const chunks=[];
  for await(const chunk of req){
    bytes+=chunk.length;
    if(bytes>3*1024*1024){
      const err=new Error("Fichier trop volumineux");err.httpStatus=413;throw err;
    }
    chunks.push(chunk);
  }
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!value || typeof value!=="object" || Array.isArray(value)){
      throw new Error("Objet JSON attendu");
    }
    return value;
  }catch{
    const err=new Error("JSON non valide");err.httpStatus=400;throw err;
  }
}

const server=http.createServer(async(req,res)=>{
  const pathname=requestPath(req.url);
  if(req.method==="GET"&&pathname==="/healthz"){
    return send(res,200,{status:"alive"});
  }
  if(!isAllowedRosterHost(req.headers.host)){
    return send(res,403,{error:"forbidden_host"});
  }
  if(req.method==="GET"&&resources.has(pathname)){
    const [file,mime]=resources.get(pathname);
    try{return send(res,200,fs.readFileSync(path.join(publicDir,file)),mime);}
    catch{return send(res,503,{error:"unavailable"});}
  }

  const list=req.method==="GET"&&pathname==="/api/imports";
  const preview=req.method==="POST"&&pathname==="/api/preview";
  const stage=req.method==="POST"&&pathname==="/api/imports";
  const target=pathname.match(/^\/api\/imports\/([0-9a-f-]{36})\/activate$/i);
  const activate=req.method==="POST"&&target!=null;
  if(!list&&!preview&&!stage&&!activate){
    return send(res,404,{error:"not_found"});
  }
  const auth=authorize(req);
  if(auth!==200){
    return send(res,auth,{error:auth===429?"too_many_attempts":"unauthorized"});
  }
  if(!list&&!isAllowedRosterOrigin(req.headers.origin)){
    return send(res,403,{error:"invalid_origin"});
  }

  try{
    if(list)return send(res,200,{imports:await listImports(pool)});

    const body=await readJson(req);
    if(preview||stage){
      if(typeof body.csv!=="string"){
        return send(res,400,{error:"csv_text_required"});
      }
      const result=preview
        ? await previewImport(pool,body.csv)
        : await stageImport(pool,body.csv);
      return send(res,stage?201:200,result);
    }
    if(activate){
      if(body.confirm!==true)return send(res,400,{error:"confirmation_required"});
      const result=await activateImport(pool,target[1]);
      if(result.status==="not_activatable"){
        return send(res,409,{error:"not_activatable"});
      }
      return send(res,200,result);
    }
  }catch(error){
    if(error instanceof RosterError){
      return send(res,422,{error:"invalid_roster",message:error.message});
    }
    if(error.httpStatus){
      return send(res,error.httpStatus,{error:"invalid_request"});
    }
    if(error.code){
      console.error("CSV database operation:",error.code);
      return send(res,503,{error:"database_unavailable"});
    }
    console.error("CSV unexpected error:",error.name || "unknown");
    return send(res,500,{error:"internal_error"});
  }
});
server.headersTimeout=8000;
server.requestTimeout=20000;
server.listen(port,"0.0.0.0",()=>{
  console.log("Panneau CSV prive demarre, tunnel SSH uniquement.");
});
process.once("SIGTERM",()=>server.close(()=>pool.end()));
process.once("SIGINT",()=>server.close(()=>pool.end()));
