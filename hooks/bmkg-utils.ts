import { WeatherInfo } from './use-weather';

/**
 * BMKG Weather Codes Mapping
 * Reference: https://data.bmkg.go.id/prakiraan-cuaca/
 */
export function bmkgToInfo(descEn: string): WeatherInfo {
    const desc = descEn.toLowerCase();

    if (desc.includes('clear')) return { description: 'Clear', icon: 'sunny' };
    if (desc.includes('partly cloudy')) return { description: 'Partly Cloudy', icon: 'partly-sunny' };
    if (desc.includes('mostly cloudy')) return { description: 'Mostly Cloudy', icon: 'cloudy' };
    if (desc.includes('cloudy')) return { description: 'Cloudy', icon: 'cloudy' };
    if (desc.includes('overcast')) return { description: 'Overcast', icon: 'cloud' };
    if (desc.includes('haze') || desc.includes('mist') || desc.includes('fog')) return { description: 'Foggy', icon: 'cloud' };
    if (desc.includes('smoke')) return { description: 'Smoke', icon: 'cloud' };
    if (desc.includes('light rain') || desc.includes('drizzle')) return { description: 'Light Rain', icon: 'rainy' };
    if (desc.includes('heavy rain')) return { description: 'Heavy Rain', icon: 'rainy' };
    if (desc.includes('rain')) return { description: 'Rain', icon: 'rainy' };
    if (desc.includes('thunderstorm')) return { description: 'Thunderstorm', icon: 'thunderstorm' };

    return { description: descEn, icon: 'partly-sunny' };
}

import bmkgData from '../assets/data/bmkg-codes.json';

/**
 * Default administrative code
 */
export const DEFAULT_ADM4_CODE = bmkgData.default_adm4;

/**
 * Mapping of district codes to BMKG ADM4 codes
 */
export const AREA_TO_ADM4: Record<string, string> = (bmkgData.mappings as any[]).reduce((acc, curr) => {
    acc[curr.id] = curr.adm4;
    return acc;
}, {} as Record<string, string>);

/**
 * Mapping of district names to BMKG ADM4 codes
 */
export const NAME_TO_ADM4: Record<string, string> = (bmkgData.mappings as any[]).reduce((acc, curr) => {
    // Clean up trailing spaces and hyphens from the BMKG data names
    const cleanName = curr.name.toUpperCase().replace(/\s*-*\s*$/, '').trim();
    acc[cleanName] = curr.adm4;
    return acc;
}, {} as Record<string, string>);

/**
 * Manual fallbacks for common cities or villages not fully covered by BMKG's district-only data
 */
export const MANUAL_FALLBACKS: Record<string, string> = {
    'BLITAR': '35.72.01.1001',     // Kepanjenkidul (Kota Blitar)
    'TANGGUNG': '35.72.01.1001',   // Kel. Tanggung, Kepanjenkidul
    'JAKARTA': '31.71.01.1001',    // Gambir
    'SURABAYA': '35.78.01.1001',   // Karangpilang
    'MALANG': '35.73.01.1001',     // Blimbing
    'BANDUNG': '32.73.01.1001',    // Sukasari
    'YOGYAKARTA': '34.71.01.1001', // Tegalrejo
    'SEMARANG': '33.74.01.1001',   // Mijen
};

/**
 * Get ADM4 code by district name (with fallback to city)
 */
export function getAdm4ByDistrict(district?: string | null, city?: string | null): string {
    const searchStrings = [district, city]
        .filter(Boolean)
        .map(s => {
            let str = s!.toUpperCase();
            // Robust prefix stripping
            str = str.replace(/^(?:KOTA|KABUPATEN|KAB\.)\s+/i, '');
            // Robust suffix stripping
            str = str.replace(/\s+(?:KOTA|KABUPATEN|KAB\.)$/i, '');
            str = str.replace(/^KECAMATAN\s+/i, '');
            str = str.replace(/\s+KECAMATAN$/i, '');
            return str.trim();
        });

    for (const d of searchStrings) {
        if (NAME_TO_ADM4[d]) {
            console.log(`Weather: Mapping search string "${d}" -> ADM4: ${NAME_TO_ADM4[d]}`);
            return NAME_TO_ADM4[d];
        }
        if (MANUAL_FALLBACKS[d]) {
            console.log(`Weather: Manual fallback mapping "${d}" -> ADM4: ${MANUAL_FALLBACKS[d]}`);
            return MANUAL_FALLBACKS[d];
        }
    }

    console.log(`Weather: No mapping found for district="${district}" or city="${city}", using default ADM4: ${DEFAULT_ADM4_CODE}`);
    return DEFAULT_ADM4_CODE;
}
