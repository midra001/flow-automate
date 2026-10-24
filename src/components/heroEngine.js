import * as THREE from 'three';
import {originalCubeData} from './originalCubeData.js';
import {createOriginalCubeMaterial} from './originalCubeMaterial.js';

// Uses decoded original hero-cube geometry, its original UVs and scene material settings.
export const HERO_DEFAULTS = {
  background: true,
  digital: false,
  rotationSpeed: -0.075,
  tilt: 0.23,
  yaw: 0.25,
  pitch: 0.22,
  size: 1,
  pixelRatio: 1.75,
  assetBase: null,
  layout: 'standalone', // 'landing' positions the cube beside the page copy.
};

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeCubeGeometry(){
  const geometry=new THREE.BufferGeometry();
  const attributeNames={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',TEXCOORD_2:'uv2',CARVE_SHADE:'aCarveShade'};
  for(const [semantic,data] of Object.entries(originalCubeData.attributes)){
    geometry.setAttribute(attributeNames[semantic],new THREE.Float32BufferAttribute(data.values,data.itemSize));
  }
  geometry.setIndex(originalCubeData.indices);
  geometry.computeBoundingBox();
  const size=geometry.boundingBox.getSize(new THREE.Vector3());
  const center=geometry.boundingBox.getCenter(new THREE.Vector3());
  geometry.translate(-center.x,-center.y,-center.z);
  geometry.scale(2/size.x,2/size.x,2/size.x);
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}

const backgroundVertex = `
  varying vec2 vUv;
  void main() { vUv=uv; gl_Position=vec4(position.xy,0.9999,1.0); }
`;

const backgroundFragment = `
  uniform vec2 uResolution;
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
  void main() {
    vec2 uv = vUv;
    vec2 p = (uv-vec2(0.52,0.26))*vec2(uResolution.x/uResolution.y,1.0);
    float halo = exp(-dot(p,p)*3.6);
    vec3 color = mix(vec3(0.005,0.0015,0.009),vec3(0.075,0.014,0.14),halo);
    color += vec3(0.008,0.002,0.013)*exp(-pow((uv.y-0.48)*3.0,2.0));
    float leftRidge = 0.065+0.25*pow(1.0-uv.x,4.0)+sin(uv.x*27.0)*0.003;
    float rightRidge = 0.060+0.20*pow(uv.x,6.0)+sin(uv.x*19.0)*0.005;
    float ridge = max(leftRidge,rightRidge);
    float dune = 1.0-smoothstep(ridge-0.001,ridge+0.001,uv.y);
    color = mix(color,vec3(0.004,0.001,0.009),dune);
    float frontRidge = max(0.065+0.145*pow(1.0-uv.x,5.0),0.055+0.15*pow(uv.x,8.0));
    float frontDune = 1.0-smoothstep(frontRidge-0.002,frontRidge+0.002,uv.y);
    float grain = hash(floor(uv*uResolution));
    vec3 sand = mix(vec3(0.031,0.005,0.075),vec3(0.19,0.025,0.38),smoothstep(0.04,0.20,uv.y));
    sand *= 0.65 + grain*0.65;
    color = mix(color,sand,frontDune);
    float water = 1.0-smoothstep(0.072,0.076,uv.y);
    float line = pow(0.5+0.5*sin(uv.y*uResolution.y*1.9+sin(uv.x*42.0+uTime*0.16)*2.0),14.0);
    float streak = pow(hash(vec2(floor(uv.x*25.0+sin(uv.y*700.0)*3.0),floor(uv.y*650.0))),2.0);
    vec3 waterColor = vec3(0.005,0.001,0.011)+vec3(0.035,0.007,0.070)*line*streak;
    color = mix(color,waterColor,water);
    color += (grain-0.5)*0.0013;
    gl_FragColor=vec4(max(color,vec3(0.0)),1.0);
    #include <colorspace_fragment>
  }
`;

/** Mount the same scene in a browser or a React Native Web host element. */
export function createHeroScene(container, options = {}) {
  const config = { ...HERO_DEFAULTS, ...options };
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: !config.background, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, config.pixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, config.background ? 1 : 0);
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 60);
  camera.position.set(0, 0, 7.8);
  const material=createOriginalCubeMaterial();
  const uniforms=material.uniforms;
  uniforms.uDigital.value=config.digital?1:0;
  const cube = new THREE.Mesh(makeCubeGeometry(), material);
  const tilt = new THREE.Group();
  tilt.rotation.z = config.tilt;
  tilt.add(cube);
  scene.add(tilt);
  const backgroundUniforms = { uTime:{value:0}, uResolution:{value:new THREE.Vector2(1,1)} };
  let backdrop;
  if (config.background) {
    backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      uniforms:backgroundUniforms,vertexShader:backgroundVertex,fragmentShader:backgroundFragment,
      depthTest:false, depthWrite:false, toneMapped:false,
    }));
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -100;
    scene.add(backdrop);
  }

  const random = randomGenerator(445);
  const dustPositions = [], dustSizes = [], dustOpacity = [];
  for (let i=0; i<340; i++) {
    dustPositions.push((random()-0.5)*11, -1.6+Math.pow(random(),3.0)*4.5, -1.7-random()*2.0);
    dustSizes.push(0.6+Math.pow(random(),6)*3.1);
    dustOpacity.push(0.15+random()*0.60);
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute('position',new THREE.Float32BufferAttribute(dustPositions,3));
  dustGeometry.setAttribute('aSize',new THREE.Float32BufferAttribute(dustSizes,1));
  dustGeometry.setAttribute('aOpacity',new THREE.Float32BufferAttribute(dustOpacity,1));
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms:{ uTime:{value:0},uDpr:{value:renderer.getPixelRatio()} },
    vertexShader:`attribute float aSize; attribute float aOpacity; uniform float uTime; uniform float uDpr; varying float vOpacity;
      void main(){ vec3 p=position; p.x+=sin(uTime*0.12+position.y*3.0)*0.018; vOpacity=aOpacity; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); gl_PointSize=aSize*uDpr; }`,
    fragmentShader:`varying float vOpacity; void main(){ float d=length(gl_PointCoord-0.5); float a=(1.0-smoothstep(0.25,0.5,d))*vOpacity; gl_FragColor=vec4(0.68,0.38,1.0,a); }`,
    transparent:true, depthWrite:false, toneMapped:false,
  });
  const dust = new THREE.Points(dustGeometry,dustMaterial);
  scene.add(dust);

  let disposed=false, paused=false, hidden=false, elapsed=0, previous=null, raf=0, pulseStart=-100;
  const originalTextures=[];
  const textureLoader=new THREE.TextureLoader();
  const ready=config.assetBase ? Promise.all([
    ['tGrid','hero-cube-grid.png'],['tEdges','hero-cube-edges.png'],
    ['tDetails','hero-cube-details.png'],['tRevealPattern','hero-cube-hex.png'],['tAO','hero-cube-ao.png'],
  ].map(async ([uniform,file])=>{
    try{
      const texture=await textureLoader.loadAsync(config.assetBase.replace(/\/$/,'')+'/'+file);
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.NoColorSpace;
      texture.flipY=false;
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
      uniforms[uniform].value=texture;
      originalTextures.push(texture);
    }catch(error){ console.warn('[HeroScene] Original texture unavailable; using generated fallback:',file); }
  })).then(()=>{}):Promise.resolve();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const onContextLost = event => { event.preventDefault(); cancelAnimationFrame(raf); options.onError?.(new Error('WebGL context lost. Remount the scene to restore it.')); };
  renderer.domElement.addEventListener('webglcontextlost',onContextLost);
  function resize() {
    const width=Math.max(container.clientWidth,1), height=Math.max(container.clientHeight,1);
    camera.aspect=width/height;
    // Fit by the tighter axis so the cube is not cropped on phone screens.
    const viewHeight=2*camera.position.z*Math.tan(THREE.MathUtils.degToRad(camera.fov*0.5));
    const viewWidth = viewHeight * camera.aspect;
    const landing = config.layout === 'landing';
    const wide = width >= 1000;
    // Preserve the test cube's proportions, fitting it into the right-hand region.
    // This is framing only: geometry, UVs, colours and material remain unchanged.
    const regionWidth = landing ? viewWidth * (wide ? 0.48 : 0.66) : viewWidth;
    const scale = Math.min(viewHeight * 0.245, regionWidth * (landing ? 0.23 : 0.32)) * config.size;
    tilt.scale.setScalar(scale);
    tilt.position.set(
      viewWidth * (landing ? (wide ? 0.26 : 0.22) : 0.040),
      viewHeight * 0.045,
      0
    );
    camera.updateProjectionMatrix();
    renderer.setSize(width,height,false);
    backgroundUniforms.uResolution.value.set(width,height);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  function onVisibility(){hidden=document.hidden;previous=null;}
  document.addEventListener('visibilitychange',onVisibility);
  function draw(now) {
    if(disposed)return;
    raf=requestAnimationFrame(draw);
    const dt=previous===null?0:Math.min((now-previous)/1000,0.05);
    previous=now;
    if(hidden)return;
    if(!paused&&!reducedMotion.matches)elapsed+=dt;
    uniforms.uTime.value=elapsed;
    const pulseAge=(now-pulseStart)/1000;
    uniforms.uPulse.value=pulseAge<1?Math.sin(Math.max(0,pulseAge)*Math.PI):0;
    cube.rotation.set(config.pitch,config.yaw+elapsed*config.rotationSpeed,0);
    cube.position.y=Math.sin(elapsed*0.65)*0.035;
    backgroundUniforms.uTime.value=elapsed;
    dustMaterial.uniforms.uTime.value=elapsed;
    renderer.render(scene,camera);
  }
  resize();
  raf=requestAnimationFrame(draw);
  return {
    renderer, scene, camera, ready,
    pulse(){pulseStart=performance.now();},
    setDigital(value){uniforms.uDigital.value=value?1:0;},
    setPaused(value){paused=Boolean(value);},
    reset(){elapsed=0;previous=null;},
    dispose(){
      if(disposed)return;
      disposed=true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange',onVisibility);
      renderer.domElement.removeEventListener('webglcontextlost',onContextLost);
      cube.geometry.dispose();material.dispose();
      originalTextures.forEach(texture=>texture.dispose());
      dustGeometry.dispose();dustMaterial.dispose();
      if(backdrop){backdrop.geometry.dispose();backdrop.material.dispose();}
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
