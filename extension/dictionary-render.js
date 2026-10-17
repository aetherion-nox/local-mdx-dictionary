'use strict';
// Dictionary HTML is treated as untrusted document content. Rendering happens
// inside sandboxed srcdoc iframe with a restrictive CSP (no scripts/network).
(function(){
  const DISALLOWED='script,iframe,frame,frameset,object,embed,applet,form,input,button,textarea,select,base,meta,template,portal,canvas';
  function cleanPath(path,base=''){
    const original=String(path||'').trim();
    if(!original||/^(https?:|data:|javascript:|blob:|mailto:|#)/i.test(original))return null;
    const stripped=original.replace(/^sound:\/\//i,'').replace(/^file:\/\//i,'').replace(/[?#].*$/,'');
    const roots=base?base.replaceAll('\\','/').split('/').slice(0,-1):[];
    const stack=stripped.startsWith('/')||stripped.startsWith('\\')?[]:roots;
    for(const part of stripped.replaceAll('\\','/').split('/')){
      if(!part||part==='.')continue;
      if(part==='..'){if(!stack.length)return null;stack.pop();}
      else stack.push(part);
    }
    return stack.join('/');
  }
  function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function resourceSources(doc){const paths=new Set();
    for(const el of doc.querySelectorAll('img[src],source[src],audio[src],video[poster],link[rel="stylesheet"][href],a[href^="sound:"]')){
      const raw=el.getAttribute('src')||el.getAttribute('poster')||el.getAttribute('href');const path=cleanPath(raw);
      if(path)paths.add(path);
    }
    return [...paths].slice(0,30);
  }
  function sanitizeCss(css,assets,base=''){
    return String(css||'').replace(/@import\s+[^;]+;/gi,'')
      .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi,(_,q,url)=>{
        const path=cleanPath(url,base);const found=path&&assets[path]?.data;
        return found?`url("${found}")`:'url("")';
      }).replace(/<\/style/gi,'<\\/style');
  }
  async function documentForEntry(entry) {
    const parser=new DOMParser();const original=String(entry.html||'');
    const input=/<[a-z][^>]*>/i.test(original)?original:`<pre>${escapeHtml(original)}</pre>`;
    const doc=parser.parseFromString(input,'text/html');
    const paths=resourceSources(doc);
    const request=paths.length?await chrome.runtime.sendMessage({type:'DICT_RESOURCES',dictionaryId:entry.dictionaryId,paths}):{ok:true,assets:{}};
    const assets=request?.ok?request.assets||{}:{};
    const sheets=[...doc.querySelectorAll('link[rel="stylesheet"][href]')];
    const stylesheets=[];
    for(const el of sheets){const path=cleanPath(el.getAttribute('href'));if(assets[path]?.text)stylesheets.push({path,css:assets[path].text});el.remove();}
    const cssResources=new Set();
    for(const sheet of stylesheets){
      for(const match of sheet.css.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)) {
        const path=cleanPath(match[1],sheet.path);if(path)cssResources.add(path);
      }
    }
    if(cssResources.size){const extra=await chrome.runtime.sendMessage({type:'DICT_RESOURCES',dictionaryId:entry.dictionaryId,paths:[...cssResources].slice(0,25)}).catch(()=>null);if(extra?.ok)Object.assign(assets,extra.assets);}
    for(const el of doc.querySelectorAll(DISALLOWED))el.remove();
    for(const el of doc.querySelectorAll('*')){
      for(const attr of [...el.attributes]){
        const name=attr.name.toLowerCase();
        if(name.startsWith('on')||name==='srcdoc'||name==='srcset'||name==='action'||name==='formaction')el.removeAttribute(attr.name);
      }
      if(el.hasAttribute('style'))el.setAttribute('style',sanitizeCss(el.getAttribute('style'),assets));
      if(el.tagName==='IMG'||el.tagName==='SOURCE'||el.tagName==='AUDIO'){
        const path=cleanPath(el.getAttribute('src'));el.setAttribute('src',path&&assets[path]?.data||'');
      }
      if(el.tagName==='A'){
        const href=el.getAttribute('href')||'';
        if(/^sound:\/\//i.test(href)){
          const path=cleanPath(href);const sound=path&&assets[path]?.data;
          if(sound){const audio=doc.createElement('audio');audio.controls=true;audio.src=sound;el.after(audio);}
        }
        if(!href.startsWith('#'))el.removeAttribute('href');
      }
      // Inline style elements are isolated inside the iframe, never inserted into the host webpage.
      if(el.tagName==='STYLE')el.textContent=sanitizeCss(el.textContent,assets);
    }
    // Preserve head styles without inheriting the host page's CSS.
    const headStyles=[...doc.head.querySelectorAll('style')].map(x=>x.textContent).join('\n');
    const stylesheet=stylesheets.map(sheet=>sanitizeCss(sheet.css,assets,sheet.path)).join('\n');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; img-src data:; media-src data:; font-src data:; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light dark}body{font:15px/1.55 system-ui,sans-serif;margin:12px;overflow-wrap:anywhere}img{max-width:100%;height:auto}table{max-width:100%;border-collapse:collapse}pre{white-space:pre-wrap}audio{max-width:100%}a{color:#2f86a8}*{box-sizing:border-box}</style><style>${headStyles}\n${stylesheet}</style></head><body>${doc.body.innerHTML}</body></html>`;
  }
  globalThis.EIPA_DICT_RENDER={documentForEntry,cleanPath,escapeHtml};
})();
