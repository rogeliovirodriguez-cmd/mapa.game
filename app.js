// ==========================================
// CONFIGURACIÓN DE SUPABASE
// ==========================================
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_KEY = 'TU_ANON_PUBLIC_KEY';

let supabaseClient = null;
if (typeof supabase !== 'undefined' && SUPABASE_URL && !SUPABASE_URL.includes('TU_PROYECTO')) {
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// Variables de Estado
let miUsuario = null;
let miApodo = "Jugador";
let miColor = "#00FF66";
let totalArea = 0;
let grabando = false;
let ruta = [];

const rankingJugadores = {};
const jugadoresRemotos = {};

// Elementos UI
const modalAuth = document.getElementById('modal-auth');
const authForm = document.getElementById('auth-form');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const groupNickname = document.getElementById('group-nickname');
const btnAuthSubmit = document.getElementById('btn-auth-submit');
const authError = document.getElementById('auth-error');

const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const bottomSheet = document.getElementById('bottom-sheet');
const sheetHeader = document.getElementById('sheet-header');
const sheetToggleIcon = document.getElementById('sheet-toggle-icon');

let isRegisterMode = false;

// ==========================================
// PESTAÑAS LOGIN / REGISTRO
// ==========================================
tabLogin.addEventListener('click', () => {
  isRegisterMode = false;
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  groupNickname.style.display = 'none';
  btnAuthSubmit.innerText = 'Entrar a la Arena';
});

tabRegister.addEventListener('click', () => {
  isRegisterMode = true;
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  groupNickname.style.display = 'block';
  btnAuthSubmit.innerText = 'Crear Cuenta';
});

// ==========================================
// AUTENTICACIÓN CON SUPABASE
// ==========================================
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.innerText = '';
  
  const email = document.getElementById('auth-email').value;
  const password = document.getElementById('auth-password').value;
  const nickname = document.getElementById('auth-nickname').value;

  if (!supabaseClient) {
    iniciarSesionDemo(nickname || email.split('@')[0]);
    return;
  }

  if (isRegisterMode) {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
      options: { data: { nickname: nickname || 'Conquistador' } }
    });

    if (error) {
      authError.innerText = error.message;
    } else {
      alert("¡Cuenta creada con éxito!");
      iniciarJuegoConUsuario(data.user);
    }
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      authError.innerText = error.message;
    } else {
      iniciarJuegoConUsuario(data.user);
    }
  }
});

function iniciarSesionDemo(nombre) {
  miApodo = nombre;
  miColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  prepararInterfazJuego();
}

function iniciarJuegoConUsuario(user) {
  miUsuario = user;
  miApodo = user.user_metadata?.nickname || user.email.split('@')[0];
  miColor = '#' + Math.floor(Math.random()*16777215).toString(16);
  prepararInterfazJuego();
}

function prepararInterfazJuego() {
  modalAuth.style.display = 'none';
  document.getElementById('hud-player-name').innerText = miApodo;
  document.getElementById('player-dot').style.backgroundColor = miColor;
  document.getElementById('player-dot').style.color = miColor;

  iniciarMapa();
  iniciarGPS();
  iniciarMultijugador();
}

// ==========================================
// MAPA Y RASTREO GPS
// ==========================================
let map = null;
let lineaRastro = null;
let marcadorUsuario = null;

function iniciarMapa() {
  map = L.map('map', { zoomControl: false }).setView([0, 0], 17);

  // Mapa Modo Oscuro Nativo
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    maxNativeZoom: 18,
    subdomains: 'abcd',
    attribution: '© OpenStreetMap © CARTO'
  }).addTo(map);

  lineaRastro = L.polyline([], { color: miColor, weight: 5, smoothFactor: 2.0 }).addTo(map);

  setTimeout(() => map.invalidateSize(), 500);
}

function iniciarGPS() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(actualizarPosicion, console.error, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    });
  }
}

function actualizarPosicion(pos) {
  const lat = pos.coords.latitude;
  const lng = pos.coords.longitude;
  if (pos.coords.accuracy > 20) return;

  const nuevaCoord = [lng, lat];

  if (!marcadorUsuario) {
    marcadorUsuario = L.circleMarker([lat, lng], {
      radius: 8,
      color: '#ffffff',
      fillColor: miColor,
      fillOpacity: 1
    }).addTo(map);
    map.setView([lat, lng], 17);
  } else {
    marcadorUsuario.setLatLng([lat, lng]);
  }

  // Transmitir posición a rivales
  if (canalJuego) {
    canalJuego.send({
      type: 'broadcast',
      event: 'posicion_jugador',
      payload: { id: miApodo, nombre: miApodo, lat, lng, color: miColor }
    });
  }

  if (!grabando) return;

  if (ruta.length > 0) {
    const ultimoPunto = turf.point(ruta[ruta.length - 1]);
    const puntoActual = turf.point(nuevaCoord);
    if (turf.distance(ultimoPunto, puntoActual, { units: 'meters' }) < 2) return;
  }

  ruta.push(nuevaCoord);
  lineaRastro.addLatLng([lat, lng]);
}

// ==========================================
// BOTONES Y CONQUISTA DE TERRITORIO
// ==========================================
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

function calcularYConquistarArea() {
  if (ruta.length < 3) {
    alert("Camina más distancia para formar un polígono.");
    lineaRastro.setLatLngs([]);
    return;
  }

  ruta.push(ruta[0]);

  try {
    const poligono = turf.polygon([ruta]);
    const areaM2 = turf.area(poligono);

    L.geoJSON(poligono, {
      style: { color: miColor, fillColor: miColor, fillOpacity: 0.4, weight: 2 }
    }).addTo(map);

    totalArea += Math.round(areaM2);
    document.getElementById('area-val').innerText = totalArea;

    // Actualizar ranking local
    rankingJugadores[miApodo] = { area: totalArea, color: miColor };
    actualizarTablaPosiciones();

    // Transmitir polígono a la comunidad
    if (canalJuego) {
      canalJuego.send({
        type: 'broadcast',
        event: 'area_conquistada',
        payload: { id: miApodo, nombre: miApodo, poligono, color: miColor, areaTotal: totalArea }
      });
    }
  } catch (err) {
    alert("Asegúrate de no cruzar tus propias líneas.");
  }

  lineaRastro.setLatLngs([]);
}

// ==========================================
// REALTIME MULTIJUGADOR (SUPABASE)
// ==========================================
let canalJuego = null;

function iniciarMultijugador() {
  if (!supabaseClient) return;

  canalJuego = supabaseClient.channel('mapa-multijugador');

  canalJuego.on('broadcast', { event: 'posicion_jugador' }, ({ payload }) => {
    if (payload.id === miApodo) return;

    if (!jugadoresRemotos[payload.id]) {
      jugadoresRemotos[payload.id] = L.circleMarker([payload.lat, payload.lng], {
        radius: 7,
        color: payload.color,
        fillColor: payload.color,
        fillOpacity: 0.8
      }).addTo(map).bindPopup(payload.nombre);
    } else {
      jugadoresRemotos[payload.id].setLatLng([payload.lat, payload.lng]);
    }
  });

  canalJuego.on('broadcast', { event: 'area_conquistada' }, ({ payload }) => {
    if (payload.id === miApodo) return;

    L.geoJSON(payload.poligono, {
      style: { color: payload.color, fillColor: payload.color, fillOpacity: 0.4, weight: 2 }
    }).addTo(map);

    rankingJugadores[payload.nombre] = { area: payload.areaTotal, color: payload.color };
    actualizarTablaPosiciones();
  });

  canalJuego.subscribe();
}

// ==========================================
// TABLA DE POSICIONES (BOTTOM SHEET)
// ==========================================
sheetHeader.addEventListener('click', () => {
  bottomSheet.classList.toggle('collapsed');
  sheetToggleIcon.innerText = bottomSheet.classList.contains('collapsed') ? '▲' : '▼';
});

function actualizarTablaPosiciones() {
  const listaUI = document.getElementById('leaderboard-list');
  const ordenados = Object.entries(rankingJugadores)
    .map(([nombre, d]) => ({ nombre, ...d }))
    .sort((a, b) => b.area - a.area);

  if (ordenados.length === 0) {
    listaUI.innerHTML = '<li class="empty-msg">Nadie ha conquistado territorios aún</li>';
    return;
  }

  listaUI.innerHTML = ordenados.map((p, idx) => `
    <li>
      <div class="lb-player">
        <span class="lb-rank">#${idx + 1}</span>
        <span class="color-dot" style="background:${p.color}"></span>
        <strong>${p.nombre}</strong>
      </div>
      <span class="lb-area">${Math.round(p.area)} m²</span>
    </li>
  `).join('');
}
