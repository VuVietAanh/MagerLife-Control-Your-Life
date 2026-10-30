import React from "react";
import { Clock, CloudRain, Droplets, MapPin, Navigation, Settings, Thermometer, Umbrella, X } from "lucide-react";
import { useState } from "react";
import { useWeatherPlaces } from "../../hooks/useWeatherPlaces";
import { Glass, Mono } from "../../ui/primitives";

export function WeatherForecastCard() {
  const weather = useWeatherPlaces();
  const manualPlaces = weather.places.filter((place) => !place.isCurrent);
  const activePlace = weather.places.find((place) => place.id === weather.activePlaceId) || weather.places[0];
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <Glass className="p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <Mono className="text-sky-700">Weather</Mono>
          <h2 className="mt-1 text-base font-bold text-slate-900">Dự báo thời tiết</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">Theo vị trí hiện tại và tối đa 3 nơi bạn muốn theo dõi.</p>
        </div>
        <button
          onClick={() => setSettingsOpen((prev) => !prev)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-900"
          title="Cài đặt thời tiết"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>

      {settingsOpen && (
        <div className="mb-4 rounded-xl border border-sky-100 bg-sky-50/80 p-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-sky-600" />
            <p className="text-xs font-semibold leading-relaxed text-sky-800">{weather.message}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button onClick={weather.requestCurrentLocation} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white">
              <Navigation className="h-3.5 w-3.5" />
              Reload vị trí
            </button>
            {activePlace && (
              <button onClick={() => void weather.reloadPlace(activePlace)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700">
                <CloudRain className="h-3.5 w-3.5" />
                Reload thời tiết
              </button>
            )}
          </div>
          {weather.places.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {weather.places.map((place) => (
                <div key={place.id} className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      weather.setActivePlaceId(place.id);
                      setSettingsOpen(false);
                    }}
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-left text-xs font-bold ${activePlace?.id === place.id ? "border-sky-300 bg-white text-sky-700" : "border-slate-200 bg-white/70 text-slate-600"}`}
                  >
                    <span className="block truncate">{place.name}</span>
                  </button>
                  {!place.isCurrent && (
                    <button onClick={() => weather.removePlace(place.id)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-500">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <input
              value={weather.query}
              onChange={(event) => weather.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void weather.addManualPlace();
              }}
              placeholder="Thêm nơi khác..."
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sky-300"
            />
            <button onClick={() => void weather.addManualPlace()} className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40" disabled={manualPlaces.length >= 3}>
              Thêm
            </button>
          </div>
        </div>
      )}

      {!activePlace && (
        <div className="rounded-xl border border-slate-200 bg-white/70 p-3 text-xs font-semibold leading-relaxed text-slate-500">
          Chưa có dữ liệu thời tiết. Hãy cấp quyền vị trí hoặc thêm địa điểm thủ công trong nút cài đặt.
        </div>
      )}

      {activePlace && (
        <div className="rounded-xl border border-white/80 bg-white/75 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
              <MapPin className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-black leading-snug text-slate-900">{activePlace.name}</p>
                {activePlace.isCurrent && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">Hiện tại</span>}
              </div>
              <p className="mt-1 text-xs font-semibold text-slate-500">
                {activePlace.status === "loading" ? "Đang cập nhật..." : activePlace.status === "error" ? activePlace.error : activePlace.weather?.summary || "Chưa có dữ liệu"}
              </p>
            </div>
          </div>

          {activePlace.weather && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  [Thermometer, "Nhiệt độ", `${activePlace.weather.temperature}°C`],
                  [Droplets, "Độ ẩm", `${activePlace.weather.humidity}%`],
                  [Umbrella, "Khả năng mưa", `${activePlace.weather.rainChance}%`],
                  [CloudRain, "Gió", `${activePlace.weather.windSpeed} km/h`],
                ].map(([Icon, label, value]) => {
                  const WeatherIcon = Icon as React.ElementType;
                  return (
                    <div key={label as string} className="rounded-lg bg-slate-50 p-2">
                      <p className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400"><WeatherIcon className="h-3 w-3" />{label as string}</p>
                      <p className="mt-0.5 text-lg font-black text-slate-900">{value as string}</p>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 rounded-xl border border-slate-100 bg-white p-2">
                {[
                  [Clock, activePlace.weather.hourly.map((hour) => hour.time), "text-slate-600"],
                  [Thermometer, activePlace.weather.hourly.map((hour) => `${hour.temperature}°`), "text-rose-600"],
                  [Umbrella, activePlace.weather.hourly.map((hour) => `${hour.rainChance}%`), "text-sky-700"],
                  [Droplets, activePlace.weather.hourly.map((hour) => `${hour.humidity}%`), "text-cyan-700"],
                ].map(([Icon, values, tone], rowIndex) => {
                  const RowIcon = Icon as React.ElementType;
                  const rowValues = values as string[];
                  return (
                    <div key={rowIndex} className="grid grid-cols-[24px_repeat(3,minmax(0,1fr))] items-center gap-2 border-b border-slate-100 py-2 last:border-b-0">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-lg bg-slate-50 ${tone as string}`}>
                        <RowIcon className="h-3.5 w-3.5" />
                      </div>
                      {rowValues.map((value, index) => (
                        <div key={`${rowIndex}-${index}`} className="rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[11px] font-black text-slate-800">
                          {value}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </Glass>
  );
}
