// Inicializar mapa centrado por defecto
const map = L.map('map').setView([0, 0], 18);

// Cargar mapa de OpenStreetMap (Gratis)
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19
}).addTo(map);

let ruta = [];
let lineaRastro = L.polyline([], { color: 'red', weight: 4 }).addTo(map);
let marcadorUsuario = null;
let totalArea = 0;

document.getElementById('btn-gps').addEventListener('click', () => {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
      enableHighAccuracy: true,
      maximumAge: 1000,
      timeout: 5000
    });
  } else {
    alert("Tu navegador no soporta GPS");
  }
});

function actualizarPosicion(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  const nuevaCoord = [lng, lat]; // Turf usa [longitud, latitud]

  // Mover marcador del jugador
  if (!marcadorUsuario) {
    marcadorUsuario = L.marker([lat, lng]).addTo(map);
    map.setView([lat, lng], 18);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // Agregar al rastro
  ruta.push(nuevaCoord);
  lineaRastro.addLatLng([lat, lng]);

  // Si tenemos suficientes puntos, verificamos si cerró un bucle
  if (ruta.length > 5) {
    const primerPunto = turf.point(ruta[0]);
    const ultimoPunto = turf.point(nuevaCoord);
    const distancia = turf.distance(primerPunto, ultimoPunto, { units: 'meters' });

    // Si vuelve al punto de origen (a menos de 5 metros de tolerancia)
    if (distancia < 5) {
      cerrarYConquistarArea();
    }
  }
}

function cerrarYConquistarArea() {
  if (ruta.length < 4) return;
  
  // Asegurar que la línea se cierre exactamente uniendo el último punto con el primero
  ruta.push(ruta[0]); 
  
  const poligono = turf.polygon([ruta]);
  const areaM2 = turf.area(poligono);
  
  // Pintar el área en el mapa
  L.geoJSON(poligono, {
    style: { color: 'red', fillColor: '#f03', fillOpacity: 0.5 }
  }).addTo(map);

  // Actualizar UI
  totalArea += Math.round(areaM2);
  document.getElementById('area-val').innerText = totalArea;

  // Reiniciar rastro para el siguiente círculo
  ruta = [];
  lineaRastro.setLatLngs([]);
}
