import * as THREE from 'three';
/** GPU-only masks over the computed board. Glyphs remain full-resolution; no full texture upload per reveal frame. */
export const boardVertex = `varying vec2 boardUv; void main(){boardUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
export const boardFragment = `
uniform sampler2D map;
uniform sampler2D numbers;
uniform float timeMs;
uniform float durationMs;
uniform float operation;
uniform float revealCount;
uniform vec4 revealRects[8];
uniform vec4 valueRect;
uniform vec4 highlightRect;
uniform vec2 valueFrom;
uniform vec2 valueTo;
uniform vec3 paper;
uniform vec3 connectionColor;
uniform float weightBefore;
uniform float weightAfter;
varying vec2 boardUv;
float eased(float x){x=clamp(x,0.0,1.0);return x*x*x*(x*(x*6.0-15.0)+10.0);}
float part(float start,float span){return eased((timeMs-start)/span);}
bool inside(vec2 p,vec4 r){return p.x>=r.x&&p.x<=r.x+r.z&&p.y>=r.y&&p.y<=r.y+r.w;}
vec3 rowColor(vec2 p,vec4 r,float row){vec2 local=(p-r.xy)/r.zw;return texture2D(numbers,vec2(local.x,1.0-(row+local.y)/4.0)).rgb;}
void main(){
 vec2 p=vec2(boardUv.x*1600.0,(1.0-boardUv.y)*900.0);
 vec3 color=texture2D(map,boardUv).rgb;
 float mask=1.0;
 if(operation==1.0){
  if(inside(p,vec4(120.0,380.0,360.0,140.0)))mask=part(0.0,250.0);
  if(inside(p,vec4(479.0,445.0,633.0,10.0)))mask*=step(p.x,480.0+630.0*part(250.0,500.0));
  if(inside(p,vec4(575.0,382.0,450.0,138.0))){
   vec3 behind=paper;
   if(abs(p.y-450.0)<1.0+weightAfter&&p.x<=480.0+630.0*part(250.0,500.0))behind=connectionColor;
   color=mix(behind,color,part(750.0,200.0));mask=1.0;
  }
  if(inside(p,vec4(1145.0,380.0,310.0,140.0)))mask=part(1000.0,250.0);
  if(inside(p,vec4(125.0,545.0,1350.0,200.0)))mask=part(1150.0,300.0);
 }
 if(operation==2.0){for(int i=0;i<8;i++){if(float(i)<revealCount&&inside(p,revealRects[i]))mask=part(200.0,350.0);}if(p.x>=1050.0&&p.x<=1100.0&&((abs(p.y-450.0)<4.0)||(abs(p.y-585.0)<4.0)))mask*=step(p.x,1050.0+50.0*part(0.0,400.0));}
 color=mix(paper,color,mask);
 float progress=durationMs>0.0?eased(timeMs/durationMs):1.0;
 if(operation==3.0&&timeMs<durationMs&&valueRect.z>0.0){vec2 center=mix(valueFrom,valueTo,progress);vec4 dst=vec4(center-valueRect.zw*0.5,valueRect.zw);if(inside(p,dst)){vec2 source=valueRect.xy+(p-dst.xy);vec3 value=texture2D(map,vec2(source.x/1600.0,1.0-source.y/900.0)).rgb;float alpha=smoothstep(0.0,0.12,progress)*(1.0-smoothstep(0.85,1.0,progress));color=mix(color,value,alpha);}}
 if(operation==4.0&&timeMs<durationMs){
  vec4 weight=vec4(589.0,391.0,422.0,117.0),outRect=vec4(1159.0,391.0,282.0,117.0),calculation=vec4(130.0,550.0,1340.0,80.0),error=vec4(130.0,650.0,1340.0,90.0);
  if(inside(p,weight))color=rowColor(p,weight,0.0);if(inside(p,outRect))color=rowColor(p,outRect,1.0);if(inside(p,calculation))color=rowColor(p,calculation,2.0);if(inside(p,error))color=rowColor(p,error,3.0);
  if(p.x>=480.0&&p.x<=1110.0&&!inside(p,vec4(575.0,382.0,450.0,138.0))&&abs(p.y-450.0)<6.0){float t=clamp(timeMs/durationMs,0.0,1.0);float weightNow=mix(weightBefore,weightAfter,t*t*(3.0-2.0*t));float lineAlpha=1.0-smoothstep(weightNow+0.5,weightNow+1.5,abs(p.y-450.0));color=mix(paper,connectionColor,lineAlpha);}
 }
 if(operation==5.0&&timeMs<durationMs&&inside(p,highlightRect))color=mix(paper,color,0.65+0.35*progress);
 gl_FragColor=vec4(color,1.0);
 #include <colorspace_fragment>
}`;
export function boardUniforms(map: THREE.Texture, numbers: THREE.Texture) {
  return {
    map: { value: map },
    numbers: { value: numbers },
    timeMs: { value: 0 },
    durationMs: { value: 0 },
    operation: { value: 0 },
    revealCount: { value: 0 },
    revealRects: {
      value: Array.from({ length: 8 }, () => new THREE.Vector4()),
    },
    valueRect: { value: new THREE.Vector4() },
    highlightRect: { value: new THREE.Vector4() },
    valueFrom: { value: new THREE.Vector2() },
    valueTo: { value: new THREE.Vector2() },
    paper: { value: new THREE.Color('#f8f9f2') },
    connectionColor: { value: new THREE.Color('#a6bcb2') },
    weightBefore: { value: 0.5 },
    weightAfter: { value: 0.5 },
  };
}
