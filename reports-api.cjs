const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async(context,req)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const respond=(status,body)=>context.res={status,headers,body};
 try{
  if(!process.env.MASTER_STORAGE_CONNECTION_STRING)return respond(503,{error:'Shared storage is not configured.'});
  const container=BlobServiceClient.fromConnectionString(process.env.MASTER_STORAGE_CONNECTION_STRING).getContainerClient('esd-dts-master');
  const fy=String(req.query?.fy||'FY26').toUpperCase();if(!/^FY(2[5-9]|30)$/.test(fy))return respond(400,{error:'Invalid fiscal year.'});
  const prefix='reports/'+fy+'/';
  if(req.method==='GET'){
   const reports={};try{if(fy==='FY26'){for await(const item of container.listBlobsFlat({prefix:'reports/'})){if(item.name.slice('reports/'.length).includes('/'))continue;const saved=JSON.parse((await container.getBlockBlobClient(item.name).downloadToBuffer()).toString());if(saved.removed)continue;const {sourceText,...report}=saved;reports[saved.agency+'|'+saved.group+'|'+saved.kind]=report;}}for await(const item of container.listBlobsFlat({prefix})){const saved=JSON.parse((await container.getBlockBlobClient(item.name).downloadToBuffer()).toString());const key=saved.agency+'|'+saved.group+'|'+saved.kind;if(saved.removed){delete reports[key];continue;}const {sourceText,...report}=saved;reports[key]=report;}}catch(e){if(e.statusCode!==404)throw e;}
   return respond(200,{reports,fiscalYear:fy});
  }
  if(!require('./upload-auth.cjs')(req))return respond(401,{error:'Enter the correct master upload password.'});
  const {agencies,parseReport}=await import('./data.mjs');
  const {agency,group,kind,text,filename}=req.body||{};
  if(!agencies[agency]||typeof group!=='string'||!group.trim()||group.length>80||!['travel','voucher'].includes(kind))return respond(400,{error:'Invalid agency, group or report type.'});
  if(req.method==='DELETE'){
   if(kind!=='voucher')return respond(400,{error:'Only unsubmitted-voucher files can be removed.'});
   const name=prefix+Buffer.from(agency+'|'+group+'|'+kind).toString('hex')+'.json';const blob=container.getBlockBlobClient(name);
   let saved={agency,group,kind};try{saved=JSON.parse((await blob.downloadToBuffer()).toString());}catch(e){if(e.statusCode!==404)throw e;}await container.createIfNotExists();await blob.uploadData(Buffer.from(JSON.stringify({...saved,removed:true,removedAt:new Date().toISOString(),fiscalYear:fy})),{blobHTTPHeaders:{blobContentType:'application/json'}});
   return respond(200,{removed:true});
  }
  if(typeof text!=='string'||!text.length||Buffer.byteLength(text)>10000000)return respond(400,{error:'Upload a CSV file up to 10 MB.'});
  if(typeof filename!=='string'||filename.length>250)return respond(400,{error:'Invalid filename.'});
  let mapping;try{mapping=JSON.parse((await container.getBlockBlobClient('loa-reference-'+fy+'.json').downloadToBuffer()).toString()).mapping;}catch(e){if(e.statusCode!==404)throw e;if(fy==='FY26'){try{mapping=JSON.parse((await container.getBlockBlobClient('loa-reference.json').downloadToBuffer()).toString()).mapping;}catch(legacyError){if(legacyError.statusCode!==404)throw legacyError;}}}const parsed=parseReport(text,kind,agency,group,mapping);const saved={...parsed,agency,group,kind,filename,updatedAt:new Date().toISOString(),sourceText:text,fiscalYear:fy};
  await container.createIfNotExists();const name=prefix+Buffer.from(agency+'|'+group+'|'+kind).toString('hex')+'.json';
  await container.getBlockBlobClient(name).uploadData(Buffer.from(JSON.stringify(saved)),{blobHTTPHeaders:{blobContentType:'application/json'}});
  const {sourceText,...report}=saved;return respond(200,{report});
 }catch(e){return respond(e.statusCode?503:400,{error:e.statusCode?'Shared storage is temporarily unavailable.':e.message});}
};
