// Inicializar mapa
const map = L.map('map').setView([0, 0], 18);

// Cargar mapa OpenStreetMap
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let ruta = [];
let lineaRastro = L.polyline([], { color: '#007bff', weight: 5, smoothFactor: 2.0 }).addTo(map);
let marcadorUsuario = null;
let totalArea = 0;

// Configuración de precisión
const DISTANCIA_MINIMA_PUNTO = 2; // Solo guardar punto si se movió al menos 2 metros
const DISTANCIA_CIERRE = 6;       // Tolerancia de 6 metros para cerrar el círculo al punto de origen
const MAX_ERROR_GPS = 15;         // Ignorar lecturas con precisión peor a 15 metros

document.getElementById('btn-gps').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
    document.getElementById('btn-gps').innerText = "Rastreando GPS...";
  } else {
    alert("Tu navegador no soporta GPS");
  }
});

function actualizarPosicion(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const precision = pos.coords.accuracy;

  // 1. FILTRO DE PRECISIÓN: Si el GPS está dando un salto muy impreciso, ignorarlo
  if (precision > MAX_ERROR_GPS) return;

  const nuevaCoord = [lng, lat]; // Turf usa [longitud, latitud]

  // Actualizar marcador del jugador en el mapa
  if (!marcadorUsuario) {
    marcadorUsuario = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 18);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // 2. FILTRO DE DISTANCIA MÍNIMA: Evitar acumular puntos encimados por ruido del GPS
  if (ruta.length > 0) {
    const ultimoPuntoGuardado = turf.point(ruta[ruta.length - 1]);
    const puntoActual = turf.point(nuevaCoord);
    const distDesdeUltimo = turf.distance(ultimoPuntoGuardado, puntoActual, { units: 'meters' });

    if (distDesdeUltimo < DISTANCIA_MINIMA_PUNTO) return; // No se ha movido suficiente
  }

  // Agregar al rastro
  ruta.push(nuevaCoord);
  lineaRastro.addLatLng([lat, lng]);

  // 3. DETECCIÓN DE CIERRE DE ÁREA: Comprobar si volvió al origen (primer punto)
  if (ruta.length > 4) {
    const primerPunto = turf.point(ruta[0]);
    const puntoActual = turf.point(nuevaCoord);
    const distAlOrigen = turf.distance(primerPunto, puntoActual, { units: 'meters' });

    if (distAlOrigen <= DISTANCIA_CIERRE) {
      cerrarYConquistarArea();
    }
  }
}

function cerrarYConquistarArea() {
  if (ruta.length < 4) return;
  
  // Unir el último punto con el primero para cerrar el polígono sin huecos
  ruta.push(ruta[0]); 
  
  const poligono = turf.polygon([ruta]);
  const areaM2 = turf.area(poligono);
  
  // Pintar el área conquistada
  L.geoJSON(poligono, {
    style: { color: '#28a745', fillColor: '#28a745', fillOpacity: 0.4, weight: 2 }
  }).addTo(map);

  // Actualizar interfaz
  totalArea += Math.round(areaM2);
  document.getElementById('area-val').innerText = totalArea;

  // Reiniciar rastro para el siguiente trazo
  ruta = [];
  lineaRastro.setLatLngs([]);
}
