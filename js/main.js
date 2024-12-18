"use strict";

import { parseMTL, parseMapArgs, parseOBJ } from "./parse.js";
import { vs, fs } from "./shaders.js";
import { getExtents, getGeometriesExtents, degToRad } from "./utils.js";

async function main() {
  // Get canvas and WebGL context
  const canvas = document.querySelector("#canvas");
  const gl = canvas.getContext("webgl");
  if (!gl) {
    console.error("WebGL not supported");
    return;
  }

  // Create shader program
  const meshProgramInfo = webglUtils.createProgramInfo(gl, [vs, fs]);

  // Load and setup leather texture with normal map
  const leatherTexture = gl.createTexture();
  const leatherNormalMap = gl.createTexture();
  const leatherImage = new Image();
  const normalMapImage = new Image();

  // Load texture images
  leatherImage.src = "./resources/leather-diffuse.jpg";
  normalMapImage.src = "./resources/leather-normal.jpg";
  
  // Set initial texture to a leather-colored pixel
  gl.bindTexture(gl.TEXTURE_2D, leatherTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([101, 67, 33, 255]) // leather brown color
  );

  // Handle leather texture loading
  leatherImage.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, leatherTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, leatherImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  // Handle normal map loading
  normalMapImage.onload = function() {
    gl.bindTexture(gl.TEXTURE_2D, leatherNormalMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, normalMapImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.generateMipmap(gl.TEXTURE_2D);
  };

  // Enhanced leather material properties
  const leatherMaterial = {
    diffuse: [0.6, 0.4, 0.2],    // Warm brown color
    ambient: [0.2, 0.15, 0.1],    // Subtle ambient
    specular: [0.3, 0.3, 0.3],    // Subtle specular highlight
    shininess: 15.0,              // Lower shininess for leather
    roughness: 0.8,               // High roughness for leather
    metalness: 0.0,               // Non-metallic material
    opacity: 1.0
  };

  // Load OBJ file
  let obj;
  try {
    const response = await fetch("./resources/glassescase.obj");
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    obj = parseOBJ(text);
  } catch (error) {
    console.warn("Error loading OBJ file:", error);
    // Fallback to simple cube if model fails to load
    obj = {
      geometries: [{
        material: "default",
        data: {
          position: [-1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1],
          normal: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
          texcoord: [0, 0, 1, 0, 1, 1, 0, 1],
          color: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
        },
      }],
      materialLibs: [],
    };
  }

  // Process geometries and create buffers
  const parts = obj.geometries.map(({ material, data }) => {
    if (!data.texcoord) {
      data.texcoord = {
        numComponents: 2,
        data: calculateTextureCoordinates(data.position)
      };
    }

    if (!data.color) {
      data.color = { value: [1, 1, 1, 1] };
    }

    const bufferInfo = webglUtils.createBufferInfoFromArrays(gl, data);
    return {
      material: leatherMaterial,
      bufferInfo,
    };
  });

  // Calculate texture coordinates based on position
  function calculateTextureCoordinates(positions) {
    const texcoords = [];
    for (let i = 0; i < positions.length; i += 3) {
      const u = (positions[i] + 1) * 2;
      const v = (positions[i + 1] + 1) * 2;
      texcoords.push(u, v);
    }
    return texcoords;
  }

  // Calculate model extents and camera settings
  const extents = getGeometriesExtents(obj.geometries);
  const range = m4.subtractVectors(extents.max, extents.min);
  const objOffset = m4.scaleVector(
    m4.addVectors(extents.min, m4.scaleVector(range, 0.5)),
    -1
  );

  const radius = m4.length(range) * 1.2;
  const cameraTarget = [0, 0, 0];
  const cameraPosition = [0, 0, radius * 2];
  const zNear = radius / 100;
  const zFar = radius * 3;

  // Initialize mouse interaction state if not already done
  if (!window.rotationControl) {
    window.rotationControl = {
      deltaRotationX: 0,
      deltaRotationY: 0,
      isAutoRotating: true,
      scale: 1
    };
  }

  // Main render function
  function render(time) {
    time *= 0.001;

    // Handle auto-rotation
    if (window.rotationControl.isAutoRotating) {
      window.rotationControl.deltaRotationY += 0.01;
    }

    // Setup viewport and enable WebGL features
    webglUtils.resizeCanvasToDisplaySize(gl.canvas);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Calculate projection matrix
    const fieldOfViewRadians = degToRad(60);
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const projection = m4.perspective(fieldOfViewRadians, aspect, zNear, zFar);

    // Setup camera
    const up = [0, 1, 0];
    const camera = m4.lookAt(cameraPosition, cameraTarget, up);
    const view = m4.inverse(camera);

    // Setup lighting and shared uniforms
    const sharedUniforms = {
      u_lightDirection: m4.normalize([-1, 2, 3]),
      u_view: view,
      u_projection: projection,
      u_viewWorldPosition: cameraPosition,
      u_texture: leatherTexture,
      u_normalMap: leatherNormalMap,
      u_lightIntensity: 1.2,
      u_ambient: [0.2, 0.2, 0.2],
    };

    // Set program and uniforms
    gl.useProgram(meshProgramInfo.program);
    webglUtils.setUniforms(meshProgramInfo, sharedUniforms);

    // Calculate world matrix with rotations and scaling
    let u_world = m4.identity();
    
    // Apply scale
    u_world = m4.scale(u_world, 
      window.rotationControl.scale,
      window.rotationControl.scale,
      window.rotationControl.scale
    );
    
    // Apply rotations
    u_world = m4.xRotate(u_world, window.rotationControl.deltaRotationX);
    u_world = m4.yRotate(u_world, window.rotationControl.deltaRotationY);
    
    // Apply object offset
    u_world = m4.translate(u_world, ...objOffset);

    // Draw each part of the model
    for (const { bufferInfo, material } of parts) {
      webglUtils.setBuffersAndAttributes(gl, meshProgramInfo, bufferInfo);
      webglUtils.setUniforms(meshProgramInfo, {
        u_world,
        u_ambientLight: [0.3, 0.3, 0.3],
        ...material,
      });
      webglUtils.drawBufferInfo(gl, bufferInfo);
    }

    // Request next frame
    requestAnimationFrame(render);
  }

  // Start the render loop
  requestAnimationFrame(render);
}

// Start the application
main();