import fs from 'node:fs';
const gj = JSON.parse(fs.readFileSync('C:/tmp/terrain-geojson','utf8'));
function orient(a,b,c){return Math.sign((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));}
function onSeg(a,b,c){return Math.min(a[0],b[0])-1e-9<=c[0]&&c[0]<=Math.max(a[0],b[0])+1e-9&&Math.min(a[1],b[1])-1e-9<=c[1]&&c[1]<=Math.max(a[1],b[1])+1e-9;}
function inter(a,b,c,d){const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);if(o1!==o2&&o3!==o4)return true;if(o1===0&&onSeg(a,b,c))return true;if(o2===0&&onSeg(a,b,d))return true;if(o3===0&&onSeg(c,d,a))return true;if(o4===0&&onSeg(c,d,b))return true;return false;}
let self=0, open=0, degen=0, maxPts=0, total=0;
for (const f of gj.features) {
  if (!/Polygon/.test(f.geometry.type)) continue;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const rings of polys) {
    total += rings.length;
    for (const ring of rings) {
      maxPts = Math.max(maxPts, ring.length);
      const a = ring[0], b = ring.at(-1);
      if (a[0]!==b[0]||a[1]!==b[1]) open++;
      if (ring.length < 4) degen++;
      for (let i=0;i<ring.length-1;i++) for (let j=i+2;j<ring.length-1;j++) {
        if (i===0 && j===ring.length-2) continue;
        if (inter(ring[i],ring[i+1],ring[j],ring[j+1])) { self++; if (self<5) console.log('self', f.properties.type, i,j); }
      }
    }
  }
}
console.log({features:gj.features.length, rings:total, open, self, degen, maxPts});
