// ==========================================
// CONFIGURACIÓN DE SUPABASE (Reemplaza con tus claves)
// ==========================================
const SUPABASE_URL = 'https://qmjdiptmzqvkrwdiyqdt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kdRPXiaT3yUxwav0JYjrBQ_oDkO_QEk';
const rankingJugadores = {}; 
// Estructura: { 'Apodo': { area: 1500, color: '#00FF66' } }

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('TU_PROYECTO')) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Variables de jugador
let miNombre = "Jugador";
const miJugadorId = 'jugador_' + Math.floor(Math.random() * 10000);
const miColor = '#' + Math.floor(Math.random()*16777215).toString(16);

// ==========================================
// CONFIGURACIÓN DEL MAPA
// ==========================================
const map = L.map('map').setView([0, 0], 17);

// Capa OpenStreetMap con sobre-zoom automático (evita 'Map data not yet available')
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 20,           // Permitir al usuario hacer zoom cercano
  maxNativeZoom: 18,     // Límite de las imágenes reales disponibles (después de 18 sólo agranda la imagen sin dar error)
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Forzar actualización del tamaño por si se redimensiona la pantalla
setTimeout(() => {
  map.invalidateSize();
}, 500);

let ruta = [];
let lineaRastro = L.polyline([], { color: miColor, weight: 5, smoothFactor: 2.0 }).addTo(map);
let marcadorUsuario = null;
let totalArea = 0;
let grabando = false;

const jugadoresRemotos = {};
const DISTANCIA_MINIMA_PUNTO = 2;
const MAX_ERROR_GPS = 15;

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const modalNickname = document.getElementById('modal-nickname');
const inputNickname = document.getElementById('input-nickname');
const btnJoin = document.getElementById('btn-join');

// ==========================================
// CAPTURAR NOMBRE DE JUGADOR
// ==========================================
btnJoin.addEventListener('click', () => {
  const nombreInput = inputNickname.value.trim();
  if (nombreInput !== "") {
    miNombre = nombreInput;
  }
  document.getElementById('player-name-display').innerText = miNombre;
  modalNickname.style.display = 'none';

  iniciarGPS();
  iniciarMultijugador();
});

// ==========================================
// CANAL TIEMPO REAL (SUPABASE)
// ==========================================
let canalJuego = null;

function iniciarMultijugador() {
  if (!supabaseClient) return;

  canalJuego = supabaseClient.channel('mapa-multijugador');

  // Escuchar posiciones remotas
  canalJuego.on('broadcast', { event: 'posicion_jugador' }, payload => {
    const data = payload.payload;
    if (data.id === miJugadorId) return;

    if (!jugadoresRemotos[data.id]) {
      jugadoresRemotos[data.id] = {
        marcador: L.circleMarker([data.lat, data.lng], {
          radius: 8,
          color: data.color,
          fillColor: data.color,
          fillOpacity: 0.9
        }).addTo(map).bindPopup(`<b>${data.nombre}</b>`)
      };
    } else {
      jugadoresRemotos[data.id].marcador.setLatLng([data.lat, data.lng]);
      jugadoresRemotos[data.id].marcador.setPopupContent(`<b>${data.nombre}</b>`);
    }
  });

  // Escuchar áreas conquistadas remotas
canalJuego.on('broadcast', { event: 'territorio_conquistado' }, ({ payload }) => {
    // Actualizar o insertar el total de m² del otro jugador
    rankingJugadores[payload.jugador] = {
      area: payload.areaTotal,
      color: payload.color
    };

    // Dibujar el nuevo polígono en el mapa (si aún no está dibujado)
    L.geoJSON(payload.poligono, {
      style: { color: payload.color, fillColor: payload.color, fillOpacity: 0.4 }
    }).addTo(map);

    // Refrescar el Leaderboard
    actualizarTablaPosiciones();
  });

  canalJuego.subscribe();
}

// ==========================================
// RASTREO GPS
// ==========================================
function iniciarGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
  } else {
    alert("Tu navegador no soporta GPS");
  }
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
const areaConquistada = turf.area(poligonoGeoJSON); 

// Sumar al total propio
if (!rankingJugadores[miApodo]) {
  rankingJugadores[miApodo] = { area: 0, color: miColor };
}
rankingJugadores[miApodo].area += areaConquistada;

// Actualizar UI propia
actualizarTablaPosiciones();

// Transmitir evento a los demás jugadores vía Supabase Realtime
canalJuego.send({
  type: 'broadcast',
  event: 'territorio_conquistado',
  payload: {
    jugador: miApodo,
    color: miColor,
    areaTotal: rankingJugadores[miApodo].area,
    poligono: poligonoGeoJSON
  }
});
});

function actualizarPosicion(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const precision = pos.coords.accuracy;

  if (precision > MAX_ERROR_GPS) return;

  const nuevaCoord = [lng, lat];

  if (!marcadorUsuario) {
    marcadorUsuario = L.marker([lat, lng]).addTo(map).bindPopup(`<b>${miNombre} (Tú)</b>`);
    map.setView([lat, lng], 18);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // Transmitir posición y apodo
  if (canalJuego) {
    canalJuego.send({
      type: 'broadcast',
      event: 'posicion_jugador',
      payload: { id: miJugadorId, nombre: miNombre, lat: lat, lng: lng, color: miColor }
    });
  }

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

    L.geoJSON(poligono, {
      style: { color: miColor, fillColor: miColor, fillOpacity: 0.4, weight: 2 }
    }).addTo(map).bindTooltip(`Área de ${miNombre}`);

    if (canalJuego) {
      canalJuego.send({
        type: 'broadcast',
        event: 'area_conquistada',
        payload: { id: miJugadorId, nombre: miNombre, poligono: poligono, color: miColor }
      });
    }

    totalArea += Math.round(areaM2);
    document.getElementById('area-val').innerText = totalArea;
  } catch (error) {
    alert("No se pudo calcular el área. Intenta no cruzar tus propias líneas.");
  }

  lineaRastro.setLatLngs([]);
}

function actualizarTablaPosiciones() {
  const listaUI = document.getElementById('leaderboard-list');
  if (!listaUI) return;

  // Convertir objeto a Array y ordenar de mayor a menor m²
  const rankingOrdenado = Object.entries(rankingJugadores)
    .map(([nombre, datos]) => ({ nombre, ...datos }))
    .sort((a, b) => b.area - a.area);

  if (rankingOrdenado.length === 0) {
    listaUI.innerHTML = '<li class="empty-msg">Sin territorios aún</li>';
    return;
  }

  listaUI.innerHTML = rankingOrdenado.map((jugador, index) => {
    // Formatear área (m² o km² si supera los 10,000 m²)
    let areaTexto = jugador.area >= 10000 
      ? (jugador.area / 1000000).toFixed(2) + ' km²' 
      : Math.round(jugador.area) + ' m²';

    return `
      <li>
        <div class="player-info">
          <span>#${index + 1}</span>
          <span class="color-indicator" style="background-color: ${jugador.color}"></span>
          <strong>${jugador.nombre}</strong>
        </div>
        <span class="area-val">${areaTexto}</span>
      </li>
    `;
  }).join('');
}
