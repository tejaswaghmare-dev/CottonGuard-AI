import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, useMap } from 'react-leaflet';
import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';

function MapControls({ value, onChange }) {
  const map = useMap();
  const polygonRef = useRef(null);

  useEffect(() => {
    // Add Geoman controls
    map.pm.addControls({
      position: 'topleft',
      drawText: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawRectangle: false,
      drawPolyline: false,
      drawMarker: true,
      drawPolygon: true,
      editMode: true,
      removalMode: true,
    });

    map.pm.setGlobalOptions({
      allowSelfIntersection: false,
    });

    // Polygon created
    const handleCreate = (e) => {
      if (e.shape !== 'Polygon') return;

      if (polygonRef.current) {
        map.removeLayer(polygonRef.current);
      }

      const layer = e.layer;
      polygonRef.current = layer;

      const latLngs = layer.getLatLngs()[0];

      const boundary = latLngs.map((point) => ({
        lat: point.lat,
        lng: point.lng,
      }));

      const center = layer.getBounds().getCenter();

      const area = calculateAreaAcres(boundary);

      onChange?.({
        latitude: center.lat,
        longitude: center.lng,
        boundary,
        area,
        areaUnit: 'acres',
        locationLabel:
          value?.locationLabel ||
          `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}`,
      });
    };

    // Marker created
    const handleMarker = (e) => {
      const position = e.layer.getLatLng();

      onChange?.({
        latitude: position.lat,
        longitude: position.lng,
        boundary: value?.boundary || [],
        locationLabel:
          value?.locationLabel ||
          `${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`,
      });
    };

    map.on('pm:create', handleCreate);
    map.on('pm:create', handleMarker);

    return () => {
      map.off('pm:create', handleCreate);
      map.off('pm:create', handleMarker);
    };
  }, [map, onChange, value]);

  return null;
}

function calculateAreaAcres(coords) {
  if (!coords || coords.length < 3) return 0;

  const radius = 6378137;

  let area = 0;

  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;

    const lat1 = (coords[i].lat * Math.PI) / 180;
    const lat2 = (coords[j].lat * Math.PI) / 180;

    const lng1 = (coords[i].lng * Math.PI) / 180;
    const lng2 = (coords[j].lng * Math.PI) / 180;

    area +=
      (lng2 - lng1) *
      (2 + Math.sin(lat1) + Math.sin(lat2));
  }

  area = Math.abs((area * radius * radius) / 2);

  // square metres → acres
  const acres = area / 4046.8564224;

  return Number(acres.toFixed(3));
}

export default function FarmMap({ value, onChange }) {
  const latitude = value?.latitude || 18.5204;
  const longitude = value?.longitude || 73.8567;

  const boundary =
    value?.boundary?.length >= 3
      ? value.boundary.map((p) => [p.lat, p.lng])
      : [];

  return (
    <div>
      <div
        style={{
          height: '500px',
          width: '100%',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <MapContainer
          center={[latitude, longitude]}
          zoom={15}
          style={{ height: '100%', width: '100%' }}
        >
          {/* Esri Satellite */}
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution="Tiles © Esri"
          />

          {/* Existing boundary */}
          {boundary.length >= 3 && (
            <Polygon
              positions={boundary}
              pathOptions={{
                fillOpacity: 0.35,
              }}
            />
          )}

          <MapControls
            value={value}
            onChange={onChange}
          />
        </MapContainer>
      </div>

      <div
        style={{
          marginTop: '10px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <span className="muted">
          🛰️ Satellite view
        </span>

        <span className="muted">
          🔷 Use polygon tool to draw farm boundary
        </span>

        <span className="muted">
          📐 Area is calculated automatically
        </span>
      </div>
    </div>
  );
}