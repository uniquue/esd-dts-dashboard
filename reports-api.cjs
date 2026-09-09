const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async(context,req)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const respond=(status,body)=>context.res={status,headers,body};
 try{
  if(!process.env.MASTER_STORAGE_CONNECTION_STRING)return respond(503,{error:'Shared storage is not configured.'});
  const container=BlobServiceClient.fromConnectionString(process.env.MASTER_STORAGE_CONNECTION_STRING).getContainerClient('esd-dts-master');
  if(req.method==='GET'){
   const reports={};try{for await(const item of container.listBlobsFlat({prefix:'reports/'})){const saved=JSON.parse((await container.getBlockBlobClient(item.name).downloadToBuffer()).toString());const {sourceText,...report}=saved;reports[saved.agency+'|'+saved.group+'|'+saved.kind]=report;}}catch(e){if(e.statusCode!==404)throw e;}
   return respond(200,{reports});
  }
  if(!require('./upload-auth.cjs')(req))return respond(401,{error:'Enter the correct master upload password.'});
  const {agencies,parseReport}=await import('./data.mjs');
  const {agency,group,kind,text,filename}=req.body||{};
  if(!agencies[agency]?.includes(group)||!['travel','voucher'].includes(kind))return respond(400,{error:'Invalid agency, group or report type.'});
  if(typeof text!=='string'||!text.length||Buffer.byteLength(text)>10000000)return respond(400,{error:'Upload a CSV file up to 10 MB.'});
  if(typeof filename!=='string'||filename.length>250)return respond(400,{error:'Invalid filename.'});
  const parsed=parseReport(text,kind,agency,group);const saved={...parsed,agency,group,kind,filename,updatedAt:new Date().toISOString(),sourceText:text};
  await container.createIfNotExists();const name='reports/'+Buffer.from(agency+'|'+group+'|'+kind).toString('hex')+'.json';
  await container.getBlockBlobClient(name).uploadData(Buffer.from(JSON.stringify(saved)),{blobHTTPHeaders:{blobContentType:'application/json'}});
  const {sourceText,...report}=saved;return respond(200,{report});
 }catch(e){return respond(e.statusCode?503:400,{error:e.statusCode?'Shared storage is temporarily unavailable.':e.message});}
};
