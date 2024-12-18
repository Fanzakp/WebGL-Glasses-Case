"use strict";

export const vs = `
attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec4 a_color;
attribute vec2 a_texcoord;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform vec3 u_viewWorldPosition;

varying vec3 v_normal;
varying vec3 v_surfaceToView;
varying vec4 v_color;
varying vec2 v_texcoord;

void main() {
  vec4 worldPosition = u_world * a_position;
  gl_Position = u_projection * u_view * worldPosition;
  v_surfaceToView = u_viewWorldPosition - worldPosition.xyz;
  v_normal = mat3(u_world) * a_normal;
  v_color = a_color;
  v_texcoord = a_texcoord;
}
`;

export const fs = `
precision highp float;

varying vec3 v_normal;
varying vec3 v_surfaceToView;
varying vec4 v_color;
varying vec2 v_texcoord;

uniform vec3 diffuse;
uniform vec3 ambient;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
uniform vec3 u_lightDirection;
uniform vec3 u_ambientLight;
uniform sampler2D u_texture;

void main () {
  vec3 normal = normalize(v_normal);
  vec3 surfaceToViewDirection = normalize(v_surfaceToView);
  vec3 halfVector = normalize(u_lightDirection + surfaceToViewDirection);

  float light = dot(normal, u_lightDirection);
  float specularLight = pow(dot(normal, halfVector), shininess);

  vec4 texColor = texture2D(u_texture, v_texcoord);
  vec3 effectiveDiffuse = diffuse * texColor.rgb;
  
  gl_FragColor = vec4(
    emissive +
    ambient * u_ambientLight +
    effectiveDiffuse * light +
    specular * specularLight,
    opacity * texColor.a);
}
`;