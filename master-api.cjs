const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async function(context,req){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 try{
  const connection=process.env.MASTER_STORAGE_CONNECTION_STRING;if(!connection){context.res={status:503,headers,body:{error:'Shared master storage is not configured.'}};return;}
  const container=BlobServiceClient.fromConnectionString(connection).getContainerClient('esd-dts-master');
  const blob=container.getBlockBlobClient('master.json');
  if(req.method==='GET'){try{const result=await blob.downloadToBuffer();context.res={status:200,headers,body:JSON.parse(result.toString())};}catch(e){if(e.statusCode!==404)throw e;context.res={status:200,headers,body:{rows:[],updatedAt:null}};}return;}
  let principal;try{principal=JSON.parse(Buffer.from(req.headers['x-ms-client-principal']||'','base64').toString());}catch{}
  if(!principal?.userRoles?.includes('authenticated')){context.res={status:401,headers,body:{error:'Sign in to replace the master.'}};return;}
  const rows=req.body?.rows;if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Supply between 1 and 100 master budget rows.');
  const seen=new Set();const clean=rows.map(r=>{if(!['ASA(FM&C)','G-8'].includes(r.agency)||typeof r.group!=='string'||r.group.length>80)throw Error('Invalid agency or group.');const key=r.agency+'|'+r.group;if(seen.has(key))throw Error('Duplicate master group.');seen.add(key);for(const k of ['budget','received','baselineObligated'])if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error('Invalid budget amount.');return {agency:r.agency,group:r.group,budget:r.budget,received:r.received,baselineObligated:r.baselineObligated};});
  const value={rows:clean,updatedAt:new Date().toISOString()};await container.createIfNotExists();await blob.uploadData(Buffer.from(JSON.stringify(value)),{blobHTTPHeaders:{blobContentType:'application/json'}});context.res={status:200,headers,body:value};
 }catch(e){context.res={status:e.statusCode?503:400,headers,body:{error:e.statusCode?'Shared storage is temporarily unavailable.':e.message}};}
};
