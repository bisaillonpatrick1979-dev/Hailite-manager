-- Position relevée au moment du pointage.
--
-- Le géorepérage n'existait que dans le navigateur : le serveur acceptait
-- n'importe quel pointage et faisait confiance au drapeau `within_geofence`
-- envoyé par le client. Refuser la permission de localisation suffisait donc à
-- pointer depuis n'importe où. Le serveur recalcule maintenant la distance au
-- chantier à partir de ces colonnes (voir enforcePunchGeofence dans
-- apiRoutes.ts) et réécrit lui-même `within_geofence`.
--
-- Les colonnes restent nulles quand l'appareil ne fournit aucune position :
-- le pointage est alors accepté mais forcé en `approval_status = 'pending'`.
alter table punches
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

comment on column punches.latitude is
  'Latitude relevée au pointage. Null = position indisponible (pointage à approuver).';
comment on column punches.longitude is
  'Longitude relevée au pointage. Null = position indisponible (pointage à approuver).';
