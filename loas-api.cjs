const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async(context,req)=>{
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};const reply=(status,body)=>context.res={status,headers,body};
 try{
  const container=BlobServiceClient.fromConnectionString(process.env.MASTER_STORAGE_CONNECTION_STRING).getContainerClient('esd-dts-master');const blob=container.getBlockBlobClient('loa-reference.json');
  if(req.method==='GET'){try{return reply(200,JSON.parse((await blob.downloadToBuffer()).toString()));}catch(e){if(e.statusCode!==404)throw e;return reply(200,{mapping:(await import('./loa-map.mjs')).default,updatedAt:null});}}
  if(!require('./upload-auth.cjs')(req))return reply(401,{error:'Enter the correct master upload password.'});
  const {mapping,sourceBase64}=req.body||{};if(!mapping||typeof mapping!=='object'||Array.isArray(mapping))throw Error('Invalid LOA mapping.');
  const {agencies,canonical}=await import('./data.mjs');const groups=Object.values(agencies).flat();const clean={};const entries=Object.entries(mapping);if(!entries.length||entries.length>2000)throw Error('Supply between 1 and 2000 LOA codes.');
  for(const [code,group] of entries){const key=code.trim().toUpperCase();if(!/^[A-Z0-9_-]{1,80}$/.test(key)||!groups.includes(canonical(group)))throw Error('Invalid code or Directorate / DASA: '+code);if(clean[key])throw Error('Duplicate code: '+key);clean[key]=canonical(group);}
  if(typeof sourceBase64!=='string'||Buffer.from(sourceBase64,'base64').length>10000000)throw Error('Upload an Excel file up to 10 MB.');
  await container.createIfNotExists();await container.getBlockBlobClient('loa-source.xlsx').uploadData(Buffer.from(sourceBase64,'base64'),{blobHTTPHeaders:{blobContentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
  const value={mapping:clean,updatedAt:new Date().toISOString()};await blob.uploadData(Buffer.from(JSON.stringify(value)),{blobHTTPHeaders:{blobContentType:'application/json'}});return reply(200,value);
 }catch(e){return reply(e.statusCode?503:400,{error:e.statusCode?'Shared LOA storage is unavailable.':e.message});}
};
