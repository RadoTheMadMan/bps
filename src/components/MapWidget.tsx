'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const createSvgIcon = (color: string) => {
  return new L.DivIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    className: 'custom-svg-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const userIcon = createSvgIcon('#dc2626'); // Red marker
const storeIcon = createSvgIcon('#3b82f6'); // Blue marker

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      // Force high-detail zoom level 16 so street and building names materialize immediately
      map.setView(center, 16);
    }
  }, [center, map]);
  return null;
}

export default function MapWidget({ 
  userLocation, 
  places, 
  onMarkerClick 
}: { 
  userLocation: [number, number]; 
  places: any[]; 
  radiusKm: number;
  onMarkerClick: (place: any) => void;
}) {
  return (
    <div className="w-full h-full min-h-[350px] relative">
      <MapContainer center={userLocation} zoom={16} style={{ height: '100%', width: '100%' }}>
        {/* FREE PUBLIC OPENSTREETMAP DARK TILES - NO API KEYS REQUIRED */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        
        <Marker position={userLocation} icon={userIcon}>
          <Popup><span className="text-zinc-900 font-bold">Your Position</span></Popup>
        </Marker>
        
        {places.map((place) => {
          const lat = Number(place.latitude);
          const lon = Number(place.longitude);
          if (isNaN(lat) || isNaN(lon)) return null;

          return (
            <Marker 
              key={place.id} 
              position={[lat, lon]} 
              icon={storeIcon}
              eventHandlers={{ click: () => onMarkerClick(place) }}
            >
              <Popup>
                <div className="text-zinc-900 p-1 font-sans">
                  <p className="font-bold m-0 text-sm uppercase">{place.name}</p>
                  <p className="text-xs text-zinc-500 m-0 mt-0.5">{place.address}</p>
                </div>
              </Popup>
            </Marker>
          );
        })}
        <MapRecenter center={userLocation} />
      </MapContainer>
    </div>
  );
}