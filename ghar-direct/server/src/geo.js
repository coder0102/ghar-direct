'use strict';

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

// Distance between two GPS points in metres.
function haversineM(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Rounds to about 1 km so strangers never see the exact spot.
function roundArea(x) {
  return Math.round(x * 100) / 100;
}

module.exports = { haversineM, roundArea };
