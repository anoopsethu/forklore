/**
 * Stats Utility Functions
 * Calculate derived metrics from dish history steps
 */

interface Step {
    year: string;
    lat: number | null;
    lng: number | null;
    title: string;
    description: string;
}

/**
 * Convert degrees to radians
 */
function deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns Distance in kilometers
 */
function getDistanceFromLatLonInKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
): number {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) *
        Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate total journey distance from all steps
 * @returns Total distance in km, rounded to nearest 100
 */
export function calculateTotalDistance(steps: Step[]): number {
    let totalDistance = 0;

    // Filter steps with valid coordinates
    const validSteps = steps.filter(
        (step) => step.lat !== null && step.lng !== null
    );

    for (let i = 0; i < validSteps.length - 1; i++) {
        const current = validSteps[i];
        const next = validSteps[i + 1];

        if (
            current.lat !== null &&
            current.lng !== null &&
            next.lat !== null &&
            next.lng !== null
        ) {
            totalDistance += getDistanceFromLatLonInKm(
                current.lat,
                current.lng,
                next.lat,
                next.lng
            );
        }
    }

    // Round to nearest 100km
    return Math.round(totalDistance / 100) * 100;
}

/**
 * Extract approximate year from a year string
 * Handles formats like "1850", "200 AD", "3000 BCE", "Late 19th Century"
 */
export function extractYear(yearString: string): number | null {
    if (!yearString) return null;

    const str = yearString.toLowerCase();

    // Handle BCE/BC dates
    const bceMatch = str.match(/(\d{1,4})\s*(bce|bc)/i);
    if (bceMatch) {
        return -parseInt(bceMatch[1], 10);
    }

    // Handle century references (e.g., "19th Century" -> 1850)
    const centuryMatch = str.match(/(\d{1,2})(st|nd|rd|th)\s*century/i);
    if (centuryMatch) {
        const century = parseInt(centuryMatch[1], 10);
        return (century - 1) * 100 + 50; // Middle of the century
    }

    // Handle plain years (3-4 digit numbers)
    const yearMatch = str.match(/\d{3,4}/);
    if (yearMatch) {
        return parseInt(yearMatch[0], 10);
    }

    return null;
}

/**
 * Calculate the timeline span between first and last step
 */
export function calculateTimelineSpan(steps: Step[]): {
    years: number | null;
    fallbackEra: string;
} {
    if (steps.length === 0) {
        return { years: null, fallbackEra: "Unknown" };
    }

    const firstYear = extractYear(steps[0].year);
    const lastYear = extractYear(steps[steps.length - 1].year);

    if (firstYear !== null && lastYear !== null) {
        return {
            years: Math.abs(lastYear - firstYear),
            fallbackEra: steps[0].year
        };
    }

    // Fallback to displaying the era of the first step
    return {
        years: null,
        fallbackEra: steps[0].year
    };
}

/**
 * Count unique stops (steps with valid coordinates)
 */
export function countStops(steps: Step[]): number {
    return steps.filter((step) => step.lat !== null && step.lng !== null).length;
}

/**
 * Format number with compact notation (e.g., 1.2K, 1.5M)
 */
function formatNumberCompact(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toString();
}

/**
 * Format distance for display
 * @returns Formatted string like "5.9K km"
 */
export function formatDistance(km: number): string {
    if (km === 0) return "0 km";
    return `${formatNumberCompact(km)} km`;
}

/**
 * Format timeline span for display
 * @returns Formatted string like "~200" or era fallback
 */
export function formatTimelineSpan(span: {
    years: number | null;
    fallbackEra: string;
}): string {
    if (span.years !== null) {
        return `~${formatNumberCompact(span.years)}`;
    }
    return span.fallbackEra;
}
