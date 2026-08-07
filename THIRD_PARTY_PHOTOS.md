# Third-party weather photography

Chillax bundles eight weather backgrounds as optimized WebP files. They are served from the same origin, selected by weather condition and the location's local time, and cached on demand by the service worker. The source photographs remain credited in the Weather interface.

All photographs below were downloaded from Unsplash on August 6, 2026 and are used under the [Unsplash License](https://unsplash.com/license). Chillax crops and compresses each source to a 1600 x 900 WebP image; no other material changes are made.

| Local asset | Photographer | Unsplash source |
| --- | --- | --- |
| `clear-day.webp` | [Francesco Ungaro](https://unsplash.com/@francesco_ungaro) | [Sunlight over an open green field](https://unsplash.com/photos/7FcZfpFZ7sM) |
| `clouds.webp` | [Kenrick Mills](https://unsplash.com/@kenrickmills) | [Dramatic clouds at noon](https://unsplash.com/photos/eCBGt3ashQU) |
| `rain.webp` | [masahiro miyagi](https://unsplash.com/@masamasa3) | [A rain-soaked city street at night](https://unsplash.com/photos/DxrV_lky_Sc) |
| `snow.webp` | [Shutter Speed](https://unsplash.com/@shutter_speed_) | [Snow-covered mountains under a blue sky](https://unsplash.com/photos/WbCYPK2JmWA) |
| `storm.webp` | [Drew Stock](https://unsplash.com/@drewbian) | [Lightning breaking through storm clouds](https://unsplash.com/photos/r-ulEMCm4fQ) |
| `fog.webp` | [Timon Reinhard](https://unsplash.com/@timonreinhard) | [A quiet woodland softened by fog](https://unsplash.com/photos/82Vi8BBRXl4) |
| `clear-night.webp` | [Casey Horner](https://unsplash.com/@mischievous_penguins) | [A star-filled night sky](https://unsplash.com/photos/WGdZyGkfcBQ) |
| `golden-hour.webp` | [Harsha Kulkarni](https://unsplash.com/@clickoffbeat_144) | [Golden-hour light over a grassy field](https://unsplash.com/photos/9jEx5fUCMUY) |

The generated assets live in `public/weather-photos/`. Run `npm run generate:weather-photos` to reproduce them from the fixed source IDs.
