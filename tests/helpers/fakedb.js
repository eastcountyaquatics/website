// In-memory stand-in for supabaseClient (testing only). State lives in
// localStorage so it survives page loads in one browser context.
(function(){
  var KEY='__fakedb';
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY))||{}; }catch(e){ return {}; } }
  function save(db){ localStorage.setItem(KEY, JSON.stringify(db)); }
  var PK={email_templates:['key'],band_links:['team_slug'],zeffy_campaigns:['campaign_id'],content_blocks:['block_key'],image_blocks:['page_path','block_key'],link_blocks:['page_path','block_key'],site_settings:['key'],page_extras:['page_path']};
  function Q(table){ this.t=table; this.f=[]; this.op='select'; this.one=false; }
  Q.prototype.select=function(){ return this; };
  Q.prototype.eq=function(c,v){ this.f.push(r=>r[c]===v); return this; };
  Q.prototype.in=function(c,v){ this.f.push(r=>v.indexOf(r[c])!==-1); return this; };
  Q.prototype.is=function(c,v){ this.f.push(r=>(r[c]==null)===(v==null)); return this; };
  Q.prototype.not=function(c,o,v){ if(o==='is'&&v===null) this.f.push(function(r){ return r[c]!=null; }); return this; }; Q.prototype.like=function(c,v){ var pre=String(v).replace('%',''); this.f.push(function(r){ return String(r[c]).indexOf(pre)===0; }); return this; };
  Q.prototype.order=function(){ return this; }; Q.prototype.contains=function(c,v){ this.f.push(function(r){ return Array.isArray(r[c]) && v.every(function(x){ return r[c].indexOf(x)!==-1; }); }); return this; }; Q.prototype.or=function(){ return this; }; Q.prototype.ilike=function(){ return this; }; Q.prototype.range=function(){ return this; }; Q.prototype.neq=function(c,v){ this.f.push(function(r){ return r[c]!==v; }); return this; }; Q.prototype.gt=function(){ return this; }; Q.prototype.lt=function(){ return this; }; Q.prototype.limit=function(){ return this; };
  Q.prototype.gte=function(c,v){ this.f.push(function(r){ return String(r[c])>=String(v); }); return this; }; Q.prototype.lte=function(){ return this; };
  Q.prototype.maybeSingle=function(){ this.one='maybe'; return this; };
  Q.prototype.single=function(){ this.one='one'; return this; };
  Q.prototype.upsert=function(rows){ this.op='upsert'; this.rows=[].concat(rows); return this; };
  Q.prototype.insert=function(rows){ this.op='upsert'; this.rows=[].concat(rows); return this; };
  Q.prototype.update=function(v){ this.op='update'; this.val=v; return this; };
  Q.prototype.delete=function(){ this.op='delete'; return this; };
  Q.prototype.then=function(res,rej){
    var db=load(), rows=db[this.t]||[], f=this.f, out;
    if(this.t==='profiles'){ var pr=(load().profiles||[]); out={data:this.one?{role:'owner',full_name:'Test Owner'}:(pr.length?pr:[{id:'coachJ',full_name:'Joey Asaro',role:'coach',email:'j@x'},{id:'owner1',full_name:'Clint McLaughlin',role:'owner'}]),error:null}; }
    else if(this.op==='select'){ var m=rows.filter(r=>f.every(fn=>fn(r))); out={data:this.one?(m[0]||null):m,error:null}; }
    else if(this.op==='upsert'){ var pk=PK[this.t]||['id']; this.rows.forEach(function(nr){ var i=rows.findIndex(r=>pk.every(k=>r[k]===nr[k])); if(i>=0) rows[i]=Object.assign({},rows[i],nr); else rows.push(nr); }); db[this.t]=rows; save(db); (window.__writes=window.__writes||[]).push([this.t,'upsert',this.rows]); out={data:this.rows,error:null}; }
    else if(this.op==='update'){ var v=this.val; rows.forEach(r=>{ if(f.every(fn=>fn(r))) Object.assign(r,v); }); db[this.t]=rows; save(db); out={data:null,error:null}; }
    else if(this.op==='delete'){ db[this.t]=rows.filter(r=>!f.every(fn=>fn(r))); save(db); out={data:null,error:null}; }
    return Promise.resolve(out).then(res,rej);
  };
  window.supabaseClient={
    from:function(t){ return new Q(t); },
    rpc:function(n){ var p=this.__rpc(n); p.order=function(){return p;}; p.limit=function(){return p;}; p.eq=function(){return p;}; return p; }, __rpc:function(n){ var db=load(); if(n==='team_directory'){ return Promise.resolve({data:(db.schedules||[]).filter(function(t){return t.is_active!==false;}).sort(function(a,b){return a.sort_order-b.sort_order;}),error:null}); } return Promise.resolve({data:(db.__rpc||{})[n]||null,error:null}); },
    functions:{invoke:function(){ return Promise.resolve({data:null}); }},
    storage:{from:function(){ return {
      upload:function(p){ return Promise.resolve({data:{path:p},error:null}); },
      getPublicUrl:function(p){ return {data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/site-images/'+p}}; },
      remove:function(){ return Promise.resolve({}); } }; }},
    auth:{ getSession:function(){ return Promise.resolve({data:{session:window.__nosession?null:{user:{id:'owner1',email:'owner@eca.test'},access_token:'x'}}}); },
           getUser:function(){ return Promise.resolve({data:{user:{id:'owner1',email:'owner@eca.test'}}}); },
           onAuthStateChange:function(){ return {data:{subscription:{unsubscribe:function(){}}}}; }, signOut:function(){ return Promise.resolve({}); } }
  };
})();
