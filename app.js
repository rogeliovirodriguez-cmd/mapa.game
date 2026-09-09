// ==========================================
// CONFIGURACIÓN DE SUPABASE (Reemplaza con tus claves)
// ==========================================
const SUPABASE_URL = 'https://qmjdiptmzqvkrwdiyqdt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kdRPXiaT3yUxwav0JYjrBQ_oDkO_QEk';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Crear un ID único y un color aleatorio para cada jugador
const miJugadorId = 'jugador_' + Math.floor(Math.random() * 10000);
const miColor = '#' + Math.floor(Math.random()*16777215).toString(16);

// ==========================================
// CONFIGURACIÓN DEL MAPA
// ==========================================
const map = L.map('map').setView([0, 0], 18);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let ruta = [];
let lineaRastro = L.polyline([], { color: miColor, weight: 5, smoothFactor: 2.0 }).addTo(map);
let marcadorUsuario = null;
let totalArea = 0;
let grabando = false;

// Almacenar marcadores y trazos de otros jugadores
const jugadoresRemotos = {};

const DISTANCIA_MINIMA_PUNTO = 2;
const MAX_ERROR_GPS = 15;

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

// ==========================================
// CANAL DE CANAL TIEMPO REAL (SUPABASE BROADCAST)
// ==========================================
const canalJuego = supabaseClient.channel('mapa-multijugador');

// Escuchar posiciones de otros jugadores
canalJuego.on('broadcast', { event: 'posicion_jugador' }, payload => {
  const data = payload.payload;
  if (data.id === miJugadorId) return; // Ignorar mis propios mensajes

  // Si es un jugador nuevo, le creamos su marcador con su color
  if (!jugadoresRemotos[data.id]) {
    jugadoresRemotos[data.id] = {
      marcador: L.circleMarker([data.lat, data.lng], {
        radius: 8,
        color: data.color,
        fillColor: data.color,
        fillOpacity: 0.9
      }).addTo(map).bindPopup(data.id)
    };
  } else {
    jugadoresRemotos[data.id].marcador.setLatLng([data.lat, data.lng]);
  }
});

// Escuchar áreas conquistadas por otros jugadores
canalJuego.on('broadcast', { event: 'area_conquistada' }, payload => {
  const data = payload.payload;
  if (data.id === miJugadorId) return;

  L.geoJSON(data.poligono, {
    style: { color: data.color, fillColor: data.color, fillOpacity: 0.4, weight: 2 }
  }).addTo(map);
});

canalJuego.subscribe();

// ==========================================
// RASTREO GPS Y EVENTOS
// ==========================================
if (navigator.geolocation) {
  navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  });
} else {
  alert("Tu navegador no soporta GPS");
}

btnStart.addEventListener('click', () => {
  grabando = true;
  ruta = [];
  lineaRastro.setLatLngs([]);
  btnStart.disabled = true;
  btnStop.disabled = false;
});

btnStop.addEventListener('click', () => {
  if (!grabando) return;
  grabando = false;
  btnStart.disabled = false;
  btnStop.disabled = true;

  calcularYConquistarArea();
});

function actualizarPosicion(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const precision = pos.coords.accuracy;

  if (precision > MAX_ERROR_GPS) return;

  const nuevaCoord = [lng, lat];

  // Mi marcador local
  if (!marcadorUsuario) {
    marcadorUsuario = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 18);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // TRANSMITIR MI POSICIÓN A LOS DEMÁS
  canalJuego.send({
    type: 'broadcast',
    event: 'posicion_jugador',
    payload: { id: miJugadorId, lat: lat, lng: lng, color: miColor }
  });

  if (!grabando) return;

  if (ruta.length > 0) {
    const ultimoPunto = turf.point(ruta[ruta.length - 1]);
    const puntoActual = turf.point(nuevaCoord);
    const dist = turf.distance(ultimoPunto, puntoActual, { units: 'meters' });

    if (dist < DISTANCIA_MINIMA_PUNTO) return;
  }

  ruta.push(nuevaCoord);
  lineaRastro.addLatLng([lat, lng]);
}

function calcularYConquistarArea() {
  if (ruta.length < 3) {
    alert("Se necesitan al menos 3 puntos registrados para formar un área.");
    lineaRastro.setLatLngs([]);
    return;
  }

  ruta.push(ruta[0]); 

  try {
    const poligono = turf.polygon([ruta]);
    const areaM2 = turf.area(poligono);

    // Pintar mi área localmente
    L.geoJSON(poligono, {
      style: { color: miColor, fillColor: miColor, fillOpacity: 0.4, weight: 2 }
    }).addTo(map);

    // TRANSMITIR MI ÁREA CONQUISTADA A LOS DEMÁS
    canalJuego.send({
      type: 'broadcast',
      event: 'area_conquistada',
      payload: { id: miJugadorId, poligono: poligono, color: miColor }
    });

    totalArea += Math.round(areaM2);
    document.getElementById('area-val').innerText = totalArea;
  } catch (error) {
    alert("No se pudo calcular el área. Intenta no cruzar tus propias líneas.");
  }

  lineaRastro.setLatLngs([]);
}
