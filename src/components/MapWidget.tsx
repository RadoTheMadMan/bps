'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Create a bulletproof inline SVG icon to completely bypass asset path resolution bugs
const createSvgIcon = (color: string) => {
  return new L.DivIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`,
    className: 'custom-svg-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

const userIcon = createSvgIcon('#dc2626'); // Red marker for user location
const storeIcon = createSvgIcon('#3b82f6'); // Blue marker for grocery stores

function MapRecenter({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 14);
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
      <MapContainer center={userLocation} zoom={13} style={{ height: '100%', width: '100%' }}>
      <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
      />
        <Marker position={userLocation} icon={userIcon}>
          <Popup><span className="text-zinc-900 font-bold">Your Position</span></Popup>
        </Marker>
        
        {places.map((place) => {
  const lat = Number(place.latitude);
  const lon = Number(place.longitude);
  
  // Skip corrupt or unparsed database rows to prevent breaking the layout engine
  if (isNaN(lat) || isNaN(lon)) return null;

  return (
    <Marker 
      key={place.id} 
      position={[lat, lon]} 
      icon={storeIcon}
      eventHandlers={{
        click: () => onMarkerClick(place)
      }}
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