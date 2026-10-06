import * as THREE from 'three';

/**
 * Campo de estrellas: miles de vértices sueltos dibujados como puntos.
 * Un único THREE.Points = una única llamada de dibujo a la GPU, por eso es barato.
 */
export function createStarfield(count = 2600) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const tint = [new THREE.Color('#ffffff'), new THREE.Color('#9be7ff'), new THREE.Color('#f0abfc')];

  for (let i = 0; i < count; i++) {
    // Dirección aleatoria uniforme sobre una esfera, a una distancia entre 1800 y 4000
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = 1800 + Math.random() * 2200;
    const s = Math.sqrt(1 - u * u);
    positions.set([r * s * Math.cos(theta), r * s * Math.sin(theta), r * u], i * 3);

    // La mayoría blancas; unas pocas con el tono de la paleta
    const c = Math.random() < 0.85 ? tint[0] : tint[1 + (i % 2)];
    const dim = 0.35 + Math.random() * 0.65;
    colors.set([c.r * dim, c.g * dim, c.b * dim], i * 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 2.2,
    sizeAttenuation: false, // tamaño fijo en píxeles, independiente de la distancia
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });

  return new THREE.Points(geometry, material);
}
