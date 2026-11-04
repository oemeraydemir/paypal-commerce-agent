'use strict';
const puppeteer=require('puppeteer-core');
(async()=>{
 const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox'],defaultViewport:{width:1400,height:900}});
 const p=await b.newPage(); await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
 await p.goto(process.env.BASE+'/dashboard',{waitUntil:'networkidle2',timeout:45000}); await new Promise(r=>setTimeout(r,2500));
 const r=await p.evaluate(()=>{
   const dark=document.body.classList.contains('dark');
   function g(s){const e=document.querySelector(s);if(!e)return null;const c=getComputedStyle(e);return {fg:c.color,bg:c.backgroundColor,img:c.backgroundImage,size:c.fontSize}}
   return {bodyDark:dark, gridTheme: (window.__gt||null), toolbar:g('.grid-toolbar button'), statval:g('.stat-value'), statcard:g('.stat-card'), h2:g('.grid-section h2'), detailTitle:g('.detail-group-title') };
 });
 console.log(JSON.stringify(r,null,2)); await b.close();
})();
