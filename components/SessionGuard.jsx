// components/SessionGuard.jsx
export default function SessionGuard({ children }) {
  // Login disabilitato: restituisce semplicemente i children (o nulla)
  return children ?? null;
}
