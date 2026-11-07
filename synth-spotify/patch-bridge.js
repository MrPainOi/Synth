const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'assets', 'public', 'mobile-bridge.js');
let code = fs.readFileSync(srcPath, 'utf8');

// 1. Patch window.fetch to normalize /api/ requests to Ob (http://127.0.0.1:38472/)
const searchFetch = 'window.fetch=async(e,t={})=>{let i=typeof e=="string"?e:e&&e.url;if(!i||!i.startsWith(Ob))return Lb(e,t);';
const replaceFetch = 'window.fetch=async(e,t={})=>{let i=typeof e=="string"?e:e&&e.url;if(typeof i=="string"){if(i.startsWith("/api/"))i=Ob+i.slice(1);else if(i.startsWith("http://localhost/api/"))i=Ob+i.slice(17);else if(i.startsWith("http://127.0.0.1:3030/api/"))i=Ob+i.slice(22);if(i.includes("/api/synth-tracks"))i=i.replace("/api/synth-tracks","/api/library");}if(!i||!i.startsWith(Ob))return Lb(e,t);';

if (code.includes(searchFetch)) {
  code = code.replace(searchFetch, replaceFetch);
  console.log('✔ window.fetch patched successfully in mobile-bridge.js');
} else {
  console.log('ℹ window.fetch target already patched or not found');
}

// 2. Patch $7(HTMLMediaElement.prototype) to safely unwrap proxy URLs and fallback gracefully
const search7 = 'function $7(e){let t=Object.getOwnPropertyDescriptor(e,"src");Object.defineProperty(e,"src",{configurable:!0,get(){return this.__murielSrc!==void 0?this.__murielSrc:t.get.call(this)},set(i){if(i=String(i),!i.startsWith(Ob)){this.__murielSrc=void 0,this.__murielPending=null,t.set.call(this,i);return}this.__murielSrc=i,this.__murielPending=_V(i).then(n=>{this.__murielSrc===i&&t.set.call(this,n)}).catch(n=>{console.warn("[muriel]",n.message),this.__murielSrc===i&&this.dispatchEvent(new Event("error"))})}})}';

const replace7 = 'function $7(e){let t=Object.getOwnPropertyDescriptor(e,"src");Object.defineProperty(e,"src",{configurable:!0,get(){return this.__murielSrc!==void 0?this.__murielSrc:t.get.call(this)},set(i){if(typeof i=="string"){if(i.includes("/api/audio-proxy?url=")){let m=i.match(/[?&]url=([^&]+)/);if(m){let u=decodeURIComponent(m[1]);this.__murielSrc=void 0;this.__murielPending=null;t.set.call(this,u);return;}}if(i.startsWith("/api/"))i=Ob+i.slice(1);else if(i.startsWith("http://localhost/api/"))i=Ob+i.slice(17);}if(i=String(i),!i.startsWith(Ob)){this.__murielSrc=void 0,this.__murielPending=null,t.set.call(this,i);return;}this.__murielSrc=i,this.__murielPending=_V(i).then(n=>{this.__murielSrc===i&&t.set.call(this,n);}).catch(n=>{console.warn("[muriel]",n.message);if(this.__murielSrc===i){t.set.call(this,i);}})}})}';

if (code.includes(search7)) {
  code = code.replace(search7, replace7);
  console.log('✔ $7 (HTMLMediaElement.src interceptor) patched successfully in mobile-bridge.js');
} else {
  console.log('ℹ $7 target already patched or not found');
}

// 3. Patch Android backButton listener to delegate to window.handleAndroidBackButton() before minimizeApp()
const searchBack = 'if(bI.getPlatform()==="android"){let{App:e}=P7(),t=i=>i&&!i.classList.contains("hidden")&&getComputedStyle(i).display!=="none";e.addListener("backButton",()=>{if(window.MurielEncore&&document.querySelector(".encore")){window.MurielEncore.close();return}let i=[...document.querySelectorAll(".modal-backdrop")].reverse().find(s=>t(s)&&s.classList.contains("visible"));if(i){let s=i.querySelector(\'[id^="btn-close"], [id^="btn-cancel"], .modal-close\');s?s.click():i.click();return}let n=document.getElementById("tv-karaoke");if(t(n)){document.getElementById("btn-close-tv-karaoke").click();return}let o=document.getElementById("rail-drawer");if(t(o)){document.getElementById("btn-close-rail-drawer").click();return}if(document.body.classList.contains("np-open")){document.getElementById("btn-close-right-panel").click();return}let r=document.getElementById("nav-discover");if(r&&!r.classList.contains("active")){r.click();return}e.minimizeApp()})}';

const replaceBack = 'if(bI.getPlatform()==="android"){let{App:e}=P7();e.addListener("backButton",()=>{if(typeof window.handleAndroidBackButton==="function"){try{let handled=window.handleAndroidBackButton();if(handled)return;}catch(err){console.warn("[AndroidBack]",err);}}e.minimizeApp();})}';

if (code.includes(searchBack)) {
  code = code.replace(searchBack, replaceBack);
  console.log('✔ backButton listener patched successfully in mobile-bridge.js');
} else {
  console.log('ℹ backButton target already patched or not found');
}

fs.writeFileSync(path.join(__dirname, 'mobile-bridge.js'), code, 'utf8');
console.log('✔ Output written to synth-spotify/mobile-bridge.js');
