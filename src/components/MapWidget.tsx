'use client';
import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix default Leaflet icon paths in Next.js
const customIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

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
  radiusKm, 
  onMarkerClick 
}: { 
  userLocation: [number, number]; 
  places: any[]; 
  radiusKm: number;
  onMarkerClick: (place: any) => void;
}) {
  return (
    <div className="w-full h-[350px] md:h-[450px] rounded-lg overflow-hidden border border-zinc-800 relative z-10">
      <MapContainer center={userLocation} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
        <Marker position={userLocation} icon={customIcon}>
          <Popup><span className="text-zinc-900 font-bold">Your Location</span></Popup>
        </Marker>
        
        {places.map((place) => (
          <Marker 
            key={place.id} 
            position={[place.latitude, place.longitude]} 
            icon={customIcon}
            eventHandlers={{ click: () => onMarkerClick(place) }}
          />
        ))}
        <MapRecenter center={userLocation} />
      </MapContainer>
    </div>
  );
}