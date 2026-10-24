import * as THREE from 'three';
const vertexShader="attribute float aCarveShade;\nvarying float vCarveShade;\n\n  #define PI 3.1415926535897932384626433832795\n\n  attribute vec2 uv1;\n  attribute vec2 uv2;\n\n  varying vec2 vUv;\n  varying vec2 vUv1;\n  varying vec2 vUv2;\n  varying vec3 vWorldNormal;\n varying vec3 vLocalNormal;\n  varying vec3 vPosition;\n  varying vec3 vViewPosition;\n  varying vec4 vWorldPosition;\n\n  uniform float uRotationSpeed;\n  uniform float uVerticalMovementSpeed;\n  uniform float uVerticalMovementAmount;\n  uniform float uTime;\n\n  mat3 rotate3D(float angle, vec3 axis) {\n    float s = sin(angle);\n    float c = cos(angle);\n    float oc = 1.0 - c;\n\n    return mat3(\n      oc * axis.x * axis.x + c,\n      oc * axis.x * axis.y - axis.z * s,\n      oc * axis.z * axis.x + axis.y * s,\n\n      oc * axis.x * axis.y + axis.z * s,\n      oc * axis.y * axis.y + c,\n      oc * axis.y * axis.z - axis.x * s,\n\n      oc * axis.z * axis.x - axis.y * s,\n      oc * axis.y * axis.z + axis.x * s,\n      oc * axis.z * axis.z + c\n    );\n  }\n\n  void main() {\n vCarveShade = aCarveShade;\n    vUv = uv;\n    vUv1 = uv1;\n    vUv2 = uv2;\n    vPosition = position;\n vLocalNormal = normal;\n\n    vec4 transformedPosition = vec4(position, 1.0);\n\n    mat3 rotationMatrix = rotate3D(\n      uTime * uRotationSpeed,\n      normalize(vec3(0.0, 1.0, 0.0))\n    );\n\n    transformedPosition.xyz =\n      rotationMatrix * transformedPosition.xyz;\n\n    transformedPosition.y +=\n      sin(uTime * uVerticalMovementSpeed + PI * 0.4)\n      * uVerticalMovementAmount;\n\n    vec4 worldPosition =\n      modelMatrix * transformedPosition;\n\n    vec4 mvPosition =\n      viewMatrix * worldPosition;\n\n    vWorldNormal = normalize(\n      mat3(viewMatrix) * mat3(modelMatrix) * rotationMatrix * normal\n    );\n\n    vWorldPosition = worldPosition;\n    vViewPosition = -mvPosition.xyz;\n\n    gl_Position = projectionMatrix * mvPosition;\n  }\n";
const fragmentShader="varying float vCarveShade;\n\n  #define PI 3.1415926535897932384626433832795\n\n  varying vec2 vUv;\n  varying vec2 vUv1;\n  varying vec2 vUv2;\n  varying vec3 vWorldNormal;\n varying vec3 vLocalNormal;\n uniform float uDigital;\n uniform float uPulse;\n  varying vec3 vPosition;\n  varying vec4 vWorldPosition;\n  varying vec3 vViewPosition;\n\n  uniform vec3 uSize;\n  uniform vec3 uBloomColor;\n\n  uniform sampler2D tAO;\n  uniform float uAoContrast;\n  uniform vec2 uAoSmoothstep;\n\n  uniform sampler2D tGrid;\n  uniform sampler2D tEdges;\n  uniform float uGridTextureScale;\n  uniform vec2 uGridTextureOffset;\n  uniform float uGridTextureContrast;\n  uniform float uGridTextureStrength;\n  uniform vec2 uGridTextureRemap;\n  uniform float uGridEdgesContrast;\n  uniform vec2 uGridEdgesThresholds;\n  uniform float uGridEdgesStrength;\n\n  uniform sampler2D tDetails;\n  uniform float uDetailsScale;\n  uniform float uDetailsContrast;\n  uniform float uDetailsStrength;\n\n  uniform float uContrast;\n  uniform float uFresnelAmount;\n  uniform float uFresnelOffset;\n  uniform float uFresnelFalloff;\n  uniform float uFresnelAddition;\n\n  uniform float uTime;\n  uniform vec2 uGradientNoiseScale;\n  uniform float uGradientNoiseSpeed;\n  uniform float uGradientNoiseContrast;\n\n  uniform sampler2D tNoise1;\n  uniform sampler2D tNoise2;\n  uniform vec2 uNoiseTextureScale;\n  uniform float uNoiseTextureContrast;\n  uniform float uNoiseTextureStrength;\n  uniform vec2 uNoiseTextureRemap;\n  uniform float uNoiseTextureSpeed;\n\n  uniform vec3 uGradientColor1;\n  uniform vec3 uGradientColor2;\n  uniform vec3 uGradientColor3;\n  uniform vec4 uGradientStep;\n  uniform vec2 uGradientNoiseThresholds;\n\n  uniform vec3 uExtraHighlightColor;\n  uniform vec4 uExtraHighlightSteps;\n  uniform float uExtraHighlightStrength;\n\n  uniform float uPatternRepeat;\n  uniform float uPatternThickness;\n  uniform float uPatternSmoothness;\n  uniform vec3 uPatternColor;\n\n  uniform float uEdgeThickness;\n  uniform float uEdgeSmoothness;\n  uniform vec3 uEdgeColor;\n\n  uniform sampler2D tRevealPattern;\n  uniform vec2 uRevealPatternScale;\n  uniform vec2 uRevealPatternOffset;\n  uniform vec2 uRevealPatternEdge;\n  uniform vec2 uRevealGradientThresholds;\n  uniform float uRevealSpeed;\n  uniform vec3 uRevealPatternColor;\n  uniform float uRevealPatternStrength;\n\n  vec2 map(\n    vec2 value, vec2 inMin, vec2 inMax,\n    vec2 outMin, vec2 outMax\n  ) {\n    return outMin +\n      (value - inMin) / (inMax - inMin) *\n      (outMax - outMin);\n  }\n\n  vec3 map(\n    vec3 value, vec3 inMin, vec3 inMax,\n    vec3 outMin, vec3 outMax\n  ) {\n    return outMin +\n      (value - inMin) / (inMax - inMin) *\n      (outMax - outMin);\n  }\n\n  vec3 map(\n    vec3 value, float inMin, float inMax,\n    float outMin, float outMax\n  ) {\n    return outMin +\n      (value - inMin) / (inMax - inMin) *\n      (outMax - outMin);\n  }\n\n  float map(\n    float value, float inMin, float inMax,\n    float outMin, float outMax\n  ) {\n    return outMin +\n      (value - inMin) / (inMax - inMin) *\n      (outMax - outMin);\n  }\n\n  vec3 blendSoftLight(\n    vec3 base, vec3 blend, float opacity\n  ) {\n    vec3 result = mix(\n      base,\n      (1.0 - 2.0 * blend) * base * base\n        + 2.0 * blend * base,\n      step(blend, vec3(0.5))\n    );\n\n    vec3 highResult = mix(\n      base,\n      sqrt(max(base, vec3(0.0))) *\n        (2.0 * blend - 1.0) + 2.0 * base *\n        (1.0 - blend),\n      step(vec3(0.5), blend)\n    );\n\n    result = mix(\n      result,\n      highResult,\n      step(vec3(0.5), blend)\n    );\n\n    return mix(base, result, opacity);\n  }\n\n  vec3 threeColorGradient(\n    vec3 color1,\n    vec3 color2,\n    vec3 color3,\n    float step1,\n    float step2,\n    float step3,\n    float step4,\n    float t\n  ) {\n    vec3 color = mix(\n      color1, color2, smoothstep(step1, step2, t)\n    );\n\n    color = mix(\n      color, color3, smoothstep(step3, step4, t)\n    );\n\n    return color;\n  }\n\n  vec4 permute(vec4 x) {\n    return mod(((x * 34.0) + 1.0) * x, 289.0);\n  }\n\n  vec4 taylorInvSqrt(vec4 r) {\n    return 1.79284291400159 - 0.85373472095314 * r;\n  }\n\n  vec3 fade3(vec3 t) {\n    return t * t * t *\n      (t * (t * 6.0 - 15.0) + 10.0);\n  }\n\n  float cnoise(vec3 P) {\n    vec3 Pi0 = floor(P);\n    vec3 Pi1 = Pi0 + vec3(1.0);\n\n    Pi0 = mod(Pi0, 289.0);\n    Pi1 = mod(Pi1, 289.0);\n\n    vec3 Pf0 = fract(P);\n    vec3 Pf1 = Pf0 - vec3(1.0);\n\n    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);\n    vec4 iy = vec4(Pi0.yy, Pi1.yy);\n    vec4 iz0 = Pi0.zzzz;\n    vec4 iz1 = Pi1.zzzz;\n\n    vec4 ixy = permute(permute(ix) + iy);\n    vec4 ixy0 = permute(ixy + iz0);\n    vec4 ixy1 = permute(ixy + iz1);\n\n    vec4 gx0 = ixy0 / 7.0;\n    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;\n    gx0 = fract(gx0);\n    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);\n    vec4 sz0 = step(gz0, vec4(0.0));\n\n    gx0 -= sz0 * (step(0.0, gx0) - 0.5);\n    gy0 -= sz0 * (step(0.0, gy0) - 0.5);\n\n    vec4 gx1 = ixy1 / 7.0;\n    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;\n    gx1 = fract(gx1);\n    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);\n    vec4 sz1 = step(gz1, vec4(0.0));\n\n    gx1 -= sz1 * (step(0.0, gx1) - 0.5);\n    gy1 -= sz1 * (step(0.0, gy1) - 0.5);\n\n    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);\n    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);\n    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);\n    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);\n    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);\n    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);\n    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);\n    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);\n\n    vec4 norm0 = taylorInvSqrt(vec4(\n      dot(g000, g000), dot(g010, g010),\n      dot(g100, g100), dot(g110, g110)\n    ));\n\n    g000 *= norm0.x;\n    g010 *= norm0.y;\n    g100 *= norm0.z;\n    g110 *= norm0.w;\n\n    vec4 norm1 = taylorInvSqrt(vec4(\n      dot(g001, g001), dot(g011, g011),\n      dot(g101, g101), dot(g111, g111)\n    ));\n\n    g001 *= norm1.x;\n    g011 *= norm1.y;\n    g101 *= norm1.z;\n    g111 *= norm1.w;\n\n    float n000 = dot(g000, Pf0);\n    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));\n    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));\n    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));\n    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));\n    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));\n    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));\n    float n111 = dot(g111, Pf1);\n\n    vec3 f = fade3(Pf0);\n\n    vec4 nz = mix(\n      vec4(n000, n100, n010, n110),\n      vec4(n001, n101, n011, n111),\n      f.z\n    );\n\n    vec2 nyz = mix(nz.xy, nz.zw, f.y);\n    return 2.2 * mix(nyz.x, nyz.y, f.x);\n  }\n\n  float fresnelFunc(\n    float amount,\n    float offset,\n    float falloff,\n    vec3 normal,\n    vec3 view\n  ) {\n    return clamp(\n      offset +\n      (1.0 - offset) *\n      pow(max(0.0, 1.0 - dot(normal, view)), amount) *\n      falloff,\n      0.0,\n      1.0\n    );\n  }\n\n  float aaSmoothStep(\n    float edge0, float edge1, float gradient\n  ) {\n    float halfChange = fwidth(gradient) * 0.5;\n\n    return smoothstep(\n      edge0 - halfChange,\n      edge1 + halfChange,\n      gradient\n    );\n  }\n\n  void main() {\n    float faceDirection = gl_FrontFacing ? 1.0 : -1.0;\n    vec3 normal = normalize(vWorldNormal);\n\n    float fresnel = fresnelFunc(\n      uFresnelAmount,\n      uFresnelOffset,\n      uFresnelFalloff,\n      normal,\n      normalize(vViewPosition)\n    );\n\n    float gradientNoiseSample = cnoise(vec3(\n      vUv2 * uGradientNoiseScale,\n      uTime * uGradientNoiseSpeed\n    ));\n\n    gradientNoiseSample =\n      (gradientNoiseSample + 1.0) / 2.0;\n\n    gradientNoiseSample = pow(\n      gradientNoiseSample,\n      uGradientNoiseContrast\n    );\n\n    gradientNoiseSample = smoothstep(\n      uGradientNoiseThresholds.x,\n      uGradientNoiseThresholds.y,\n      gradientNoiseSample\n    );\n\n    vec3 gradientColor = threeColorGradient(\n      uGradientColor1,\n      uGradientColor2,\n      uGradientColor3,\n      uGradientStep.x,\n      uGradientStep.y,\n      uGradientStep.z,\n      uGradientStep.w,\n      gradientNoiseSample\n    );\n\n    float noiseTextureSample1 = texture2D(\n      tNoise1,\n      vUv * uNoiseTextureScale +\n        vec2(uTime * uNoiseTextureSpeed)\n    ).r;\n\n    float noiseTextureSample2 = texture2D(\n      tNoise2,\n      vUv * uNoiseTextureScale * 0.5 -\n        vec2(uTime * uNoiseTextureSpeed)\n    ).r;\n\n    float noiseTextureSample = max(\n      noiseTextureSample1,\n      noiseTextureSample2\n    );\n\n    noiseTextureSample = pow(\n      noiseTextureSample,\n      uNoiseTextureContrast\n    );\n\n    noiseTextureSample = map(\n      noiseTextureSample, 0.0, 1.0,\n      uNoiseTextureRemap.x, uNoiseTextureRemap.y\n    );\n\n    vec2 baseUV = map(\n      vPosition.xy,\n      -uSize.xy / 2.0,\n      uSize.xy / 2.0,\n      vec2(0.0),\n      vec2(1.0)\n    );\n\n    float edgesUV = blendSoftLight(\n      vec3(pow(baseUV.y, 1.0)),\n      vec3(noiseTextureSample),\n      uNoiseTextureStrength\n    ).x;\n\n    float extraHighlight = threeColorGradient(\n      vec3(1.0),\n      vec3(0.0),\n      vec3(1.0),\n      uExtraHighlightSteps.x,\n      uExtraHighlightSteps.y,\n      uExtraHighlightSteps.z,\n      uExtraHighlightSteps.w,\n      edgesUV\n    ).r;\n\n    gradientColor +=\n      extraHighlight *\n      uExtraHighlightStrength *\n      uExtraHighlightColor;\n\n    gradientColor = pow(gradientColor, vec3(uContrast));\n\n    vec3 color = gradientColor;\n\n    float ao = pow(\n      texture2D(tAO, vUv).r,\n      uAoContrast\n    );\n\n    ao = smoothstep(\n      uAoSmoothstep.x,\n      uAoSmoothstep.y,\n      ao\n    );\n\n    color *= ao;\n\n    float gridTextureSample = pow(\n      texture2D(\n        tGrid,\n        (vUv1 - 0.5) * uGridTextureScale +\n          0.5 + uGridTextureOffset\n      ).r,\n      uGridTextureContrast\n    );\n\n    gridTextureSample = map(\n      gridTextureSample,\n      0.0, 1.0,\n      uGridTextureRemap.x,\n      uGridTextureRemap.y\n    );\n\n    float edges = texture2D(\n      tEdges,\n      (vUv1 - 0.5) * uGridTextureScale +\n        0.5 + uGridTextureOffset\n    ).r;\n\n    edges = pow(edges, uGridEdgesContrast);\n\n    edges = 1.0 - smoothstep(\n      uGridEdgesThresholds.x,\n      uGridEdgesThresholds.y,\n      edges\n    );\n\n    color *= mix(\n      1.0,\n      gridTextureSample,\n      uGridTextureStrength\n    );\n\n    color += edges * uGridEdgesStrength * color;\n\n    vec3 coord = vPosition.xyz * uPatternRepeat;\n\n    vec3 grid =\n      abs(fract(coord - 0.5) - 0.5) / fwidth(coord);\n\n    float line = min(min(grid.x, grid.y), grid.z);\n\n    float pattern = 1.0 - smoothstep(\n      uPatternThickness - uPatternSmoothness,\n      uPatternThickness + uPatternSmoothness,\n      line\n    );\n\n    pattern = pow(pattern, 1.0 / 2.2);\n\n    vec2 detailsUV =\n      (vUv1 - 0.5) * uDetailsScale + 0.5;\n\n    vec3 details = pow(\n      texture2D(tDetails, detailsUV).rgb,\n      vec3(uDetailsContrast)\n    );\n\n    color += details * uDetailsStrength *\n      map(\n        color,\n        vec3(0.0),\n        vec3(1.0),\n        vec3(0.2),\n        vec3(1.5)\n      );\n\n    vec3 coords = (vPosition.xyz / uSize) * 2.0;\n    coords = abs(coords);\n    coords = 1.0 - coords;\n\n    float horizontalEdge1 = 1.0 - aaSmoothStep(\n      uEdgeThickness - uEdgeSmoothness,\n      uEdgeThickness + uEdgeSmoothness,\n      coords.x\n    );\n\n    float horizontalEdge2 = 1.0 - aaSmoothStep(\n      uEdgeThickness - uEdgeSmoothness,\n      uEdgeThickness + uEdgeSmoothness,\n      coords.z\n    );\n\n    float verticalEdge1 = 1.0 - aaSmoothStep(\n      uEdgeThickness - uEdgeSmoothness,\n      uEdgeThickness + uEdgeSmoothness,\n      coords.y\n    );\n\n    vec3 localNormal = normalize(vLocalNormal);\n float topFace = step(0.999, localNormal.y);\n\n    float bottomFace =\n      (1.0 - step(0.0, localNormal.y)) *\n      (1.0 - step(0.5, vPosition.y));\n\n    float topBottomFace = max(topFace, bottomFace);\n\n    float frontBackFace =\n      step(0.5, abs(localNormal.z)) *\n      (1.0 - topBottomFace);\n\n    float sideFaces =\n      step(0.5, abs(localNormal.x)) *\n      (1.0 - topBottomFace);\n\n    float frontBackFaceEdges =\n      max(horizontalEdge1, verticalEdge1) *\n      (1.0 - topBottomFace) * frontBackFace;\n\n    float topBottomFaceEdges =\n      max(horizontalEdge1, horizontalEdge2) *\n      topBottomFace;\n\n    float leftRightFaceEdges =\n      max(horizontalEdge2, verticalEdge1) *\n      sideFaces;\n\n    float edgeMask =\n      frontBackFaceEdges +\n      topBottomFaceEdges +\n      leftRightFaceEdges;\n\n    color += uBloomColor * color;\n    color += edgeMask * uEdgeColor;\n\n    vec3 c = color;\n    c *= max(1.0, uFresnelAddition * fresnel);\n\n    gl_FragColor = vec4(c, 1.0);\n\n    float revealPattern = texture2D(\n      tRevealPattern,\n      (vUv2 - 0.5) * uRevealPatternScale +\n        0.5 + uRevealPatternOffset\n    ).r;\n\n    revealPattern = 1.0 - revealPattern;\n    revealPattern = pow(revealPattern, 2.0);\n\n    revealPattern = smoothstep(\n      uRevealPatternEdge.x,\n      uRevealPatternEdge.y,\n      revealPattern\n    );\n\n    vec3 dt = map(\n      vPosition.xyz,\n      -uSize.xyz / 2.0,\n      uSize.xyz / 2.0,\n      vec3(-0.5),\n      vec3(0.5)\n    );\n\n    float revealUV = length(dt) * 4.0 + 4.0;\n\n    float revealProgress =\n      clamp(fract((uTime + 2.5) * uRevealSpeed), 0.0, 1.0) *\n      step(0.0, sin((uTime + 2.5) * uRevealSpeed * PI));\n\n    revealUV -= (revealProgress + 1.0 / 4.0) * 4.0 * 2.0;\n    revealUV = abs(revealUV);\n\n    revealUV = smoothstep(\n      uRevealGradientThresholds.x,\n      uRevealGradientThresholds.y,\n      revealUV\n    );\n\n    float reveal = clamp(\n      revealPattern - revealUV,\n      0.0,\n      1.0\n    );\n\n    gl_FragColor.rgb = mix(\n      gl_FragColor.rgb,\n      uRevealPatternColor * uRevealPatternStrength,\n      reveal * max(uDigital, uPulse)\n    );\n\n    gl_FragColor.rgb = clamp(\n      gl_FragColor.rgb, 0.0, 1.0\n    );\n gl_FragColor.rgb *= vCarveShade;\n #include <colorspace_fragment>\n }\n";
const sceneOverrides={"uParallaxStrength":0.4700000000000001,"uParallaxDepthScale":1.4300000000000004,"uColor":{"r":0.43137254901960786,"g":0.7058823529411765,"b":1,"a":1},"uPatternRepeat":9.089999999999991,"uPatternThickness":0.38999999999999946,"uPatternColor":{"r":1,"g":1,"b":1,"a":1,"x":0.6599999999999997,"y":0.8899999999999999,"z":1.7800000000000034},"uPatternSmoothness":0.19999999999999996,"uGridEdgesContrast":1.5800000000000005,"uGridEdgesStrength":0.34999999999999964,"uFresnelAddition":3.0000000000000013,"uDetailsScale":0,"uDetailsStrength":3.4300000000000024,"uDetailsContrast":2.6,"uGridTextureOffset":{"x":1.32,"y":0},"uGridTextureScale":-0.27,"uGridTextureContrast":0.10000000000000002,"uContrast":1.2500000000000002,"uParallaxUniformStrength":1,"uBloomColor":{"x":0,"y":0.2700000000000001,"z":0.63},"uGradientStep":{"x":0,"y":0.28999999999999937,"z":0.7,"w":0.99},"uGradientColor2":{"r":0.09411764705882353,"g":0.403921568627451,"b":0.6588235294117647,"a":1},"uGradientColor1":{"r":0,"g":0.03529411764705882,"b":0.3411764705882353,"a":1},"uNoiseTextureStrength":0.26,"uGradientNoiseScale":{"x":3.550000000000002,"y":4.680000000000007},"uGradientNoiseSpeed":0.33999999999999986,"uGradientNoiseThresholds":{"x":0,"y":1},"uGridTextureRemap":{"x":0.4,"y":1},"uAoContrast":1.2,"uAoSmoothstep":{"y":0.7400000000000001},"uSecondaryNoiseStrength":0.029999999999999694,"uSecondaryNoiseScale":{"x":1,"y":1},"uSecondaryNoiseRemap":{"x":2,"y":2.2},"uSecondaryNoiseContrast":100,"uEdgeColor":{"r":0.3411764705882353,"g":0.6509803921568628,"b":0.7215686274509804,"a":1},"uEdgeSmoothness":0.005,"uGridTextureStrength":1.5,"uExtraHighlightSteps":{"x":-0.15,"y":0.3299999999999995,"w":1.1500000000000001,"z":0.5199999999999996},"uExtraHighlightStrength":1,"uFresnelFalloff":1,"uFresnelOffset":0.1599999999999998,"uFresnelAmount":0.21999999999999978,"uEdgeThickness":0.01,"uGridEdgesThresholds":{"x":0.79,"y":0.9},"uNoiseTextureSpeed":0.01000000000000001,"uNoiseTextureScale":{"y":0.12999999999999987,"x":0.5499999999999997},"uExtraHighlightColor":{"r":0.2,"g":0.4470588235294118,"b":1,"a":1},"uNoiseTextureContrast":1,"uGradientColor3":{"r":0.43137254901960786,"g":0.7058823529411765,"b":1,"a":1},"uGradientNoiseContrast":1.1300000000000001,"uRevealGradientThresholds":{"y":1.15,"x":-0.11999999999999982},"uRevealPatternEdge":{"y":0.4,"x":0.4},"uRevealPatternOffset":{"x":0},"uRevealSpeed":0.19,"uRevealPatternScale":{"x":4,"y":4},"uRevealPatternColor":{"r":0.23529411764705882,"g":0.6039215686274509,"b":0.996078431372549,"a":1},"uRevealPatternStrength":2,"tDetails":{"type":"image"},"tRevealPattern":{"type":"image"}};
function solid(r,g,b){const texture=new THREE.DataTexture(new Uint8Array([r,g,b,255]),1,1,THREE.RGBAFormat);texture.needsUpdate=true;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;}
export function createOriginalCubeMaterial(){
 const white=solid(255,255,255),black=solid(0,0,0),noise=solid(128,128,128);
 const fallbackTextures={grid:white,edges:white,details:black,ao:white,noise1:noise,noise2:noise,revealPattern:white};
 const uniforms = {
      tGrid: { value: fallbackTextures.grid },
      tEdges: { value: fallbackTextures.edges },
      tDetails: { value: fallbackTextures.details },
      tAO: { value: fallbackTextures.ao },
      tNoise1: { value: fallbackTextures.noise1 },
      tNoise2: { value: fallbackTextures.noise2 },
      tRevealPattern: {
        value: fallbackTextures.revealPattern,
      },
      uTime: { value: 0 },
      uPulse: { value: 0 },

      uSize: { value: new THREE.Vector3(1, 1, 1) },

      uColor: { value: new THREE.Color(0xffffff) },
      uContrast: { value: 1.96 },

      uAoContrast: { value: 3.31 },
      uAoSmoothstep: {
        value: new THREE.Vector2(0, 1),
      },

      uGridTextureScale: { value: 0.27 },
      uGridTextureOffset: {
        value: new THREE.Vector2(0, 0),
      },
      uGridTextureContrast: { value: 4.0 },
      uGridTextureStrength: { value: 0.5 },
      uGridTextureRemap: {
        value: new THREE.Vector2(0.025, 1),
      },

      uGridEdgesContrast: { value: 1.83 },
      uGridEdgesThresholds: {
        value: new THREE.Vector2(0.81, 0.88),
      },
      uGridEdgesStrength: { value: 10.0 },

      uDetailsScale: { value: 4.0 },
      uDetailsContrast: { value: 1.5 },
      uDetailsStrength: { value: 0.5 },

      uFresnelAmount: { value: 3.5 },
      uFresnelOffset: { value: 0 },
      uFresnelFalloff: { value: 3.1 },
      uFresnelAddition: { value: 3.6 },

      uGradientNoiseScale: {
        value: new THREE.Vector2(24, 3.35),
      },
      uGradientNoiseSpeed: { value: 0.25 },
      uGradientNoiseContrast: { value: 1.0 },

      uNoiseTextureScale: {
        value: new THREE.Vector2(1, 1),
      },
      uNoiseTextureSpeed: { value: 0.1 },
      uNoiseTextureContrast: { value: 1.0 },
      uNoiseTextureStrength: { value: 0.5 },
      uNoiseTextureRemap: {
        value: new THREE.Vector2(0, 1),
      },

      uBloomColor: {
        value: new THREE.Vector3(1.58, 3.17, 4.26),
      },

      uRotationSpeed: { value: -0.1 },
      uVerticalMovementSpeed: { value: 0.7 },
      uVerticalMovementAmount: { value: 0.15 },

      uRevealPatternScale: {
        value: new THREE.Vector2(1, 1),
      },
      uRevealPatternOffset: {
        value: new THREE.Vector2(0, 0),
      },
      uRevealPatternEdge: {
        value: new THREE.Vector2(0, 0.6),
      },
      uRevealGradientThresholds: {
        value: new THREE.Vector2(0, 1),
      },
      uRevealSpeed: { value: 0.1 },
      uRevealPatternColor: {
        value: new THREE.Vector3(1, 1, 1),
      },
      uRevealPatternStrength: { value: 1.0 },

      uPatternRepeat: { value: 1.0 },
      uPatternThickness: { value: 0.02 },
      uPatternSmoothness: { value: 0.01 },
      uPatternColor: { value: new THREE.Color(0xffffff) },

      uEdgeThickness: { value: 0.01 },
      uEdgeSmoothness: { value: 0.01 },
      uEdgeColor: { value: new THREE.Color(0xffffff) },

      uGradientColor1: { value: new THREE.Color(0xffffff) },
      uGradientColor2: { value: new THREE.Color(0x000000) },
      uGradientColor3: { value: new THREE.Color(0x888888) },

      uGradientStep: {
        value: new THREE.Vector4(0, 0.3, 0.6, 1),
      },

      uGradientNoiseThresholds: {
        value: new THREE.Vector2(0, 1),
      },

      uExtraHighlightColor: {
        value: new THREE.Color(0xffffff),
      },

      uExtraHighlightSteps: {
        value: new THREE.Vector4(0, 0, 0, 0),
      },

      uExtraHighlightStrength: { value: 0 },
    };
 for(const [name,value] of Object.entries(sceneOverrides)){
   if(!uniforms[name]||value?.type==='image')continue;
   const target=uniforms[name].value;
   if(typeof value==='number'){uniforms[name].value=value;continue;}
   if(target?.isColor){target.setRGB(value.r,value.g,value.b,THREE.SRGBColorSpace);continue;}
   if(target?.isVector3&&value.r!==undefined){const color=new THREE.Color().setRGB(value.r,value.g,value.b,THREE.SRGBColorSpace);target.set(color.r,color.g,color.b);continue;}
   if(target?.isVector2||target?.isVector3||target?.isVector4){for(const key of ['x','y','z','w'])if(value[key]!==undefined)target[key]=value[key];}
 }
 uniforms.uSize.value.set(2,2,2);
 uniforms.uRotationSpeed.value=0;
 uniforms.uVerticalMovementAmount.value=0;
 // Calibrated against the supplied screenshots for this direct output pipeline.
 uniforms.uEdgeColor.value.multiplyScalar(0.25);
 // Equal smoothstep endpoints in the original config are undefined GLSL.
 uniforms.uRevealPatternEdge.value.set(0.399,0.401);
 uniforms.uDigital={value:0};
 uniforms.uPulse={value:0};
 // Purple theme: colour-only overrides. Geometry, masks, detail and animation stay intact.
 const themeColor = hex => new THREE.Color(hex);
 uniforms.uGradientColor1.value.copy(themeColor('#1f0957'));
 uniforms.uGradientColor2.value.copy(themeColor('#6734bd'));
 uniforms.uGradientColor3.value.copy(themeColor('#a58fff'));
 uniforms.uExtraHighlightColor.value.copy(themeColor('#8f79ff'));
 uniforms.uEdgeColor.value.copy(themeColor('#c5a2e6')).multiplyScalar(0.25);
 uniforms.uBloomColor.value.set(0.25, 0.05, 0.63);
 // Reveal colour is a raw vector in this shader, kept as linear values like the original.
 uniforms.uRevealPatternColor.value.set(0.55, 0.17, 0.99);
 const material=new THREE.ShaderMaterial({uniforms,vertexShader,fragmentShader,side:THREE.FrontSide});
 const disposeMaterial=material.dispose.bind(material);
 material.dispose=()=>{white.dispose();black.dispose();noise.dispose();disposeMaterial();};
 return material;
}
