/**
 * True Beauty WebGL2 compositor.
 * Portions adapted from OpenMakeupSDK assets/shaders/lip/fragment.glsl,
 * blush/fragment.glsl, eyeshadow/fragment.glsl and foundation/fragment.glsl.
 * Copyright (c) 2026 Ehsan Moradi; MIT, LICENSE.OpenMakeupSDK.
 * Replaced asset-space alpha with shared landmark masks. Camera luminance is retained;
 * Fresnel and simplex-noise materials now share light response and bounded highlights.
 */
export const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
out vec2 vUv;
void main(){gl_Position=vec4(aPosition,0.,1.);vUv=vec2(aPosition.x*.5+.5,.5-aPosition.y*.5);}`;
export const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 vUv;out vec4 outColor;
uniform sampler2D uSource;uniform sampler2D uMasks0;uniform sampler2D uMasks1;uniform sampler2D uMasks2;uniform sampler2D uMasks3;uniform sampler2D uHair;uniform sampler2D uOcclusion;
uniform vec4 uColors[12];uniform float uFinish[12];uniform vec3 uHairColor;uniform vec3 uHairSecond;
uniform vec4 uHairBounds;uniform float uHairOpacity;uniform float uHairMode;uniform vec2 uTexel;uniform float uCompare;uniform float uTime;
uniform vec2 uFaceCenter;uniform vec2 uFaceSize;uniform float uReshape;
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
// OpenMakeupSDK's simplex material noise, retained rather than a screen-space random overlay.
float snoise(vec2 v){
 const vec4 C=vec4(.211324865405187,.366025403784439,-.577350269189626,.024390243902439);
 vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=x0.x>x0.y?vec2(1,0):vec2(0,1);
 vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);
 vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
 vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.);m*=m;m*=m;
 vec3 x=2.*fract(p*C.www)-1.;vec3 h=abs(x)-.5;vec3 ox=floor(x+.5);vec3 a0=x-ox;
 m*=1.79284291400159-.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.*dot(m,g);
}
float luminance(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
vec3 naturalTint(vec3 base,vec3 color,float coverage){
 float light=luminance(base);float pigment=max(.12,luminance(color));
 // Soft-light tint keeps local texture, highlights and low-light dimensionality.
 vec3 tint=color*(.35+.65*light)/sqrt(pigment+.08);
 return mix(base,clamp(tint,0.,1.),coverage);
}
void main(){
 vec2 uv=vUv;
 vec2 local=(uv-uFaceCenter)/max(uFaceSize,vec2(.01));
 // Explicit optional geometric preview: inverse-sample a bounded jaw warp.
 float warp=exp(-dot(local*vec2(1.6,1.8),local*vec2(1.6,1.8)))*smoothstep(-.05,.7,local.y);
 uv.x+=(uv.x-uFaceCenter.x)*warp*uReshape*.10;
 vec3 original=texture(uSource,vUv).rgb;vec3 base=texture(uSource,uv).rgb;
 if(uCompare>=0.&&vUv.x<uCompare){outColor=vec4(original,1);return;}
 vec4 m0=texture(uMasks0,uv),m1=texture(uMasks1,uv),m2=texture(uMasks2,uv),m3=texture(uMasks3,uv);
 float masks[12]=float[12](m0.r,m0.g,m0.b,m1.r,m1.g,m1.b,m2.r,m2.g,m2.b,m3.r,m3.g,m3.b);
 float coverageSum=0.;for(int i=0;i<12;i++)coverageSum+=masks[i]*uColors[i].a;
 float hair=texture(uHair,uv).r*uHairOpacity;
 if(coverageSum+hair<.002&&abs(uReshape)<.001){outColor=vec4(original,1.);return;}
 float light=luminance(base);float gx=luminance(texture(uSource,uv+vec2(uTexel.x,0)).rgb)-light;
 float gy=luminance(texture(uSource,uv+vec2(0,uTexel.y)).rgb)-light;
 vec3 normal=normalize(vec3(-gx*12.,-gy*12.,1.));vec3 view=normalize(vec3((uv-uFaceCenter)*.4,1.));
 float fresnel=.8*pow(max(1.-dot(normal,view),.0001),.5);
 float noise=snoise((uv-uFaceCenter)/max(uFaceSize,vec2(.01))*70.);
 for(int i=0;i<12;i++){
  float alpha=clamp(masks[i]*uColors[i].a,0.,1.);if(alpha<.001)continue;
  vec3 tint=naturalTint(base,uColors[i].rgb,alpha);
  if(i==3){alpha*=.85+.15*fresnel;tint=mix(base,mix(uColors[i].rgb,base,.76),alpha);}
  if(i==4||i==5||i==6||i==10){tint=mix(base,base*uColors[i].rgb,alpha);}
  float finish=uFinish[i];
  if(finish>.5){
   float spec=pow(max(dot(normal,normalize(vec3(-.32,-.45,1.))),0.),36.);
   if(finish<1.5)tint+=vec3(spec*.16+fresnel*.08)*alpha;
   else if(finish<2.5)tint+=vec3(max(0.,noise)*.10+spec*.13)*alpha;
   else tint+=vec3(step(.75,noise)*.45+spec*.12)*alpha;
  }
  base=clamp(tint,0.,1.);
 }
 if(hair>.002){
  float hairY=clamp((uv.y-uHairBounds.y)/max(.01,uHairBounds.w-uHairBounds.y),0.,1.);float factor=0.;if(uHairMode>.5&&uHairMode<1.5)factor=smoothstep(.15,.85,hairY);
  if(uHairMode>1.5&&uHairMode<2.5)factor=smoothstep(.4,.8,snoise(uv*vec2(80.,2.))*.5+.5);
  if(uHairMode>2.5)factor=smoothstep(.15,.85,hairY)*(.65+.35*snoise(uv*vec2(45.,4.)));
  base=naturalTint(base,mix(uHairColor,uHairSecond,factor),hair*.85);
 }
 base=mix(base,original,texture(uOcclusion,vUv).r);
 outColor=vec4(base,1.);
}`;
