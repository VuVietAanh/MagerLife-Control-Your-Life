import { useEffect, useState } from "react";
import { fetchWeatherForecast, resolveManualWeatherPlace, type WeatherPlace } from "../services/weatherService";

export function useWeatherPlaces() {
  const [places, setPlaces] = useState<WeatherPlace[]>([]);
  const [activePlaceId, setActivePlaceId] = useState("");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("Cho phép vị trí để MagerLife hiển thị thời tiết nơi bạn đang ở.");

  async function loadForecast(place: WeatherPlace) {
    setPlaces((prev) => prev.map((item) => item.id === place.id ? { ...item, status: "loading", error: "" } : item));
    try {
      const weather = await fetchWeatherForecast(place);
      setPlaces((prev) => prev.map((item) => item.id === place.id ? {
        ...item,
        status: "idle",
        weather,
      } : item));
    } catch (error) {
      setPlaces((prev) => prev.map((item) => item.id === place.id ? { ...item, status: "error", error: error instanceof Error ? error.message : "Lỗi thời tiết" } : item));
    }
  }

  function addPlace(place: WeatherPlace) {
    setPlaces((prev) => {
      const withoutDuplicate = prev.filter((item) => item.id !== place.id);
      const currentPlaces = withoutDuplicate.filter((item) => item.isCurrent);
      const manualPlaces = withoutDuplicate.filter((item) => !item.isCurrent);
      const nextManualPlaces = place.isCurrent ? manualPlaces : [place, ...manualPlaces].slice(0, 3);
      return [...(place.isCurrent ? [place] : currentPlaces), ...nextManualPlaces];
    });
    setActivePlaceId(place.id);
    void loadForecast(place);
  }

  function requestCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Trình duyệt hiện không hỗ trợ lấy vị trí.");
      return;
    }
    setMessage("Đang chờ quyền truy cập vị trí từ trình duyệt...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const place: WeatherPlace = {
          id: "current-location",
          name: "Vị trí hiện tại",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          isCurrent: true,
        };
        setMessage("Đã cập nhật thời tiết theo vị trí hiện tại.");
        addPlace(place);
      },
      () => setMessage("Bạn chưa cấp quyền vị trí. Có thể thêm địa điểm thủ công bên dưới."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 15 * 60 * 1000 }
    );
  }

  async function addManualPlace() {
    const trimmed = query.trim();
    if (!trimmed) return;
    const manualCount = places.filter((item) => !item.isCurrent).length;
    if (manualCount >= 3) {
      setMessage("Chỉ hỗ trợ tối đa 3 địa điểm tự thêm. Hãy xóa một nơi trước khi thêm mới.");
      return;
    }
    setMessage("Đang tìm địa điểm...");
    try {
      const place = await resolveManualWeatherPlace(trimmed);
      setQuery("");
      setMessage(`Đã thêm ${place.name}.`);
      addPlace(place);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thêm được địa điểm.");
    }
  }

  function removePlace(id: string) {
    setPlaces((prev) => {
      const next = prev.filter((item) => item.id !== id);
      if (activePlaceId === id) setActivePlaceId(next[0]?.id || "");
      return next;
    });
  }

  useEffect(() => {
    requestCurrentLocation();
    // Ask once on dashboard mount; browser owns the permission prompt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { places, activePlaceId, setActivePlaceId, query, setQuery, message, requestCurrentLocation, addManualPlace, removePlace, reloadPlace: loadForecast };
}
