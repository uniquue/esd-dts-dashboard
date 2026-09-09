const {createHash,timingSafeEqual}=require('node:crypto');
module.exports=req=>{const expected=process.env.UPLOAD_PASSWORD_SHA256||'';if(!/^[a-f0-9]{64}$/i.test(expected))return false;const supplied=String(req.headers?.['x-upload-password']||'');if(!supplied||supplied.length>256)return false;return timingSafeEqual(createHash('sha256').update(supplied).digest(),Buffer.from(expected,'hex'));};
