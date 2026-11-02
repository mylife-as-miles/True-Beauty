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
uniform mat2 uFaceBasis;uniform vec4 uLipData;uniform vec4 uLipBands;uniform vec4 uEyeData;uniform vec2 uHeadTilt;
uniform vec3 uLightDirection;uniform vec3 uSpecularColor;uniform float uLightStrength;
uniform vec3 uGradeTint;uniform float uGradeAmount;uniform vec2 uImageLightDirection;
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
vec2 hash22(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
vec3 creativeGrade(vec3 color,vec2 uv){
 if(uGradeAmount<.0001)return color;
 float directional=((uv.x-.5)*-uImageLightDirection.x+(uv.y-.5)*-uImageLightDirection.y)*.12;
 return clamp(color*mix(vec3(1.),uGradeTint,uGradeAmount)*(1.+directional*uGradeAmount),0.,1.);
}
vec3 regionalNormal(vec2 faceUv,int layer){
 vec2 n;
 if(layer==0||layer==10||layer==11){bool upper=faceUv.y<uLipData.y;float center=upper?uLipBands.x:uLipBands.y,radius=upper?uLipBands.z:uLipBands.w;n=vec2((faceUv.x-uLipData.x)/max(.01,uLipData.z)*.25,(faceUv.y-center)/max(.012,radius)*.52);}
 else if(layer==2){vec2 eye=abs(faceUv.x-uEyeData.x)<abs(faceUv.x-uEyeData.z)?uEyeData.xy:uEyeData.zw;n=(faceUv-eye)/vec2(.28,.12)*vec2(.3,.48);}
 else n=vec2(faceUv.x*.6,(faceUv.y-.24)*.38);
 return normalize(vec3(n+uHeadTilt,1.));
}
void main(){
 vec2 uv=vUv;
 vec2 local=(uv-uFaceCenter)/max(uFaceSize,vec2(.01));
 // Explicit optional geometric preview: inverse-sample a bounded jaw warp.
 float warp=exp(-dot(local*vec2(1.6,1.8),local*vec2(1.6,1.8)))*smoothstep(-.05,.7,local.y);
 uv.x+=(uv.x-uFaceCenter.x)*warp*uReshape*.10;
 vec3 original=texture(uSource,vUv).rgb;vec3 base=creativeGrade(texture(uSource,uv).rgb,uv);
 if(uCompare>=0.&&vUv.x<uCompare){outColor=vec4(original,1);return;}
 vec4 m0=texture(uMasks0,uv),m1=texture(uMasks1,uv),m2=texture(uMasks2,uv),m3=texture(uMasks3,uv);
 float masks[12]=float[12](m0.r,m0.g,m0.b,m1.r,m1.g,m1.b,m2.r,m2.g,m2.b,m3.r,m3.g,m3.b);
 float coverageSum=0.;for(int i=0;i<12;i++)coverageSum+=masks[i]*uColors[i].a;
 float hair=texture(uHair,uv).r*uHairOpacity;
 if(coverageSum+hair<.002&&abs(uReshape)<.001){outColor=vec4(creativeGrade(original,vUv),1.);return;}
 float light=luminance(base);float gx=luminance(texture(uSource,uv+vec2(uTexel.x,0)).rgb)-light;
 float gy=luminance(texture(uSource,uv+vec2(0,uTexel.y)).rgb)-light;
 vec2 faceUv=uFaceBasis*(uv-uFaceCenter);
 vec3 halfVector=normalize(uLightDirection+vec3(0.,0.,1.));
 // Source-derived image detail perturbs the regional surface very gently. It never
 // blurs the photograph or creates a skin assessment from a cosmetic preview.
 vec2 micro=vec2(-gx,-gy)*2.2;
 float noise=snoise(faceUv*110.);
 for(int i=0;i<12;i++){
  float alpha=clamp(masks[i]*uColors[i].a,0.,1.);if(alpha<.001)continue;
  vec3 n=regionalNormal(faceUv,i);n=normalize(vec3(n.xy+micro,n.z));
  vec3 tint=naturalTint(base,uColors[i].rgb,alpha);
  float fresnel=.8*pow(max(1.-n.z,.0001),.5);
  if(i==3){alpha*=.9;tint=mix(base,mix(uColors[i].rgb,base,.76),alpha);}
  if(i==4||i==5||i==6||i==10)tint=mix(base,base*uColors[i].rgb,alpha);
  if(i==11)tint=naturalTint(base,uColors[i].rgb,alpha*.2);
  float finish=uFinish[i],ndh=max(dot(n,halfVector),0.);
  if(finish<.5&&(i==0||i==3))tint*=1.-smoothstep(.35,.8,luminance(base))*alpha*.075;
  if(finish>.5){
   float spec=pow(ndh,finish<1.5?38.:18.);
   if(finish<1.5)tint+=uSpecularColor*(spec*.42+pow(max(n.z,0.),14.)*.13+fresnel*.025)*alpha*uLightStrength;
   else{
    float density=finish<2.5?112.:72.;vec2 materialUv=faceUv;
    if(i==0||i==10||i==11)materialUv=(faceUv-uLipData.xy)/max(uLipData.zw,vec2(.01))*vec2(.25,.08);
    vec2 cell=floor(materialUv*density),random=hash22(cell);
    vec2 delta=fract(materialUv*density)-(.2+random*.6);
    float grain=smoothstep(finish<2.5?.12:.2,finish<2.5?.035:.055,length(delta))*step(finish<2.5?.82:.78,random.x);
    float flake=grain*(finish<2.5?.32:.78)*(.24+.76*pow(ndh,finish<2.5?18.:56.));
    float pearl=max(0.,noise)*.018+spec*(finish<2.5?.065:.025)+pow(max(n.z,0.),8.)*(finish<2.5?.035:.012);
    tint+=uSpecularColor*(flake+pearl)*alpha*uLightStrength;
   }
  }
  base=clamp(tint,0.,1.);
 }
 if(hair>.002){
  float hairY=clamp((uv.y-uHairBounds.y)/max(.01,uHairBounds.w-uHairBounds.y),0.,1.);float factor=0.;if(uHairMode>.5&&uHairMode<1.5)factor=smoothstep(.15,.85,hairY);
  if(uHairMode>1.5&&uHairMode<2.5)factor=smoothstep(.4,.8,snoise(uv*vec2(80.,2.))*.5+.5);
  if(uHairMode>2.5)factor=smoothstep(.15,.85,hairY)*(.65+.35*snoise(uv*vec2(45.,4.)));
  base=naturalTint(base,mix(uHairColor,uHairSecond,factor),hair*.85);
 }
 base=mix(base,creativeGrade(original,vUv),texture(uOcclusion,vUv).r);
 outColor=vec4(base,1.);
}`;
