'use strict';
// Loaded in the background service worker after mdx-reader.js and background.js.
// Read-only dictionary lookups; no network calls and no reliance on a dictionary's HTML layout.
const dictionaryReaders = new Map();
let readerCatalogRevision = -1;
async function currentCatalog() {
  const state = await chrome.storage.local.get({ dictionaryCatalog: [], dictionaryCatalogRevision: 0 });
  if (readerCatalogRevision !== state.dictionaryCatalogRevision) {
    dictionaryReaders.clear();
    readerCatalogRevision = state.dictionaryCatalogRevision;
  }
  return (Array.isArray(state.dictionaryCatalog) ? state.dictionaryCatalog : []).filter(x => x && x.id && x.enabled !== false);
}
async function getDictionaryReader(id, extension='mdx') {
  const cacheKey = `${id}:${extension}`;
  if (!dictionaryReaders.has(cacheKey)) {
    const promise = (async () => {
      const saved = await idbGet(id === 'legacy' && extension === 'mdx' ? 'primary-mdx' : `dict:${id}:${extension}`);
      if (!saved?.blob) return null;
      const Reader = extension === 'mdd' ? EIPA_MDX.MddReader : EIPA_MDX.MdxReader;
      const reader = new Reader(saved.blob, saved.name);
      return await reader.init();
    })();
    dictionaryReaders.set(cacheKey, promise);
    promise.catch(() => { if (dictionaryReaders.get(cacheKey) === promise) dictionaryReaders.delete(cacheKey); });
  }
  return dictionaryReaders.get(cacheKey);
}
async function dictionaryLookups(word, onlyId = null) {
  const catalog = await currentCatalog();
  const query = String(word || '').normalize('NFC').trim();
  if (!query) return [];
  const results = [];
  for (const item of catalog) {
    if (onlyId && item.id !== onlyId) continue;
    try {
      const reader = await getDictionaryReader(item.id);
      if (!reader) continue;
      const hit = await reader.lookupExact(query) || await reader.lookup(query);
      if (!hit) continue;
      const savedCss = await idbGet(`dict:${item.id}:css`);
      const customCss = savedCss?.blob ? {name:savedCss.name || 'dictionary.css',text:await savedCss.blob.text()} : null;
      results.push({customCss,dictionaryId: item.id, dictionaryName: item.title || item.name, key: hit.key, html: hit.definition});
    } catch (error) {
      results.push({dictionaryId:item.id,dictionaryName:item.title || item.name,key:query,error:String(error?.message || error)});
    }
  }
  return results;
}
const RESOURCE_MIME = {css:'text/css',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',mp3:'audio/mpeg',ogg:'audio/ogg',wav:'audio/wav',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf'};
function mimeFor(path) { return RESOURCE_MIME[String(path).toLowerCase().split(/[?#]/)[0].split('.').pop()] || 'application/octet-stream'; }
function base64Data(bytes) {
  // Resource size is explicitly capped in MddReader.readRecord to avoid huge messages.
  let result=''; const chunk=0x4000;
  for(let i=0;i<bytes.length;i+=chunk) result+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(result);
}
async function dictionaryAssets(id, paths) {
  const catalog=await currentCatalog();
  if (!catalog.some(x=>x.id===id)) return {};
  const reader=await getDictionaryReader(id,'mdd');
  if (!reader) return {};
  const result={};
  for (const input of [...new Set((paths||[]).filter(x=>typeof x==='string'))].slice(0,30)) {
    if (input.length>500 || /^https?:|^data:|^javascript:/i.test(input)) continue;
    const path=input.replace(/[?#].*$/,'');
    try {
      const hit=await reader.resource(path);
      if(!hit?.data) continue;
      const type=mimeFor(path);
      result[input]=type==='text/css' ? {mime:type,text:new TextDecoder().decode(hit.data)} : {mime:type,data:`data:${type};base64,${base64Data(hit.data)}`};
    }catch(e) { console.warn('[Local Dictionary] asset unavailable',path,e); }
  }
  return result;
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;
  if (message.type === 'DICT_RELOAD') {
    dictionaryReaders.clear(); readerCatalogRevision = -1;
    currentCatalog().then(() => sendResponse({ok:true})).catch(e=>sendResponse({ok:false,error:String(e)}));
    return true;
  }
  if (message.type === 'DICT_LOOKUP') {
    dictionaryLookups(message.word, message.dictionaryId).then(entries=>sendResponse({ok:true,entries}))
      .catch(e=>sendResponse({ok:false,error:String(e?.message || e),entries:[]}));
    return true;
  }
  if (message.type === 'DICT_RESOURCES') {
    dictionaryAssets(message.dictionaryId,message.paths).then(assets=>sendResponse({ok:true,assets}))
      .catch(e=>sendResponse({ok:false,error:String(e?.message || e),assets:{}}));
    return true;
  }
  return false;
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if(message?.type!=='DICT_CATALOG_VALIDATE') return false;
  (async()=>{
    const catalog=await currentCatalog();
    const entries=[];
    for(const item of catalog){
      try{const reader=await getDictionaryReader(item.id);entries.push({id:item.id,title:reader?.attrs?.Title||item.name,entries:reader?.numEntries||0});}
      catch(e){entries.push({id:item.id,title:item.name,entries:0,error:String(e)});}
    }
    return {ok:true,entries};
  })().then(sendResponse).catch(e=>sendResponse({ok:false,error:String(e)}));
  return true;
});

chrome.runtime.onMessage.addListener((message,_sender,sendResponse)=>{
  if(message?.type!=='DICT_VALIDATE_FILE')return false;
  getDictionaryReader(message.id).then(reader=>{
    if(!reader||!reader.keyIndex.length)throw new Error('Empty or unreadable MDX');
    sendResponse({ok:true,title:reader.attrs?.Title||'',entries:reader.numEntries||0});
  }).catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
  return true;
});
