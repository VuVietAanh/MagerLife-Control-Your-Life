export type WeatherHourlyPoint = {
  time: string;
  temperature: number;
  rainChance: number;
  humidity: number;
  code: number;
};

export type WeatherData = {
  temperature: number;
  humidity: number;
  rainChance: number;
  windSpeed: number;
  code: number;
  summary: string;
  hourly: WeatherHourlyPoint[];
};

export type WeatherPlace = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  isCurrent?: boolean;
  weather?: WeatherData;
  status?: "idle" | "loading" | "error";
  error?: string;
};

type FetchLike = typeof fetch;

type GeocodingResult = {
  id?: number;
  name: string;
  admin1?: string;
  country?: string;
  latitude: number;
  longitude: number;
  population?: number;
};

const knownVietnamPlaces: Record<string, WeatherPlace> = {
  "ninh binh": {
    id: "manual-ninh-binh",
    name: "Ninh Bình, Ninh Bình, Việt Nam",
    latitude: 20.2506,
    longitude: 105.9745,
  },
  "thanh pho ninh binh": {
    id: "manual-ninh-binh",
    name: "Ninh Bình, Ninh Bình, Việt Nam",
    latitude: 20.2506,
    longitude: 105.9745,
  },
  "da lat": {
    id: "manual-da-lat",
    name: "Đà Lạt, Lâm Đồng, Việt Nam",
    latitude: 11.9404,
    longitude: 108.4583,
  },
  "dalat": {
    id: "manual-da-lat",
    name: "Đà Lạt, Lâm Đồng, Việt Nam",
    latitude: 11.9404,
    longitude: 108.4583,
  },
  "thanh pho da lat": {
    id: "manual-da-lat",
    name: "Đà Lạt, Lâm Đồng, Việt Nam",
    latitude: 11.9404,
    longitude: 108.4583,
  },
};

const vietnamProvinceAliases: Record<string, string[]> = {
  "ha noi": ["ha noi", "hanoi"],
  "ho chi minh": ["ho chi minh", "tp ho chi minh", "sai gon", "saigon"],
  "da nang": ["da nang"],
  "hai phong": ["hai phong"],
  "can tho": ["can tho"],
  "ninh binh": ["ninh binh"],
  "da lat": ["da lat", "dalat"],
  "lam dong": ["lam dong", "da lat", "dalat"],
  "quang tri": ["quang tri"],
  "quang ninh": ["quang ninh", "ha long"],
  "thanh hoa": ["thanh hoa"],
  "nghe an": ["nghe an", "vinh"],
  "hue": ["hue", "thua thien hue"],
  "khanh hoa": ["khanh hoa", "nha trang"],
  "binh dinh": ["binh dinh", "quy nhon"],
  "dak lak": ["dak lak", "buon ma thuot"],
  "gia lai": ["gia lai", "pleiku"],
  "dong nai": ["dong nai", "bien hoa"],
  "binh duong": ["binh duong", "thu dau mot"],
  "ba ria vung tau": ["ba ria vung tau", "vung tau"],
  "an giang": ["an giang", "long xuyen"],
  "kien giang": ["kien giang", "rach gia", "phu quoc"],
  "lao cai": ["lao cai", "sa pa", "sapa"],
};

function canonicalWantedPlace(normalizedQuery: string) {
  const withoutPrefix = normalizedQuery
    .replace(/\b(thanh pho|tp|tinh|quan|huyen|thi xa|thi tran)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [canonical, aliases] of Object.entries(vietnamProvinceAliases)) {
    if (aliases.some((alias) => withoutPrefix === alias || withoutPrefix.includes(alias))) return canonical;
  }
  return withoutPrefix;
}

function resultMatchesWantedPlace(result: GeocodingResult, wantedCanonical: string) {
  const normalizedName = normalizePlaceName([result.name, result.admin1, result.country].filter(Boolean).join(" "));
  const aliases = vietnamProvinceAliases[wantedCanonical] || [wantedCanonical];
  return aliases.some((alias) => normalizedName.includes(alias));
}

export function weatherSummary(code: number) {
  if ([0, 1].includes(code)) return "Trời quang";
  if ([2, 3].includes(code)) return "Có mây";
  if ([45, 48].includes(code)) return "Sương mù";
  if ([51, 53, 55, 56, 57].includes(code)) return "Mưa phùn";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Có mưa";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Có tuyết";
  if ([95, 96, 99].includes(code)) return "Giông/sấm sét";
  return "Đang cập nhật";
}

export function normalizePlaceName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchWeatherForecast(place: WeatherPlace, fetcher: FetchLike = fetch) {
  const params = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code,wind_speed_10m",
    hourly: "temperature_2m,relative_humidity_2m,precipitation_probability,weather_code",
    forecast_days: "2",
    timezone: "auto",
  });
  const response = await fetcher(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
  if (!response.ok) throw new Error("Không lấy được dữ liệu thời tiết.");
  const data = await response.json();
  const current = data.current || {};
  const times: string[] = data.hourly?.time || [];
  const temps: number[] = data.hourly?.temperature_2m || [];
  const humidities: number[] = data.hourly?.relative_humidity_2m || [];
  const rains: number[] = data.hourly?.precipitation_probability || [];
  const codes: number[] = data.hourly?.weather_code || [];
  const currentTime = new Date(current.time || Date.now()).getTime();
  const foundIndex = times.findIndex((item) => new Date(item).getTime() >= currentTime);
  const startIndex = foundIndex >= 0 ? foundIndex : Math.max(0, times.length - 3);
  const hourly = Array.from({ length: 3 }, (_, index) => {
    const dataIndex = Math.min(startIndex + index, Math.max(0, times.length - 1));
    const time = times[dataIndex] || current.time || new Date().toISOString();
    return {
      time: new Date(time).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      temperature: Math.round(temps[dataIndex] ?? current.temperature_2m ?? 0),
      rainChance: Math.round(rains[dataIndex] ?? current.precipitation_probability ?? 0),
      humidity: Math.round(humidities[dataIndex] ?? current.relative_humidity_2m ?? 0),
      code: codes[dataIndex] ?? current.weather_code ?? 0,
    };
  });
  const code = Number(current.weather_code || 0);
  return {
    temperature: Math.round(Number(current.temperature_2m || 0)),
    humidity: Math.round(Number(current.relative_humidity_2m || 0)),
    rainChance: Math.round(Number(current.precipitation_probability || 0)),
    windSpeed: Math.round(Number(current.wind_speed_10m || 0)),
    code,
    summary: weatherSummary(code),
    hourly,
  };
}

export async function resolveManualWeatherPlace(query: string, fetcher: FetchLike = fetch) {
  const trimmed = query.trim();
  const wantedName = normalizePlaceName(trimmed);
  const wantedCanonical = canonicalWantedPlace(wantedName);
  const knownPlace = knownVietnamPlaces[wantedName];
  if (knownPlace) return knownPlace;

  async function searchPlace(name: string) {
    const params = new URLSearchParams({ name, count: "20", language: "vi", format: "json", countryCode: "VN" });
    const response = await fetcher(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
    if (!response.ok) throw new Error("Không tìm được địa điểm.");
    const data = await response.json();
    const results = (data.results || []) as GeocodingResult[];
    const wantedTokens = new Set(wantedName.split(" ").filter((token) => token.length > 1));
    return results
      .filter((result) => !wantedCanonical || resultMatchesWantedPlace(result, wantedCanonical))
      .map((result) => {
        const resultName = normalizePlaceName(result.name);
        const normalizedName = normalizePlaceName([result.name, result.admin1].filter(Boolean).join(" "));
        const resultTokens = new Set(normalizedName.split(" ").filter((token) => token.length > 1));
        const tokenOverlap = [...wantedTokens].filter((token) => resultTokens.has(token)).length;
        const exactName = resultName === wantedName ? 5 : 0;
        const startsWith = normalizedName.startsWith(wantedName) ? 3 : 0;
        const contains = normalizedName.includes(wantedName) ? 2 : 0;
        const wantedContains = wantedName.includes(resultName) ? 1 : 0;
        const populationScore = result.population ? Math.min(1, Math.log10(result.population + 1) / 8) : 0;
        return { result, score: exactName + startsWith + contains + wantedContains + tokenOverlap + populationScore };
      })
      .sort((a, b) => b.score - a.score);
  }

  let ranked = await searchPlace(trimmed);
  if (!ranked[0] || ranked[0].score < 2) {
    ranked = await searchPlace(wantedCanonical || wantedName);
  }
  const result = ranked[0]?.result;
  if (!result) throw new Error("Không tìm được địa điểm khớp chính xác. Hãy nhập rõ phường/quận/tỉnh hoặc chọn một địa điểm khác.");
  return {
    id: `manual-${result.id || `${result.latitude}-${result.longitude}`}`,
    name: [result.name, result.admin1, result.country].filter(Boolean).join(", "),
    latitude: result.latitude,
    longitude: result.longitude,
  };
}
