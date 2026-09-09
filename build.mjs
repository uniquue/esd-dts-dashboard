import {mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
mkdirSync('dist',{recursive:true});
for(const name of ['esd-logo.png','splash.js','index.html','style.css','app.mjs','data.mjs','loa-map.mjs','staticwebapp.config.json'])copyFileSync(name,'dist/'+name);
copyFileSync('node_modules/exceljs/dist/exceljs.min.js','dist/exceljs.min.js');
mkdirSync('api/master',{recursive:true});copyFileSync('master-api.cjs','api/master/index.js');
writeFileSync('api/host.json',JSON.stringify({version:'2.0'}));
writeFileSync('api/package.json',JSON.stringify({name:'esd-dts-api',version:'1.0.0',private:true,dependencies:{'@azure/storage-blob':'12.28.0'}}));
writeFileSync('api/master/function.json',JSON.stringify({bindings:[{authLevel:'anonymous',type:'httpTrigger',direction:'in',name:'req',methods:['get','put'],route:'master'},{type:'http',direction:'out',name:'res'}]}));

copyFileSync('master-seed.json','api/master/master-seed.json');
