/**
 * [south, west, north, east] — obszar zapytań OSM dla grupy GOT.
 * Krawędzie dobrane do siatki 0,1° (x.x3 / x.x0), żeby kafelki i cache były współdzielone.
 */
export const REGION_BBOX: Record<string, [number, number, number, number]> = {
  "T.01": [49.13, 19.7, 49.32, 20.25],
  "T.02": [49.13, 19.6, 49.32, 20.05],
  "T.03": [49.23, 19.7, 49.5, 20.3],
  // Tatry słowackie (nazwy z OSM dopasowujemy też po name:pl / alt_name)
  "SK-tatry-sl-zach": [49.03, 19.6, 49.28, 20.0],
  "SK-tatry-sl-wysokie": [49.03, 19.7, 49.27, 20.3],
  "SK-tatry-sl-bielskie": [49.13, 20.1, 49.32, 20.4],
};

/** Kolejność budowania „kompletu Tatr” (najpierw okolice Zakopanego). */
export const TATRY_ORDER = [
  "T.02",
  "T.01",
  "T.03",
  "SK-tatry-sl-zach",
  "SK-tatry-sl-wysokie",
  "SK-tatry-sl-bielskie",
];
