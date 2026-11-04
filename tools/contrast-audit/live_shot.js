'use strict';
const puppeteer=require('puppeteer-core');
(async()=>{
 const b=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:'new',args:['--no-sandbox'],defaultViewport:{width:1920,height:1200}});
 const p=await b.newPage();
 await p.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
 await p.goto('https://paypal-commerce-agent.onrender.com/dashboard',{waitUntil:'networkidle2',timeout:60000});
 await new Promise(r=>setTimeout(r,3500));
 await p.screenshot({path:'live_dashboard_dark.png'});
 const state=await p.evaluate(()=>({dark:document.body.classList.contains('dark'),cmd:document.title}));
 console.log(JSON.stringify(state));
 await b.close();
})();
