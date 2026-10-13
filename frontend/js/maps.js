// frontend/js/maps.js: Leaflet / OpenStreetMap helpers shared by browse and listing pages.
export const hasLeaflet = () => typeof window.L !== "undefined";

export function pinIcon(kind = "listing") {
  return window.L.divIcon({
    className: `map-pin map-pin--${kind}`,
    html: "<span></span>",
    iconSize: [28, 28],
    iconAnchor: kind === "you" ? [14, 14] : [14, 34],
    popupAnchor: [0, -30],
  });
}

export function tileLayer() {
  return window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  });
}

export function osmLink(lat, lng, zoom = 17) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln)) return "https://www.openstreetmap.org/";
  return `https://www.openstreetmap.org/?mlat=${la.toFixed(6)}&mlon=${ln.toFixed(6)}#map=${zoom}/${la.toFixed(6)}/${ln.toFixed(6)}`;
}

/** Address search via OpenStreetMap Nominatim (called only on a button press). Returns {lat,lng} or null. */
export async function geocode(query) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("Address search failed");
  const data = await res.json();
  return data.length ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;
}

/** Browser geolocation as a promise. Rejects with the GeolocationPositionError (code 1 = denied). */
export function locate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(Object.assign(new Error("unsupported"), { code: 0 })); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(e),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  });
}