import { haversineKm } from '@globe-trace/shared';

/**
 * Las bases de geolocalización suelen fallar con routers troncales: devuelven la
 * sede del operador (p. ej. Berlín) aunque el router esté en París. Pero los
 * operadores codifican la ubicación en el nombre DNS de sus routers:
 *
 *   r2-par1-fr.as5405.net        → par = París
 *   ae-4.r30.tokyjp05.jp.bb...   → toky = Tokio
 *   be2-ldn-lon.cogentco.com     → ldn = Londres
 *
 * Esta tabla recoge los códigos más habituales (IATA y abreviaturas de operador).
 */
const CITIES = {
  // Europa
  mad: ['Madrid', 'ES', 40.4168, -3.7038],
  bcn: ['Barcelona', 'ES', 41.3874, 2.1686],
  lis: ['Lisboa', 'PT', 38.7223, -9.1393],
  par: ['París', 'FR', 48.8566, 2.3522],
  mrs: ['Marsella', 'FR', 43.2965, 5.3698],
  mrsl: ['Marsella', 'FR', 43.2965, 5.3698],
  lon: ['Londres', 'GB', 51.5074, -0.1278],
  ldn: ['Londres', 'GB', 51.5074, -0.1278],
  lhr: ['Londres', 'GB', 51.5074, -0.1278],
  ams: ['Ámsterdam', 'NL', 52.3676, 4.9041],
  bru: ['Bruselas', 'BE', 50.8503, 4.3517],
  fra: ['Fráncfort', 'DE', 50.1109, 8.6821],
  ffm: ['Fráncfort', 'DE', 50.1109, 8.6821],
  dus: ['Düsseldorf', 'DE', 51.2277, 6.7735],
  ham: ['Hamburgo', 'DE', 53.5511, 9.9937],
  ber: ['Berlín', 'DE', 52.52, 13.405],
  muc: ['Múnich', 'DE', 48.1351, 11.582],
  zrh: ['Zúrich', 'CH', 47.3769, 8.5417],
  gva: ['Ginebra', 'CH', 46.2044, 6.1432],
  mil: ['Milán', 'IT', 45.4642, 9.19],
  mxp: ['Milán', 'IT', 45.4642, 9.19],
  rom: ['Roma', 'IT', 41.9028, 12.4964],
  vie: ['Viena', 'AT', 48.2082, 16.3738],
  prg: ['Praga', 'CZ', 50.0755, 14.4378],
  waw: ['Varsovia', 'PL', 52.2297, 21.0122],
  cph: ['Copenhague', 'DK', 55.6761, 12.5683],
  sto: ['Estocolmo', 'SE', 59.3293, 18.0686],
  sth: ['Estocolmo', 'SE', 59.3293, 18.0686],
  osl: ['Oslo', 'NO', 59.9139, 10.7522],
  hel: ['Helsinki', 'FI', 60.1699, 24.9384],
  dub: ['Dublín', 'IE', 53.3498, -6.2603],
  // América
  nyc: ['Nueva York', 'US', 40.7128, -74.006],
  nyk: ['Nueva York', 'US', 40.7128, -74.006],
  ewr: ['Newark', 'US', 40.7357, -74.1724],
  ash: ['Ashburn', 'US', 39.0438, -77.4874],
  iad: ['Ashburn', 'US', 39.0438, -77.4874],
  was: ['Washington', 'US', 38.9072, -77.0369],
  atl: ['Atlanta', 'US', 33.749, -84.388],
  mia: ['Miami', 'US', 25.7617, -80.1918],
  chi: ['Chicago', 'US', 41.8781, -87.6298],
  ord: ['Chicago', 'US', 41.8781, -87.6298],
  dfw: ['Dallas', 'US', 32.7767, -96.797],
  dal: ['Dallas', 'US', 32.7767, -96.797],
  den: ['Denver', 'US', 39.7392, -104.9903],
  sea: ['Seattle', 'US', 47.6062, -122.3321],
  sjc: ['San José', 'US', 37.3382, -121.8863],
  sjo: ['San José', 'US', 37.3382, -121.8863],
  snjs: ['San José', 'US', 37.3382, -121.8863],
  sfo: ['San Francisco', 'US', 37.7749, -122.4194],
  lax: ['Los Ángeles', 'US', 34.0522, -118.2437],
  tor: ['Toronto', 'CA', 43.6532, -79.3832],
  yyz: ['Toronto', 'CA', 43.6532, -79.3832],
  gru: ['São Paulo', 'BR', -23.5505, -46.6333],
  sao: ['São Paulo', 'BR', -23.5505, -46.6333],
  // Asia y Oceanía
  tyo: ['Tokio', 'JP', 35.6762, 139.6503],
  tok: ['Tokio', 'JP', 35.6762, 139.6503],
  toky: ['Tokio', 'JP', 35.6762, 139.6503],
  osa: ['Osaka', 'JP', 34.6937, 135.5023],
  hkg: ['Hong Kong', 'HK', 22.3193, 114.1694],
  sin: ['Singapur', 'SG', 1.3521, 103.8198],
  sng: ['Singapur', 'SG', 1.3521, 103.8198],
  sngp: ['Singapur', 'SG', 1.3521, 103.8198],
  syd: ['Sídney', 'AU', -33.8688, 151.2093],
  sydn: ['Sídney', 'AU', -33.8688, 151.2093],
  mel: ['Melbourne', 'AU', -37.8136, 144.9631],
  bom: ['Bombay', 'IN', 19.076, 72.8777],
  dxb: ['Dubái', 'AE', 25.2048, 55.2708],
};

/**
 * Busca un código de ciudad en el hostname de un router.
 * Se trocea por puntos y guiones y se quitan los dígitos ("par1" → "par",
 * "tokyjp05" → "tokyjp"). Un trozo cuenta si es exactamente un código, o un
 * código seguido del país correcto ("tokyjp" = "toky" + "jp").
 *
 * Para reducir falsos positivos, si el hostname contiene un código de país
 * suelto ("-fr", ".jp.") tiene que coincidir con el de la ciudad.
 *
 * @returns {{ city: string, countryCode: string, lat: number, lon: number } | null}
 */
export function hintFromHostname(hostname) {
  if (!hostname) return null;
  const tokens = hostname.toLowerCase().split(/[.-]/).map((t) => t.replace(/\d+/g, ''));
  const countryTokens = new Set(tokens.filter((t) => t.length === 2));

  for (const t of tokens) {
    let entry = CITIES[t];
    // "tokyjp": código + país pegados
    if (!entry && t.length > 4) {
      const code = t.slice(0, -2);
      const cc = t.slice(-2).toUpperCase();
      if (CITIES[code]?.[1] === cc) entry = CITIES[code];
    }
    if (!entry) continue;

    const [city, countryCode, lat, lon] = entry;
    const otherCountry = [...countryTokens].some(
      (c) => isCountryCode(c) && c.toUpperCase() !== countryCode,
    );
    if (otherCountry) continue;
    return { city, countryCode, lat, lon };
  }
  return null;
}

// Solo cuentan los códigos de país de la tabla, y nunca los que coinciden con
// nombres de interfaz de router: ae (aggregated ethernet, Juniper), be (bundle-ethernet,
// Cisco), et/xe/ge (ethernet de 100/10/1 Gb)... "be2-sjo" no es Bélgica
const INTERFACE_PREFIXES = ['ae', 'be', 'et', 'xe', 'ge', 'te', 'po', 'gi', 'lo'];
const KNOWN_CC = new Set(Object.values(CITIES).map(([, cc]) => cc.toLowerCase()));
for (const p of INTERFACE_PREFIXES) KNOWN_CC.delete(p);
const isCountryCode = (t) => KNOWN_CC.has(t);

const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });

/**
 * Decide la ubicación final de un salto a partir de tres fuentes:
 *  - la base de datos (ciudad, ISP, ASN),
 *  - la pista del hostname, si la hay y es físicamente posible,
 *  - la comprobación de la velocidad de la luz.
 *
 * La pista del hostname gana a la base de datos si difieren en más de 50 km:
 * el operador sabe mejor dónde está su router que una base de datos genérica.
 * El ISP y el ASN se conservan siempre de la base de datos.
 *
 * Campos añadidos al GeoInfo:
 *   source: 'db' | 'hostname'
 *   plausible: false si la ubicación es incompatible con la latencia medida
 */
export function refineLocation({ dbGeo, hostname, rtts, origin }) {
  const hint = hintFromHostname(hostname);

  if (hint && isPhysicallyPossible(origin, hint, rtts)) {
    if (!dbGeo || haversineKm(dbGeo, hint) > 50) {
      return {
        city: hint.city,
        country: regionNames.of(hint.countryCode),
        countryCode: hint.countryCode,
        lat: hint.lat,
        lon: hint.lon,
        accuracyKm: null,
        isp: dbGeo?.isp ?? null,
        asn: dbGeo?.asn ?? null,
        source: 'hostname',
        plausible: true,
      };
    }
  }

  if (!dbGeo) return null;
  return { ...dbGeo, source: 'db', plausible: isPhysicallyPossible(origin, dbGeo, rtts) };
}

// La luz en fibra óptica viaja a ~2/3 de c: unos 200 km por milisegundo.
// El RTT es ida y vuelta, así que en X ms el paquete puede alejarse como mucho X·100 km.
const KM_PER_MS_RTT = 100;

/**
 * ¿Puede estar este router donde dice la geolocalización, dado su RTT mínimo?
 * Si no hay origen o RTT, no se puede comprobar y se da por bueno.
 */
export function isPhysicallyPossible(origin, geo, rtts) {
  const valid = rtts.filter((r) => typeof r === 'number');
  if (!origin || !geo || valid.length === 0) return true;
  const minRtt = Math.min(...valid);
  // Margen de 1 ms: los tiempos de tracert vienen redondeados al milisegundo
  return haversineKm(origin, geo) <= (minRtt + 1) * KM_PER_MS_RTT;
}
