import Globe from 'globe.gl';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { feature } from 'topojson-client';
import countriesTopo from 'world-atlas/countries-110m.json';
import { haversineKm } from '@globe-trace/shared';
import { createStarfield } from './starfield.js';
import { sphericalMidpoint, sphericalCentroid, altitudeForDistance } from './geo.js';

const CYAN = '#22d3ee';
const MAGENTA = '#e879f9';

/**
 * La simplificación del mapa a 1:110m deja algún "polígono" con todos sus vértices
 * en el mismo punto (pasa en Corea del Norte) y H3 lanza un error al teselarlo.
 * Se descartan los anillos con menos de 3 vértices distintos.
 */
function dropDegeneratePolygons(f) {
  const { type, coordinates } = f.geometry;
  if (type !== 'MultiPolygon') return f;
  const valid = coordinates.filter(([outer]) => new Set(outer.map(String)).size >= 3);
  return { ...f, geometry: { type, coordinates: valid } };
}

/**
 * Elemento HTML de una etiqueta. globe.gl posiciona el contenedor con `transform`,
 * así que el estilo y la animación van en un hijo para no pisarse con él.
 */
function createLabelEl(cityName) {
  const el = document.createElement('div');
  el.className = 'globe-label';
  const inner = document.createElement('div');
  inner.className = 'globe-label__inner';
  // textContent y no innerHTML: los datos vienen de fuera y no deben interpretarse como HTML
  const num = document.createElement('b');
  const city = document.createElement('span');
  city.textContent = cityName;
  inner.append(num, city);
  el.append(inner);
  return { el, num };
}

/**
 * Todo lo que ocurre dentro del canvas 3D. La interfaz no toca three ni globe.gl:
 * solo llama a estos métodos (reset, addHop, select, flyTo...).
 */
export class GlobeScene {
  /** @param {HTMLElement} el  @param {{ onHopClick?: Function, onView?: Function }} opts */
  constructor(el, { onHopClick, onView } = {}) {
    this.el = el;
    this.origin = null;
    this.hops = []; // solo los saltos geolocalizados
    this.selected = null;
    this.labels = new Map(); // ciudad → etiqueta HTML
    this.onView = onView;

    const countries = feature(countriesTopo, countriesTopo.objects.countries).features.map(
      dropDegeneratePolygons,
    );

    this.globe = new Globe(el, { animateIn: true })
      .backgroundColor('rgba(0,0,0,0)')
      // Esfera base: casi negra, con un leve brillo propio para que no desaparezca
      .globeMaterial(
        new THREE.MeshPhongMaterial({ color: '#06101f', emissive: '#020a16', shininess: 6 }),
      )
      .showAtmosphere(true)
      .atmosphereColor('#1593b3') // más apagado que el acento: el bloom ya lo realza
      .atmosphereAltitude(0.16)
      .showGraticules(true)
      // Continentes como una malla de puntos hexagonales (H3), estética "radar"
      .hexPolygonsData(countries)
      .hexPolygonResolution(3)
      .hexPolygonMargin(0.42)
      .hexPolygonUseDots(true)
      .hexPolygonAltitude(0.004)
      .hexPolygonColor(() => 'rgba(94, 214, 240, 0.3)')
      .hexPolygonsTransitionDuration(0);

    this.#setupArcs();
    this.#setupPoints(onHopClick);
    this.#setupRings();
    this.#setupLabels();

    // Estrellas y luz añadidas directamente a la escena de Three.js
    const scene = this.globe.scene();
    this.stars = createStarfield();
    scene.add(this.stars);
    const rim = new THREE.DirectionalLight('#7dd3fc', 0.6);
    rim.position.set(-1, 0.6, -1).multiplyScalar(300);
    scene.add(rim);

    // Línea de la cuadrícula más tenue que la que trae por defecto
    scene.traverse((o) => {
      if (o.type === 'LineSegments' && o.material) {
        o.material.transparent = true;
        o.material.opacity = 0.06;
      }
    });

    const controls = this.globe.controls();
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.minDistance = 130;
    controls.maxDistance = 650;

    this.globe.pointOfView({ lat: 30, lng: 10, altitude: 2.4 });
    this.#setupBloom();

    this.#tick();
    this.#resize();
    window.addEventListener('resize', () => this.#resize());
  }

  // ─── Capas ──────────────────────────────────────────────────────────────

  #setupArcs() {
    // Cada tramo se dibuja dos veces: una base tenue fija y un pulso que la recorre
    this.globe
      .arcsData([])
      .arcStartLat((d) => d.from.lat)
      .arcStartLng((d) => d.from.lon)
      .arcEndLat((d) => d.to.lat)
      .arcEndLng((d) => d.to.lon)
      .arcColor((d) =>
        d.layer === 'base'
          ? ['rgba(34,211,238,0.35)', 'rgba(232,121,249,0.35)']
          : ['rgba(34,211,238,0)', CYAN, MAGENTA],
      )
      .arcStroke((d) => (d.layer === 'base' ? 0.25 : 0.7))
      .arcAltitudeAutoScale(0.45)
      .arcDashLength((d) => (d.layer === 'base' ? 1 : 0.3))
      .arcDashGap((d) => (d.layer === 'base' ? 0 : 1.2))
      .arcDashInitialGap((d) => (d.layer === 'base' ? 0 : 1))
      .arcDashAnimateTime((d) => (d.layer === 'base' ? 0 : 1600 + d.km / 4))
      .arcsTransitionDuration(0);
  }

  #setupPoints(onHopClick) {
    this.globe
      .pointsData([])
      .pointLat((d) => d.lat)
      .pointLng((d) => d.lon)
      .pointAltitude((d) => (d.kind === 'origin' ? 0.012 : 0.02))
      .pointRadius((d) => (d.kind === 'origin' ? 0.45 : d.hop === this.selected ? 0.55 : 0.32))
      .pointColor((d) => {
        if (d.kind === 'origin') return '#f8fafc';
        return d.hop === this.selected ? MAGENTA : CYAN;
      })
      .pointsMerge(false)
      .pointsTransitionDuration(300)
      .onPointClick((d) => d.kind === 'hop' && onHopClick?.(d.hop))
      .onPointHover((d) => (this.el.style.cursor = d?.kind === 'hop' ? 'pointer' : ''));
  }

  #setupRings() {
    // Ondas expansivas en el último salto (y en el seleccionado)
    this.globe
      .ringsData([])
      .ringLat((d) => d.lat)
      .ringLng((d) => d.lon)
      .ringColor((d) => (t) => (d.tone === 'magenta' ? `rgba(232,121,249,${1 - t})` : `rgba(34,211,238,${1 - t})`))
      .ringMaxRadius(3.2)
      .ringPropagationSpeed(2.4)
      .ringRepeatPeriod(1100);
  }

  #setupLabels() {
    // Etiquetas HTML ancladas al globo: una por ciudad, con los nº de salto que pasan por ella
    this.globe
      .htmlElementsData([])
      .htmlLat((d) => d.lat)
      .htmlLng((d) => d.lon)
      .htmlAltitude(0.025)
      .htmlElement((d) => d.el)
      // Las etiquetas son HTML encima del canvas: hay que ocultar a mano las que quedan
      // en la cara oculta del globo, porque el navegador no sabe que están "detrás"
      .htmlElementVisibilityModifier((el, visible) => el.classList.toggle('is-hidden', !visible));
  }

  /**
   * Post-procesado: en vez de dibujar la escena directamente en pantalla, se dibuja
   * en una textura y se le aplican "pasadas". UnrealBloomPass extrae los píxeles más
   * brillantes, los desenfoca y los suma encima: es lo que da el halo de neón.
   * El umbral (threshold) decide qué brilla: alto para que solo lo hagan arcos y puntos.
   */
  #setupBloom() {
    // En móvil se omite: son varias pasadas extra por frame y la GPU es más modesta
    if (window.innerWidth < 820) return;

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(this.el.clientWidth, this.el.clientHeight),
      1.1, // intensidad
      0.55, // radio del halo
      0.5, // umbral de brillo: los continentes quedan por debajo, la ruta por encima
    );
    this.globe.postProcessingComposer().addPass(this.bloom);
  }

  // ─── API pública ────────────────────────────────────────────────────────

  /** Limpia el recorrido anterior y coloca el origen (el servidor que lanza el trace). */
  reset(origin) {
    this.origin = origin;
    this.hops = [];
    this.selected = null;
    this.labels.clear();
    this.globe.controls().autoRotate = false;
    this.#render();
    if (origin) this.globe.pointOfView({ lat: origin.lat, lng: origin.lon, altitude: 1.6 }, 1200);
  }

  /** Añade un salto geolocalizado y mueve la cámara para encuadrar el último tramo. */
  addHop(hop) {
    const prev = this.hops.at(-1)?.geo ?? this.origin;
    this.hops.push(hop);
    this.#render();

    const to = hop.geo;
    if (prev) {
      const km = haversineKm(prev, to);
      const mid = sphericalMidpoint(prev, to);
      this.globe.pointOfView({ lat: mid.lat, lng: mid.lon, altitude: altitudeForDistance(km) }, 1400);
    } else {
      this.globe.pointOfView({ lat: to.lat, lng: to.lon, altitude: 1.4 }, 1400);
    }
  }

  /** Marca un salto como seleccionado (o null para quitar la selección). */
  select(hopNumber) {
    this.selected = hopNumber;
    this.#render();
  }

  /** Vuela la cámara a un salto concreto. */
  flyTo(hop) {
    if (!hop?.geo) return;
    this.globe.controls().autoRotate = false;
    this.globe.pointOfView({ lat: hop.geo.lat, lng: hop.geo.lon, altitude: 0.85 }, 1300);
  }

  /** Al terminar: plano general de todo el recorrido. */
  overview() {
    const pts = [this.origin, ...this.hops.map((h) => h.geo)].filter(Boolean);
    if (pts.length < 2) return;
    // Centro de la ruta y el punto más alejado de él, para que quepa todo
    const center = sphericalCentroid(pts);
    const spread = Math.max(...pts.map((p) => haversineKm(center, p)));
    this.globe.pointOfView(
      { lat: center.lat, lng: center.lon, altitude: altitudeForDistance(spread * 2) + 0.2 },
      2200,
    );
  }

  idle() {
    this.globe.controls().autoRotate = true;
  }

  // ─── Internos ──────────────────────────────────────────────────────────

  /** Recalcula las capas a partir del estado. globe.gl hace el diff por dentro. */
  #render() {
    const geoPts = this.hops.map((h) => ({ kind: 'hop', hop: h.hop, ...h.geo }));
    const all = this.origin ? [{ kind: 'origin', ...this.origin }, ...geoPts] : geoPts;

    // Tramos entre puntos consecutivos; se descartan los que no salen de la ciudad (< 30 km)
    const arcs = [];
    for (let i = 1; i < all.length; i++) {
      const km = haversineKm(all[i - 1], all[i]);
      if (km < 30) continue;
      const seg = { from: all[i - 1], to: all[i], km };
      arcs.push({ ...seg, layer: 'base' }, { ...seg, layer: 'pulse' });
    }

    this.globe.pointsData(all).arcsData(arcs);

    const rings = [];
    const last = geoPts.at(-1);
    if (last) rings.push({ ...last, tone: 'cyan' });
    const sel = geoPts.find((p) => p.hop === this.selected);
    if (sel && sel !== last) rings.push({ ...sel, tone: 'magenta' });
    this.globe.ringsData(rings);

    this.globe.htmlElementsData(this.#cityLabels(all));
  }

  /**
   * Una etiqueta por ciudad, con los saltos que pasan por ella ("06·07 Londres").
   * Las etiquetas se guardan entre renders: si se recrearan en cada salto,
   * parpadearían y se reiniciaría su animación de entrada.
   */
  #cityLabels(points) {
    for (const l of this.labels.values()) l.hops = [];

    for (const p of points) {
      const key = p.city ?? `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
      if (!this.labels.has(key)) {
        this.labels.set(key, { lat: p.lat, lon: p.lon, hops: [], ...createLabelEl(p.city ?? '?') });
      }
      const label = this.labels.get(key);
      if (p.kind === 'origin') label.el.classList.add('globe-label--origin');
      else label.hops.push(String(p.hop).padStart(2, '0'));
    }

    // "Destacadas": la del último salto y la del seleccionado. En móvil solo se ven
    // esas, porque en pantalla pequeña las ciudades cercanas se apilan unas encima de otras
    const last = String(points.at(-1)?.hop ?? '').padStart(2, '0');
    const selected = String(this.selected ?? '').padStart(2, '0');
    for (const l of this.labels.values()) {
      l.num.textContent = l.hops.join('·') || 'SRC';
      l.el.classList.toggle('globe-label--key', l.hops.includes(last) || l.hops.includes(selected));
    }
    return [...this.labels.values()];
  }

  #tick = () => {
    // Las estrellas giran muy despacio para dar sensación de profundidad
    this.stars.rotation.y += 0.00008;
    // La posición de cámara se lee en cada frame: onZoom de globe.gl no se dispara
    // durante las transiciones de pointOfView(), y la telemetría se quedaría congelada
    this.onView?.(this.globe.pointOfView());
    requestAnimationFrame(this.#tick);
  };

  #resize() {
    const w = this.el.clientWidth;
    const h = this.el.clientHeight;
    this.globe.width(w).height(h);

    // En móvil los paneles ocupan la mitad inferior: se desplaza la proyección para
    // que el centro del globo quede más arriba. Es un recorte de la "película" de la
    // cámara, así los clics y las etiquetas siguen cuadrando sin tocar nada más.
    requestAnimationFrame(() => {
      const cam = this.globe.camera();
      if (w < 820) cam.setViewOffset(w, h, 0, h * 0.2, w, h);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    });
  }
}
