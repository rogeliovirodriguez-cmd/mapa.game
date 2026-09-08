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
let watchId = null;
let grabando = false;

// Configuración de filtros GPS
const DISTANCIA_MINIMA_PUNTO = 2; // Guardar punto si se movió al menos 2m
const MAX_ERROR_GPS = 15;         // Ignorar lecturas con margen de error mayor a 15m

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');

// Iniciar rastreo general al cargar
if (navigator.geolocation) {
  watchId = navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 5000
  });
} else {
  alert("Tu navegador no soporta GPS");
}

// Botón Iniciar
btnStart.addEventListener('click', () => {
  grabando = true;
  ruta = [];
  lineaRastro.setLatLngs([]);
  btnStart.disabled = true;
  btnStop.disabled = false;
});

// Botón Terminar / Calcular
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

  // Filtrar lecturas de mala precisión
  if (precision > MAX_ERROR_GPS) return;

  const nuevaCoord = [lng, lat];

  // Mover marcador del jugador
  if (!marcadorUsuario) {
    marcadorUsuario = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 18);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // Si no está en modo grabación, no guardamos puntos en el rastro
  if (!grabando) return;

  // Filtro de distancia mínima entre puntos
  if (ruta.length > 0) {
    const ultimoPunto = turf.point(ruta[ruta.length - 1]);
    const puntoActual = turf.point(nuevaCoord);
    const dist = turf.distance(ultimoPunto, puntoActual, { units: 'meters' });

    if (dist < DISTANCIA_MINIMA_PUNTO) return;
  }

  // Guardar punto y actualizar la línea en el mapa
  ruta.push(nuevaCoord);
  lineaRastro.addLatLng([lat, lng]);
}

function calcularYConquistarArea() {
  if (ruta.length < 3) {
    alert("Se necesitan al menos 3 puntos registrados para formar un área. ¡Camina una distancia mayor!");
    lineaRastro.setLatLngs([]);
    return;
  }

  // Unir automáticamente el último punto registrado con el punto inicial para cerrar la figura
  ruta.push(ruta[0]); 

  try {
    const poligono = turf.polygon([ruta]);
    const areaM2 = turf.area(poligono);

    // Pintar el polígono en el mapa
    L.geoJSON(poligono, {
      style: { color: '#28a745', fillColor: '#28a745', fillOpacity: 0.4, weight: 2 }
    }).addTo(map);

    // Sumar y mostrar el área calculada
    totalArea += Math.round(areaM2);
    document.getElementById('area-val').innerText = totalArea;
  } catch (error) {
    alert("No se pudo calcular el área. Asegúrate de no cruzar la línea sobre sí misma.");
  }

  // Limpiar la línea temporal
  lineaRastro.setLatLngs([]);
}
