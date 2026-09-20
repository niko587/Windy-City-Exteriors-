export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x:number,y:number,z:number):number{
  let h=Math.imul(x,374761393)^Math.imul(y,668265263)^Math.imul(z,2147483647);
  h=Math.imul(h^(h>>>13),1274126177);
  return ((h^(h>>>16))>>>0)/4294967296;
}

const fade=(t:number)=>t*t*(3-2*t);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

export function noise3(x:number,y:number,z:number):number{
  const xi=Math.floor(x), yi=Math.floor(y), zi=Math.floor(z);
  const u=fade(x-xi), v=fade(y-yi), w=fade(z-zi);
  const c=(dx:number,dy:number,dz:number)=>hash3(xi+dx,yi+dy,zi+dz);
  return mix(mix(mix(c(0,0,0),c(1,0,0),u),mix(c(0,1,0),c(1,1,0),u),v),
             mix(mix(c(0,0,1),c(1,0,1),u),mix(c(0,1,1),c(1,1,1),u),v),w);
}

export function fbm3(x:number,y:number,z:number,octaves=4):number{
  let amp=.5,freq=1,sum=0,norm=0;
  for(let i=0;i<octaves;i++){ sum+=amp*noise3(x*freq,y*freq,z*freq); norm+=amp; amp*=.5; freq*=2.03; }
  return sum/norm;
}

export function tileNoise2(x:number,y:number,periodX:number,periodY:number,seed=0):number{
  const xi=Math.floor(x), yi=Math.floor(y), u=fade(x-xi), v=fade(y-yi);
  const wrap=(n:number,p:number)=>((n%p)+p)%p;
  const c=(dx:number,dy:number)=>hash3(wrap(xi+dx,periodX),wrap(yi+dy,periodY),seed);
  return mix(mix(c(0,0),c(1,0),u),mix(c(0,1),c(1,1),u),v);
}

export function tileFbm2(x:number,y:number,periodX:number,periodY:number,octaves=4,seed=0):number{
  let amp=.5,sum=0,norm=0,f=1;
  for(let i=0;i<octaves;i++){ sum+=amp*tileNoise2(x*f,y*f,periodX*f,periodY*f,seed+i*17); norm+=amp; amp*=.5; f*=2; }
  return sum/norm;
}
