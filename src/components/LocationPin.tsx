import type { AttendanceLocation } from "../types";
import { mapLink } from "../utils/geolocation";

/** Small clickable pin next to a self-punched time, opening the captured GPS location in Google
 * Maps — lets an admin confirm a staff member actually punched in from the office. Renders
 * nothing for admin-marked/overridden shifts, which never carry a location. */
export function LocationPin({ location }: { location?: AttendanceLocation | null }) {
  if (!location) return null;
  const accuracyLabel = location.accuracy ? ` (±${Math.round(location.accuracy)}m)` : "";
  return (
    <a
      href={mapLink(location)}
      target="_blank"
      rel="noopener noreferrer"
      title={`View punch location${accuracyLabel}`}
      className="ml-1 text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
      onClick={(e) => e.stopPropagation()}
    >
      📍
    </a>
  );
}
