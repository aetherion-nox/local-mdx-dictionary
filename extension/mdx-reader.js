'use strict';
// MDict 2.0 reader for user-imported local MDX files. No network access.

function ripemd128(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const bitLen = BigInt(input.length) * 8n;
  const padLen = ((56 - ((input.length + 1) % 64)) + 64) % 64;
  const msg = new Uint8Array(input.length + 1 + padLen + 8);
  msg.set(input); msg[input.length] = 0x80;
  let x = bitLen;
  for (let i=0;i<8;i++) { msg[msg.length-8+i] = Number(x & 0xffn); x >>= 8n; }
  const rl = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15, 7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8, 3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12, 1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2];
  const rr = [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12, 6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2, 15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13, 8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14];
  const sl = [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8, 7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12, 11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5, 11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12];
  const sr = [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6, 9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11, 9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5, 15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8];
  const rol = (v,n) => ((v << n) | (v >>> (32-n))) >>> 0;
  const f = (j,x,y,z) => j<16 ? (x^y^z) : j<32 ? ((x&y)|(~x&z)) : j<48 ? ((x|~y)^z) : ((x&z)|(y&~z));
  const K = j => j<16?0x00000000:j<32?0x5A827999:j<48?0x6ED9EBA1:0x8F1BBCDC;
  const Kr = j => j<16?0x50A28BE6:j<32?0x5C4DD124:j<48?0x6D703EF3:0x00000000;
  let h0=0x67452301,h1=0xEFCDAB89,h2=0x98BADCFE,h3=0x10325476;
  const dv = new DataView(msg.buffer);
  for (let off=0; off<msg.length; off+=64) {
    const X = new Uint32Array(16); for(let i=0;i<16;i++) X[i]=dv.getUint32(off+i*4,true);
    let a=h0,b=h1,c=h2,d=h3, aa=h0,bb=h1,cc=h2,dd=h3;
    for(let j=0;j<64;j++){
      let t = rol((a + f(j,b,c,d) + X[rl[j]] + K(j))>>>0, sl[j]); a=d; d=c; c=b; b=t;
      const jr = 63-j;
      t = rol((aa + f(jr,bb,cc,dd) + X[rr[j]] + Kr(j))>>>0, sr[j]); aa=dd; dd=cc; cc=bb; bb=t;
    }
    const t=(h1+c+dd)>>>0;
    h1=(h2+d+aa)>>>0; h2=(h3+a+bb)>>>0; h3=(h0+b+cc)>>>0; h0=t;
  }
  const out = new Uint8Array(16), odv=new DataView(out.buffer);
  [h0,h1,h2,h3].forEach((v,i)=>odv.setUint32(i*4,v,true));
  return out;
}

function decryptIndexData(data, checksum4) {
  const keySeed = new Uint8Array(8); keySeed.set(checksum4,0); keySeed.set([0x95,0x36,0x00,0x00],4);
  const key=ripemd128(keySeed); const out=new Uint8Array(data); let prev=0x36;
  for(let i=0;i<out.length;i++) { const cur=out[i]; let b=((cur>>>4)|(cur<<4))&255; b=(b ^ prev ^ (i&255) ^ key[i%key.length])&255; prev=cur; out[i]=b; }
  return out;
}

function lzo1xDecompress(input, expected=0) {
  input = input instanceof Uint8Array ? input : new Uint8Array(input);
  let out = new Uint8Array(Math.max(expected||0, input.length*3, 4096)); let op=0, ip=0;
  const ensure = n => { if(op+n<=out.length) return; let size=out.length; while(op+n>size) size*=2; const t=new Uint8Array(size); t.set(out); out=t; };
  const copyLit=n=>{ ensure(n); for(let i=0;i<n;i++) out[op++]=input[ip++]; };
  const copyMatch=(m,n)=>{ ensure(n); for(let i=0;i<n;i++) out[op++]=out[m++]; };
  let t=input[ip++];
  if(t>17){ t-=17; if(t<4){ copyLit(t); t=input[ip++]; } else { copyLit(t); t=input[ip++]; if(t<16){ const m=op-0x801-(t>>2)-(input[ip++]<<2); copyMatch(m,3); t=input[ip-2]&3; if(t){ copyLit(t); t=input[ip++]; } } } }
  while(ip<input.length){
    if(t<16){
      if(t===0){ while(input[ip]===0){t+=255;ip++;} t+=15+input[ip++]; }
      copyLit(t+3); t=input[ip++];
      if(t<16){ const m=op-0x801-(t>>2)-(input[ip++]<<2); copyMatch(m,3); t=input[ip-2]&3; if(t){ copyLit(t); t=input[ip++]; } else { t=input[ip++]; } }
    }
    for(;;){
      let m;
      if(t>=64){ m=op-1-((t>>2)&7)-(input[ip++]<<3); let n=(t>>5)+1; copyMatch(m,n); }
      else if(t>=32){ let n=t&31; if(n===0){ while(input[ip]===0){n+=255;ip++;} n+=31+input[ip++]; } m=op-1-((input[ip]+(input[ip+1]<<8))>>2); ip+=2; copyMatch(m,n+2); }
      else if(t>=16){ m=op-((t&8)<<11); let n=t&7; if(n===0){ while(input[ip]===0){n+=255;ip++;} n+=7+input[ip++]; } m-=((input[ip]+(input[ip+1]<<8))>>2); ip+=2; if(m===op) return out.slice(0,op); m-=0x4000; copyMatch(m,n+2); }
      else { m=op-1-(t>>2)-(input[ip++]<<2); copyMatch(m,2); }
      t=input[ip-2]&3;
      if(t===0){ t=input[ip++]; break; }
      copyLit(t); t=input[ip++];
    }
  }
  return out.slice(0,op);
}

async function inflateZlib(data) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([data]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

class Reader {
  constructor(bytes, encoding='UTF-8') { this.b=bytes; this.dv=new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.p=0; this.encoding=encoding; this.decoder=new TextDecoder(encoding.toLowerCase()==='utf-16'?'utf-16le':encoding); this.bpu=encoding.toUpperCase()==='UTF-16'?2:1; }
  u8(){return this.b[this.p++];}
  u16(){const v=this.dv.getUint16(this.p,false);this.p+=2;return v;}
  u32(){const v=this.dv.getUint32(this.p,false);this.p+=4;return v;}
  u64(){const v=this.dv.getBigUint64(this.p,false);this.p+=8;return Number(v);}
  skip(n){this.p+=n;return this;}
  sizedText(units){const n=units*this.bpu;const s=this.decoder.decode(this.b.subarray(this.p,this.p+n));this.p+=n+this.bpu;return s;}
  text0(){const start=this.p; if(this.bpu===2){while(this.p+1<this.b.length && (this.b[this.p]||this.b[this.p+1])) this.p+=2; const s=this.decoder.decode(this.b.subarray(start,this.p)); this.p+=2; return s;} while(this.p<this.b.length && this.b[this.p]) this.p++; const s=this.decoder.decode(this.b.subarray(start,this.p)); this.p++; return s;}
}

class MdxReader {
  constructor(blob,name='dictionary.mdx'){this.blob=blob;this.name=name;this.attrs={};this.keyIndex=[];this.recordIndex=[];this.keyBlockStart=0;this.recordBlockStart=0;this.keyCache=new Map();this.recordCache=new Map();}
  async slice(pos,len){return new Uint8Array(await this.blob.slice(pos,pos+len).arrayBuffer());}
  async init(){
    const head4=await this.slice(0,4); const hlen=new DataView(head4.buffer).getUint32(0,false);
    const hbytes=await this.slice(4,hlen); const header=new TextDecoder('utf-16le').decode(hbytes).replace(/\0$/,'');
    for(const m of header.matchAll(/([A-Za-z][A-Za-z0-9]*)="([\s\S]*?)"/g)) this.attrs[m[1]]=m[2].replaceAll('&quot;','"').replaceAll('&amp;','&');
    this.encoding=(this.attrs.Encoding||'UTF-16').toUpperCase(); if(this.encoding==='UTF-16LE') this.encoding='UTF-16';
    this.bpu=this.encoding==='UTF-16'?2:1; this.decoder=new TextDecoder(this.encoding==='UTF-16'?'utf-16le':this.encoding);
    this.encrypted=parseInt(this.attrs.Encrypted||'0',10)||0; if(this.encrypted&1) throw new Error('不支持需要注册密钥的 MDX 头部加密');
    let pos=4+hlen+4; const summary=await this.slice(pos,44); const sr=new Reader(summary,this.encoding);
    this.numKeyBlocks=sr.u64(); this.numEntries=sr.u64(); this.keyIndexDecompLen=sr.u64(); this.keyIndexCompLen=sr.u64(); this.keyBlocksLen=sr.u64(); sr.u32(); pos+=44;
    const indexBlock=await this.slice(pos,this.keyIndexCompLen); const indexBytes=await this.decompressBlock(indexBlock,this.keyIndexDecompLen,Boolean(this.encrypted&2));
    const ir=new Reader(indexBytes,this.encoding); let keyOffset=0;
    for(let i=0;i<this.numKeyBlocks;i++){
      const num=ir.u64(); const flen=ir.u16(); const first=ir.sizedText(flen); const llen=ir.u16(); const last=ir.sizedText(llen); const comp=ir.u64(); const decomp=ir.u64();
      this.keyIndex.push({index:i,numEntries:num,first,last,compSize:comp,decompSize:decomp,offset:keyOffset}); keyOffset+=comp;
    }
    pos+=this.keyIndexCompLen; this.keyBlockStart=pos; pos+=this.keyBlocksLen;
    const rs=await this.slice(pos,32); const rr=new Reader(rs,this.encoding); this.numRecordBlocks=rr.u64(); rr.u64(); const recordIndexLen=rr.u64(); this.recordBlocksLen=rr.u64(); pos+=32;
    const ridx=await this.slice(pos,recordIndexLen); const rdr=new Reader(ridx,this.encoding); let compOff=0,decompOff=0;
    for(let i=0;i<this.numRecordBlocks;i++){ const comp=rdr.u64(), decomp=rdr.u64(); this.recordIndex.push({index:i,compOffset:compOff,decompOffset:decompOff,compSize:comp,decompSize:decomp}); compOff+=comp; decompOff+=decomp; }
    this.recordBlockStart=pos+recordIndexLen;
    return this;
  }
  adapt(s){ let v=String(s||''); if(String(this.attrs.KeyCaseSensitive||'No').toLowerCase()!=='yes') v=v.toLowerCase(); if(String(this.attrs.StripKey||'No').toLowerCase()==='yes') v=v.replace(/[()., '\/\\@_-]/g,''); return v; }
  async decompressBlock(block,expected=0,decrypt=false){ const type=block[0]; if(type===0) return block.subarray(8); const checksum=block.subarray(4,8); let data=block.subarray(8); if(decrypt) data=decryptIndexData(data,checksum); if(type===2) return inflateZlib(data); if(type===1) return lzo1xDecompress(data,expected); throw new Error('未知 MDX 压缩类型 '+type); }
  findKeyBlock(word){const w=this.adapt(word); let lo=0,hi=this.keyIndex.length-1,best=this.keyIndex[0]; while(lo<=hi){const mid=(lo+hi)>>1,k=this.keyIndex[mid]; if(w>this.adapt(k.last)){lo=mid+1;} else {best=k;hi=mid-1;}} return best;}
  async loadKeyBlock(k){ if(this.keyCache.has(k.index)) return this.keyCache.get(k.index); const block=await this.slice(this.keyBlockStart+k.offset,k.compSize); const bytes=await this.decompressBlock(block,k.decompSize,false); const r=new Reader(bytes,this.encoding); const list=[]; for(let i=0;i<k.numEntries && r.p<bytes.length;i++){ const off=r.u64(); const key=r.text0(); list.push({key,offset:off,keyBlockIndex:k.index}); } this.keyCache.set(k.index,list); if(this.keyCache.size>48)this.keyCache.delete(this.keyCache.keys().next().value); return list; }
  findRecordBlock(offset){let lo=0,hi=this.recordIndex.length-1;while(lo<=hi){const m=(lo+hi)>>1,b=this.recordIndex[m];if(offset<b.decompOffset)hi=m-1;else if(offset>=b.decompOffset+b.decompSize)lo=m+1;else return b;}return null;}
  async loadRecordBlock(b){ if(this.recordCache.has(b.index)) return this.recordCache.get(b.index); const block=await this.slice(this.recordBlockStart+b.compOffset,b.compSize); const bytes=await this.decompressBlock(block,b.decompSize,false); this.recordCache.set(b.index,bytes); if(this.recordCache.size>48)this.recordCache.delete(this.recordCache.keys().next().value); return bytes; }
  decode0(bytes,start){let end=start;if(this.bpu===2){while(end+1<bytes.length&&(bytes[end]||bytes[end+1]))end+=2;}else{while(end<bytes.length&&bytes[end])end++;}return this.decoder.decode(bytes.subarray(start,end));}
  rawKey(s){ const v=String(s||'').normalize('NFC').replaceAll('’',"'").trim(); return String(this.attrs.KeyCaseSensitive||'No').toLowerCase()==='yes' ? v : v.toLowerCase(); }
  async recordEnd(hit) {
    const block = this.keyIndex[hit.keyBlockIndex];
    const keys = await this.loadKeyBlock(block);
    const index = keys.findIndex(x => x.offset === hit.offset && x.key === hit.key);
    if (index >= 0 && index + 1 < keys.length) return keys[index + 1].offset;
    if (block.index + 1 < this.keyIndex.length) {
      const next = await this.loadKeyBlock(this.keyIndex[block.index + 1]);
      if (next.length) return next[0].offset;
    }
    const last = this.recordIndex[this.recordIndex.length - 1];
    return last ? last.decompOffset + last.decompSize : hit.offset;
  }
  async readRecord(hit, maxLength=4*1024*1024) {
    const end = await this.recordEnd(hit);
    if (end <= hit.offset || end - hit.offset > maxLength) throw new Error('词条数据过大或索引损坏');
    const parts = []; let total = 0; let pos = hit.offset;
    while(pos < end) {
      const rb = this.findRecordBlock(pos);
      if (!rb) throw new Error('MDX 记录块索引损坏');
      const raw = await this.loadRecordBlock(rb);
      const offset = pos - rb.decompOffset;
      const take = Math.min(end-pos, rb.decompSize-offset);
      if (take <= 0) throw new Error('MDX 记录长度无效');
      parts.push(raw.subarray(offset,offset+take)); total+=take; pos+=take;
    }
    const data = new Uint8Array(total); let i=0;
    for(const part of parts){data.set(part,i);i+=part.length;}
    return data;
  }
  async definitionForHit(hit,depth=0,strict=false){
    const bytes=await this.readRecord(hit);
    const def=this.decoder.decode(bytes).replace(/\0+$/g,'');
    if(def.startsWith('@@@LINK=')) {
      const target=def.slice(8).trim();
      return strict ? this.lookupExact(target,depth+1) : this.lookup(target,depth+1);
    }
    return {key:hit.key,definition:def};
  }
  async lookupExact(word,depth=0){
    if(depth>4)return null;
    const target=this.rawKey(word); if(!target)return null;
    const k=this.findKeyBlock(word); if(!k)return null;
    // StripKey dictionaries can place several punctuation variants under the
    // same adapted sort key. Search the selected block and its neighbors, but
    // accept only the real raw key spelling (case-insensitive, curly apostrophe normalized).
    const indexes=[k.index,k.index-1,k.index+1].filter((v,i,a)=>v>=0&&v<this.keyIndex.length&&a.indexOf(v)===i);
    for(const index of indexes){
      const block=this.keyIndex[index]; const list=await this.loadKeyBlock(block);
      const hit=list.find(x=>this.rawKey(x.key)===target);
      if(hit)return this.definitionForHit(hit,depth,true);
    }
    return null;
  }
  async lookup(word,depth=0){ if(depth>4)return null; const w=this.adapt(word); const k=this.findKeyBlock(w); const list=await this.loadKeyBlock(k); const hit=list.find(x=>this.adapt(x.key)===w); if(!hit)return null; return this.definitionForHit(hit,depth,false); }
}

// MDD is the same MDict container layout, but record contents are binary assets.
class MddReader extends MdxReader {
  async definitionForHit(hit) { return {key:hit.key,data:await this.readRecord(hit,3*1024*1024)}; }
  async resource(path) {
    const cleaned=String(path||'').replace(/^sound:\/\//i,'').replace(/^file:\/\//i,'').replaceAll('/','\\').replace(/^\\*/, '');
    if (!cleaned || cleaned.includes('..')) return null;
    return (await this.lookup('\\'+cleaned)) || (await this.lookup(cleaned));
  }
}
globalThis.EIPA_MDX = { MdxReader, MddReader };

