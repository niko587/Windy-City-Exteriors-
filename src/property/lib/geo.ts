import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export interface Placement {
  at?: [number, number, number];
  rot?: [number, number, number];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

export function place<T extends THREE.BufferGeometry>(g: T, p?: Placement): T {
  if (!p) return g;
  const [rx, ry, rz] = p.rot ?? [0, 0, 0];
  const [x, y, z] = p.at ?? [0, 0, 0];
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
  return g;
}

export function box(w: number, h: number, d: number, p?: Placement): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const scale: [number, number][] = [[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for (let face = 0; face < 6; face++) {
    const [su, sv] = scale[face];
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  return place(g, p);
}

export function boxFrom(x:number,y:number,z:number,w:number,h:number,d:number):THREE.BufferGeometry{
  return box(w,h,d,{at:[x+w/2,y+h/2,z+d/2]});
}

export function cyl(rTop:number,rBottom:number,h:number,seg=16,p?:Placement):THREE.BufferGeometry{
  return place(new THREE.CylinderGeometry(rTop,rBottom,h,seg),p);
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 0) return new THREE.BufferGeometry();
  const flat = parts.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(n.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
    }
    n.morphAttributes = {};
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('Geometry merge failed');
  for (const g of parts) g.dispose();
  return merged;
}

export function roundedRectShape(x:number,y:number,w:number,h:number,r:number):THREE.Shape{
  const s=new THREE.Shape();
  s.moveTo(x+r,y); s.lineTo(x+w-r,y); s.quadraticCurveTo(x+w,y,x+w,y+r);
  s.lineTo(x+w,y+h-r); s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  s.lineTo(x+r,y+h); s.quadraticCurveTo(x,y+h,x,y+h-r);
  s.lineTo(x,y+r); s.quadraticCurveTo(x,y,x+r,y); return s;
}

export interface Opening { u:number; y:number; w:number; h:number; }
export interface WallOutline { width:number; y0:number; y1:number; gable?:{peakY:number; peakU?:number}; }

export function wallGeometry(outline:WallOutline,openings:Opening[]):THREE.BufferGeometry{
  const {width,y0,y1,gable}=outline;
  const shape=new THREE.Shape();
  const notches=openings.filter(o=>o.y<=y0+1e-3).sort((a,b)=>a.u-b.u);
  const holes=openings.filter(o=>o.y>y0+1e-3);
  shape.moveTo(0,y0);
  for(const n of notches){
    shape.lineTo(n.u-n.w/2,y0); shape.lineTo(n.u-n.w/2,n.y+n.h);
    shape.lineTo(n.u+n.w/2,n.y+n.h); shape.lineTo(n.u+n.w/2,y0);
  }
  shape.lineTo(width,y0); shape.lineTo(width,y1);
  if(gable) shape.lineTo(gable.peakU??width/2,gable.peakY);
  shape.lineTo(0,y1); shape.closePath();
  for(const o of holes){
    const path=new THREE.Path(); const l=o.u-o.w/2; const r=o.u+o.w/2;
    path.moveTo(l,o.y); path.lineTo(l,o.y+o.h); path.lineTo(r,o.y+o.h); path.lineTo(r,o.y); path.closePath();
    shape.holes.push(path);
  }
  return new THREE.ShapeGeometry(shape);
}
