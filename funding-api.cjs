const {BlobServiceClient}=require('@azure/storage-blob');
module.exports=async function(context,req){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 try{
  const connection=process.env.MASTER_STORAGE_CONNECTION_STRING;
  if(!connection){context.res={status:503,headers,body:{error:'Shared funding storage is not configured.'}};return;}
  const container=BlobServiceClient.fromConnectionString(connection).getContainerClient('esd-dts-master');
  const fy=String(req.query?.fy||'FY26').toUpperCase();if(!/^FY(2[5-9]|30)$/.test(fy))throw Error('Invalid fiscal year.');
  const blob=container.getBlockBlobClient('funding-received-'+fy+'.json');
  const read=async()=>{try{return JSON.parse((await blob.downloadToBuffer()).toString());}catch(e){if(e.statusCode!==404)throw e;if(fy==='FY26'){try{return JSON.parse((await container.getBlockBlobClient('funding-received.json').downloadToBuffer()).toString());}catch(legacyError){if(legacyError.statusCode!==404)throw legacyError;}}return {entries:[],updatedAt:null,fiscalYear:fy};}};
  if(req.method==='GET'){context.res={status:200,headers,body:await read()};return;}
  if(!require('./upload-auth.cjs')(req)){context.res={status:401,headers,body:{error:'Enter the correct admin password.'}};return;}
  const current=await read();
  if(req.method==='DELETE'){
   const id=String(req.body?.id||'');
   current.entries=(current.entries||[]).filter(entry=>entry.id!==id);
   current.updatedAt=new Date().toISOString();
  }else{
   const input=req.body||{},agency=String(input.agency||''),group=String(input.group||'').trim(),quarter=String(input.quarter||''),dateReceived=String(input.dateReceived||''),amount=Number(input.amount);
   if(!['ASA(FM&C)','G-8'].includes(agency)||!group||group.length>80||!['Q1','Q2','Q3','Q4'].includes(quarter)||!/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)||!Number.isSafeInteger(amount)||amount<0)throw Error('Enter a valid agency, group, quarter, date, and amount.');
   const now=new Date().toISOString(),id=(globalThis.crypto?.randomUUID?.()||now+'-'+Math.random().toString(36).slice(2));
   current.entries=[...(current.entries||[]),{id,agency,group,quarter,dateReceived,amount,updatedAt:now}];
   current.updatedAt=now;
  }
  await container.createIfNotExists();
  await blob.uploadData(Buffer.from(JSON.stringify(current)),{blobHTTPHeaders:{blobContentType:'application/json'}});
  current.fiscalYear=fy;context.res={status:200,headers,body:current};
 }catch(e){context.res={status:e.statusCode?503:400,headers,body:{error:e.statusCode?'Shared storage is temporarily unavailable.':e.message}};}
};
