const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async function(context,req){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 try{
  const connection=process.env.MASTER_STORAGE_CONNECTION_STRING;if(!connection){context.res={status:503,headers,body:{error:'Shared master storage is not configured.'}};return;}
  const container=BlobServiceClient.fromConnectionString(connection).getContainerClient('esd-dts-master');
  const blob=container.getBlockBlobClient('master.json');
  if(req.method==='GET'){try{const result=await blob.downloadToBuffer();context.res={status:200,headers,body:JSON.parse(result.toString())};}catch(e){if(e.statusCode!==404)throw e;const seed=require('./master-seed.json');await container.createIfNotExists();try{await blob.uploadData(Buffer.from(JSON.stringify(seed)),{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'application/json'}});}catch(seedError){if(seedError.statusCode!==409&&seedError.statusCode!==412)throw seedError;}const current=await blob.downloadToBuffer();context.res={status:200,headers,body:JSON.parse(current.toString())};}return;}
  if(!require('./upload-auth.cjs')(req)){context.res={status:401,headers,body:{error:'Enter the correct master upload password.'}};return;}
  const rows=req.body?.rows;if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Supply between 1 and 100 master budget rows.');
  const seen=new Set();const clean=rows.map(r=>{if(!['ASA(FM&C)','G-8'].includes(r.agency)||typeof r.group!=='string'||r.group.length>80)throw Error('Invalid agency or group.');const key=r.agency+'|'+r.group;if(seen.has(key))throw Error('Duplicate master group.');seen.add(key);for(const k of ['budget','received','baselineObligated'])if(!Number.isSafeInteger(r[k])||r[k]<0)throw Error('Invalid budget amount.');return {agency:r.agency,group:r.group,budget:r.budget,received:r.received,baselineObligated:r.baselineObligated};});
  const value={rows:clean,updatedAt:new Date().toISOString()};if(req.body.sourceBase64){const source=Buffer.from(req.body.sourceBase64,'base64');if(source.length>10000000)throw Error('Master file exceeds 10 MB.');await container.createIfNotExists();await container.getBlockBlobClient('master-source.xlsx').uploadData(source,{blobHTTPHeaders:{blobContentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});}await container.createIfNotExists();await blob.uploadData(Buffer.from(JSON.stringify(value)),{blobHTTPHeaders:{blobContentType:'application/json'}});context.res={status:200,headers,body:value};
 }catch(e){context.res={status:e.statusCode?503:400,headers,body:{error:e.statusCode?'Shared storage is temporarily unavailable.':e.message}};}
};
