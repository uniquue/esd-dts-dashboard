const splash=document.getElementById('splash');
splash.classList.add('playing');document.body.classList.add('splash-active');
setTimeout(()=>{splash.remove();document.body.classList.remove('splash-active');},7000);
