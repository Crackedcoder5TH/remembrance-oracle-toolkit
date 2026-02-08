/**
 * Production Seeds 2 — production-grade patterns for concurrency,
 * IO, validation, design patterns, and data structures.
 *
 * Each pattern includes working code and test proof.
 */

function getProductionSeeds2() {
  return [
    // ─── 1. Worker Pool (Concurrency) ───
    {
      name: 'worker-pool',
      code: `class WorkerPool{
  constructor(n){this.size=n;this.current=0;this.active=0;this.completed=0;this.failed=0;this._off=false}
  async exec(task){
    if(this._off)throw new Error('Pool is shut down');
    var w=this.current;this.current=(this.current+1)%this.size;this.active++;
    try{var r=await Promise.resolve(task(w));this.completed++;return r}
    catch(e){this.failed++;throw e}finally{this.active--}}
  stats(){return{size:this.size,active:this.active,completed:this.completed,failed:this.failed}}
  shutdown(){this._off=true}
}`,
      testCode: `var pool=new WorkerPool(2),results=[];
await pool.exec(function(w){results.push('a'+w)});
await pool.exec(function(w){results.push('b'+w)});
await pool.exec(function(w){results.push('c'+w)});
if(results[0]!=='a0') throw new Error('first worker');
if(results[1]!=='b1') throw new Error('round-robin');
if(results[2]!=='c0') throw new Error('wrap around');
if(pool.stats().completed!==3) throw new Error('completed count');
pool.shutdown();
try{await pool.exec(function(){});throw new Error('no')}catch(e){if(e.message==='no')throw e}`,
      language: 'javascript',
      description: 'Worker pool with round-robin dispatch, stats tracking, and graceful shutdown',
      tags: ['concurrency', 'pool', 'worker', 'async', 'round-robin', 'task-queue'],
      patternType: 'concurrency',
    },

    // ─── 2. CSV Parser (IO) ───
    {
      name: 'csv-parser',
      code: `function parseCSV(t,o){
  o=o||{};var d=o.delimiter||',',h=o.headers!==false,q=o.quote||'"',R=[],row=[''],Q=false,col=0;
  for(var i=0;i<t.length;i++){var c=t[i];
    if(Q){if(c===q&&t[i+1]===q){row[col]+=q;i++}else if(c===q)Q=false;else row[col]+=c}
    else if(c===q)Q=true;else if(c===d)row[++col]='';
    else if(c==='\\n'||(c==='\\r'&&t[i+1]==='\\n')){if(c==='\\r')i++;R.push(row);row=[''];col=0}
    else row[col]+=c}
  if(row.length>1||row[0]!=='')R.push(row);if(!h||!R.length)return R;
  return R.slice(1).map(function(r){var o={};R[0].forEach(function(n,i){o[n]=r[i]||''});return o})
}`,
      testCode: `var r1=parseCSV('name,age\\nAlice,30\\nBob,25');
if(r1.length!==2) throw new Error('row count');
if(r1[0].name!=='Alice') throw new Error('field value');
if(r1[1].age!=='25') throw new Error('second row');
var r2=parseCSV('"a,b",c\\n"d""e",f',{headers:false});
if(r2[0][0]!=='a,b') throw new Error('quoted comma');
if(r2[1][0]!=='d"e') throw new Error('escaped quote');`,
      language: 'javascript',
      description: 'CSV parser handling quoted fields, escaped quotes, and newlines within quotes',
      tags: ['csv', 'parser', 'io', 'text', 'delimiter', 'data-import'],
      patternType: 'io',
    },

    // ─── 3. JWT Auth (Validation) ───
    {
      name: 'jwt-auth',
      code: `const crypto=require('crypto'),B='base64url',HD=Buffer.from('{"alg":"HS256","typ":"JWT"}').toString(B);
class JWTAuth{constructor(s){this.s=s}
_h(i){return crypto.createHmac('sha256',this.s).update(i).digest(B)}
sign(p,ms){ms=ms||36e5;var b=Buffer.from(JSON.stringify({...p,exp:Date.now()+ms})).toString(B);return HD+'.'+b+'.'+this._h(HD+'.'+b)}
verify(t){var p=t.split('.');if(this._h(p[0]+'.'+p[1])!==p[2])throw new Error('Bad sig');
var d=JSON.parse(Buffer.from(p[1],B));if(d.exp&&Date.now()>d.exp)throw new Error('Expired');return d}
decode(t){return JSON.parse(Buffer.from(t.split('.')[1],B))}}`,
      testCode: `var auth=new JWTAuth('test-secret-key-12345');
var token=auth.sign({sub:'user1',role:'admin'});
if(typeof token!=='string'||token.split('.').length!==3) throw new Error('token format');
var payload=auth.verify(token);
if(payload.sub!=='user1') throw new Error('verify payload');
var decoded=auth.decode(token);
if(decoded.role!=='admin') throw new Error('decode payload');
try{auth.verify(token+'x');throw new Error('no')}catch(e){if(e.message==='no')throw e}`,
      language: 'javascript',
      description: 'JWT authentication with HMAC-SHA256 signing, verification, and decoding',
      tags: ['jwt', 'auth', 'token', 'hmac', 'sha256', 'crypto', 'security', 'validation'],
      patternType: 'validation',
    },

    // ─── 4. CORS Middleware (Utility) ───
    {
      name: 'cors-middleware',
      code: `function cors(opts){
  opts=opts||{};var A='Access-Control-Allow-',o={origin:opts.origin||'*',
    mt:opts.methods||'GET,HEAD,PUT,PATCH,POST,DELETE',
    hd:opts.headers||'',cred:!!opts.credentials,ma:opts.maxAge||86400};
  return function(req,res,next){
    res.setHeader(A+'Origin',o.origin);
    if(o.cred)res.setHeader(A+'Credentials','true');
    if(req.method==='OPTIONS'){
      res.setHeader(A+'Methods',o.mt);
      if(o.hd)res.setHeader(A+'Headers',o.hd);
      res.setHeader('Access-Control-Max-Age',''+o.ma);
      res.writeHead(204);res.end();return}
    next()}
}`,
      testCode: `var handler=cors({origin:'http://example.com',methods:'GET,POST',credentials:true});
var hd={};
var res={setHeader:function(k,v){hd[k]=v},writeHead:function(){},end:function(){}};
handler({method:'OPTIONS'},res,function(){});
if(hd['Access-Control-Allow-Origin']!=='http://example.com') throw new Error('origin');
if(hd['Access-Control-Allow-Credentials']!=='true') throw new Error('credentials');
if(hd['Access-Control-Allow-Methods']!=='GET,POST') throw new Error('methods');
var called=false;hd={};
handler({method:'GET'},res,function(){called=true});
if(!called) throw new Error('next not called');`,
      language: 'javascript',
      description: 'CORS middleware with preflight handling, origin control, and credentials support',
      tags: ['cors', 'middleware', 'http', 'headers', 'preflight', 'security', 'api'],
      patternType: 'utility',
    },

    // ─── 5. Request Validator (Validation) ───
    {
      name: 'request-validator',
      code: `class RequestValidator{
  constructor(schema){this.schema=schema}
  validate(data){
    var er=[];
    for(var f in this.schema){var r=this.schema[f],v=data[f];
      if(r.required&&(v==null||v==='')){er.push(f+' required');continue}
      if(v==null)continue;
      if(r.type&&typeof v!==r.type)er.push(f+': want '+r.type);
      if(r.min!=null&&v<r.min)er.push(f+' < min');
      if(r.max!=null&&v>r.max)er.push(f+' > max');
      if(r.pattern&&!r.pattern.test(''+v))er.push(f+' bad format');
      if(r.enum&&!r.enum.includes(v))er.push(f+' not in enum')}
    return{valid:!er.length,errors:er}}
}`,
      testCode: `var v=new RequestValidator({
  name:{type:'string',required:true},
  age:{type:'number',min:0,max:150},
  role:{enum:['admin','user']}
});
var r1=v.validate({name:'Alice',age:30,role:'admin'});
if(!r1.valid) throw new Error('valid data failed');
var r2=v.validate({});
if(r2.valid||r2.errors.length===0) throw new Error('missing required passed');
var r3=v.validate({name:'Bob',age:-1});
if(r3.valid) throw new Error('below min passed');
var r4=v.validate({name:'X',role:'superadmin'});
if(r4.valid) throw new Error('invalid enum passed');`,
      language: 'javascript',
      description: 'Schema-based request validator with type, range, pattern, and enum checks',
      tags: ['validation', 'schema', 'request', 'form', 'input', 'sanitize'],
      patternType: 'validation',
    },

    // ─── 6. Stream Pipeline (IO) ───
    {
      name: 'stream-pipeline',
      code: `class StreamPipeline{
  constructor(){this.transforms=[]}
  pipe(fn){this.transforms.push(fn);return this}
  async process(input){
    var r=input;
    for(var i=0;i<this.transforms.length;i++)
      r=await Promise.resolve(this.transforms[i](r));
    return r}
  get length(){return this.transforms.length}
  reset(){this.transforms=[];return this}
}`,
      testCode: `var p=new StreamPipeline();
p.pipe(function(x){return x*2}).pipe(function(x){return x+1}).pipe(function(x){return String(x)});
var r=await p.process(5);
if(r!=='11') throw new Error('chain result: '+r);
var p2=new StreamPipeline();
p2.pipe(async function(x){return x.toUpperCase()}).pipe(function(x){return x+'!'});
var r2=await p2.process('hello');
if(r2!=='HELLO!') throw new Error('async transform');
if(p.length!==3) throw new Error('length');
var p3=new StreamPipeline();
if(await p3.process(42)!==42) throw new Error('empty pipeline');`,
      language: 'javascript',
      description: 'Chainable transform pipeline with sync and async function support',
      tags: ['stream', 'pipeline', 'transform', 'chain', 'async', 'io', 'functional'],
      patternType: 'io',
    },

    // ─── 7. Observable (Design Pattern) ───
    {
      name: 'observable',
      code: `class Observable{
  constructor(fn){this._fn=fn}
  subscribe(o){return this._fn(typeof o==='function'?{next:o}:o)}
  static of(){var v=[].slice.call(arguments);
    return new Observable(function(o){v.forEach(function(x){o.next(x)});
      if(o.complete)o.complete();return{unsubscribe:function(){}}})}
  map(fn){var s=this;return new Observable(function(o){
    return s.subscribe({next:function(v){o.next(fn(v))}})})}
  filter(fn){var s=this;return new Observable(function(o){
    return s.subscribe({next:function(v){if(fn(v))o.next(v)}})})}
}`,
      testCode: `var values=[];
Observable.of(1,2,3).subscribe({next:function(v){values.push(v)}});
if(values.length!==3||values[2]!==3) throw new Error('of');
var mapped=[];
Observable.of(1,2,3).map(function(x){return x*10}).subscribe({next:function(v){mapped.push(v)}});
if(mapped[0]!==10||mapped[2]!==30) throw new Error('map');
var filtered=[];
Observable.of(1,2,3,4).filter(function(x){return x%2===0}).subscribe({next:function(v){filtered.push(v)}});
if(filtered.length!==2||filtered[0]!==2) throw new Error('filter');
var u=Observable.of(1).subscribe({next:function(){}});
if(typeof u.unsubscribe!=='function') throw new Error('unsubscribe');`,
      language: 'javascript',
      description: 'Observable with subscribe, map, filter, and static of() factory',
      tags: ['observable', 'reactive', 'stream', 'design-pattern', 'functional', 'subscribe'],
      patternType: 'design-pattern',
    },

    // ─── 8. Dependency Injection Container (Design Pattern) ───
    {
      name: 'dependency-injection',
      code: `class DIContainer{
  constructor(){this._r=new Map();this._s=new Map()}
  register(name,factory,opts){
    this._r.set(name,{factory:factory,singleton:!!(opts&&opts.singleton)});
    this._s.delete(name);return this}
  resolve(name){
    if(!this._r.has(name))throw new Error(name+' not registered');
    var e=this._r.get(name);
    if(e.singleton){if(!this._s.has(name))this._s.set(name,e.factory(this));return this._s.get(name)}
    return e.factory(this)}
  has(name){return this._r.has(name)}
}`,
      testCode: `var c=new DIContainer();
c.register('config',function(){return{port:3000}},{singleton:true});
c.register('logger',function(){return{log:function(){}}});
var cfg1=c.resolve('config');
var cfg2=c.resolve('config');
if(cfg1!==cfg2) throw new Error('singleton should return same instance');
var l1=c.resolve('logger');
var l2=c.resolve('logger');
if(l1===l2) throw new Error('non-singleton should return new instance');
if(!c.has('config')||c.has('missing')) throw new Error('has check');
try{c.resolve('missing');throw new Error('no')}catch(e){if(e.message==='no')throw e}`,
      language: 'javascript',
      description: 'Dependency injection container with singleton support and factory resolution',
      tags: ['di', 'dependency-injection', 'container', 'ioc', 'design-pattern', 'factory', 'singleton'],
      patternType: 'design-pattern',
    },

    // ─── 9. Bloom Filter (Data Structure) ───
    {
      name: 'bloom-filter',
      code: `class BloomFilter{
  constructor(sz,hc){this.sz=sz;this.hc=hc;this.b=new Uint8Array(sz);this.count=0}
  _hashes(item){var s=''+item,r=[];
    for(var i=0;i<this.hc;i++){var h=0;
      for(var j=0;j<s.length;j++)h=((h<<5)-h+s.charCodeAt(j)*(i+1))|0;
      r.push((h<0?-h:h)%this.sz)}return r}
  add(item){var b=this.b;this._hashes(item).forEach(function(i){b[i]=1});this.count++}
  mightContain(item){var b=this.b;return this._hashes(item).every(function(i){return b[i]===1})}
  falsePositiveRate(){var s=0;for(var i=0;i<this.sz;i++)if(this.b[i])s++;
    return Math.pow(s/this.sz,this.hc)}
}`,
      testCode: `var bf=new BloomFilter(1000,3);
bf.add('hello');bf.add('world');
if(!bf.mightContain('hello')) throw new Error('added item missing');
if(!bf.mightContain('world')) throw new Error('second item missing');
var fp=0;
for(var i=0;i<100;i++){if(bf.mightContain('test'+i))fp++}
if(fp>20) throw new Error('too many false positives: '+fp);
var rate=bf.falsePositiveRate();
if(typeof rate!=='number'||rate<0||rate>1) throw new Error('rate out of bounds');`,
      language: 'javascript',
      description: 'Bloom filter with configurable size and hash count for probabilistic membership testing',
      tags: ['bloom-filter', 'data-structure', 'probabilistic', 'set', 'hash', 'membership'],
      patternType: 'data-structure',
    },

    // ─── 10. Pub/Sub (Design Pattern) ───
    {
      name: 'pub-sub',
      code: `class PubSub{
  constructor(){this._subs=new Map()}
  subscribe(topic,handler){
    if(!this._subs.has(topic))this._subs.set(topic,new Set());
    this._subs.get(topic).add(handler);var self=this;
    return function(){var h=self._subs.get(topic);if(h){h.delete(handler);if(!h.size)self._subs.delete(topic)}}}
  publish(topic,data){
    for(var e of this._subs){var p=e[0],h=e[1];
      if(p===topic||p==='*'||(p.includes('*')&&new RegExp('^'+p.split('*').join('.*')+'$').test(topic)))
        h.forEach(function(fn){fn(data,topic)})}}
  topics(){return Array.from(this._subs.keys())}
}`,
      testCode: `var ps=new PubSub();
var msgs=[];
var unsub=ps.subscribe('chat',function(d){msgs.push(d)});
ps.publish('chat','hello');
ps.publish('chat','world');
if(msgs.length!==2||msgs[0]!=='hello') throw new Error('basic pub/sub');
unsub();
ps.publish('chat','gone');
if(msgs.length!==2) throw new Error('unsubscribe failed');
var wild=[];
ps.subscribe('*',function(d){wild.push(d)});
ps.publish('anything','test');
if(wild.length!==1) throw new Error('wildcard');
if(!ps.topics().includes('*')) throw new Error('topics list');`,
      language: 'javascript',
      description: 'Publish-subscribe system with wildcard topic matching and unsubscribe support',
      tags: ['pub-sub', 'pubsub', 'event', 'design-pattern', 'message', 'wildcard', 'topic'],
      patternType: 'design-pattern',
    },
  ];
}

module.exports = { getProductionSeeds2 };
