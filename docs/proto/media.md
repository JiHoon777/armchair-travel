# 1단계 시제품 — MEDIA 보고 (2026-10-13)

지구본 텍스처, 그랜저 포인트 360 사진, 바탕 소리, 그때·지금 사진, 크레딧을 만들었다. 모두 상업 이용이 되는 공공 영역·CC0·CC BY 2.0 자료다(NC 없음, Google/Esri/Mapbox 없음). 미리보기: `docs/proto/media_preview.jpg`.

다시 만들기: `uv run --quiet --with numpy --with pillow python -I tools/fetch_media.py all` (내려받은 원본은 `tools/cache/media/`에 남겨 두고 다시 쓴다. Commons 원본은 API sha1로 맞춰 본다. 전체 19초, 소리 결과는 비트까지 같게 나온다).

## 만든 파일

| 파일 | 내용 | 크기 |
|---|---|---|
| `site/data/globe/day_4k.jpg`, `day_2k.jpg` | NASA Blue Marble NG 2004년 10월(지형·해저 음영), 등장방형, 왼쪽 끝 경도 -180 | 1.12 / 0.33 MB |
| `site/data/globe/night_4k.jpg`, `night_2k.jpg` | NASA Black Marble 2016(3 km 컬러) | 0.45 / 0.13 MB |
| `site/data/globe/globe.json` | 파일 이름, 투영, 크레딧 | |
| `site/data/grand-canyon/pano/pano_4k.jpg`, `pano_2k.jpg` | 그랜저 포인트 360(2018-08-18 15:03, Ricoh Theta S), 수평을 바로잡음 | 1.48 / 0.41 MB |
| `site/data/grand-canyon/pano/pano.json` | `initial_yaw_deg` 300, `north_yaw_deg` 310.5, 위치, 크레딧 | |
| `site/data/grand-canyon/audio/ambient.mp3` | 180초 이음매 없는 반복, 128 kbps, -23.0 LUFS | 2.88 MB |
| `site/data/grand-canyon/audio/audio.json` | 길이·라우드니스·이음매 정보·크레딧 | |
| `site/data/grand-canyon/media/then.jpg`, `now.jpg` | 1600×1200, q82. 그때(1900~1930년 유리 원판), 지금(2011년 NPS) | 0.37 / 0.33 MB |
| `site/data/grand-canyon/media/media.json` | 한국어 설명, 연도, 크레딧 | |
| `site/data/credits/media.json` | 출처 9줄(what_ko, title, author, license, url, attribution + 고친 점) | |
| `tools/fetch_media.py` | 위 전부를 다시 만드는 스크립트 | |
| `tools/media_probe.py`, `media_probe_audio.py`, `media_probe_sun.py`, `media_pano_north.py` | 확인용 도구(EXIF·미리보기, 소리 스펙트로그램, 해 위치, 지형 스카이라인으로 북쪽 찾기) | |

## 출처와 라이선스

| 무엇 | 출처 | 라이선스 |
|---|---|---|
| 지구본 낮 | NASA Earth Observatory, Blue Marble: Next Generation 2004-10 (Reto Stöckli). 10월 파일이 열려서 12월 대체본은 쓰지 않았다 | 공공 영역(미국 정부 저작물). NASA 표기, 보증 암시 금지 |
| 지구본 밤 | NASA Earth Observatory, Black Marble 2016 (Joshua Stevens; Suomi NPP VIIRS, Miguel Román) | 공공 영역 |
| 360 사진 | Commons "Grandeur Point - Grand Canyon National Park - R0010513 (29201417827).jpg", Grand Canyon NPS (NPS/M. Quinn) | Flickr 원본은 지금도 CC BY 2.0(2026-10-13 확인). Commons에는 PD-USGov-NPS도 붙어 있다. CC BY 2.0 표기로 쓴다 |
| 소리: 바람 | NPS 로키산맥 국립공원 소리 도서관 "Wind Soundscape from Gem Lake"(J. Job, 2016) | 공공 영역("The recordings found here are in the public domain") |
| 소리: 먼 강물 | NPS 그랜드캐니언 "Grand Canyon Natural Sound: Bass Rapid" | 공공 영역(NPS 미디어 정책: NPS 표기·© 없음) |
| 소리: 큰까마귀 | NPS 로키산맥 소리 도서관 "Common Raven (call)", Moraine Park(J. Job, 2015) | 공공 영역 |
| 소리: 협곡굴뚝새 | Freesound #479615 "R30-39-Canyon Wren Sings.wav" (craigsmith) | CC0 1.0 |
| 그때 사진 | C. C. Pierce(1861–1946) 유리 원판 CHS-3269 "Panorama from Hotel Point west of Bright Angel Trail, looking northeast, 1900-1930", California Historical Society Collection, USC | 공공 영역(PD-US, 작가 1946년 사망) |
| 지금 사진 | Grand Canyon NPS, Michael Quinn 2011 "Panorama with El Tovar Hotel"(브라이트 엔젤 로지 마당) | CC BY 2.0(미국 안에서는 NPS 저작물로 공공 영역) |

## 정한 것과 근거

- **360 사진은 2025년 Commons 업로드본을 썼다.** 두 판 모두 5376×2688이다. 2020년 판(CC BY만)은 바닥에 촬영자 그림자와 삼각대 자국이 있다. 2025년 판은 NPS가 2021년에 다시 손본 파일로, 그림자와 바닥이 지워져 있다. 색도 덜 과하다.
- **360 사진의 수평을 2.03° 바로잡았다.** 사진의 지평선을 지형 데이터(TERRAIN의 core·outer DEM)로 그린 스카이라인과 맞춰 보니, 사진 속 먼 북쪽 가장자리가 yaw 240°에서는 +0.7°, 350°에서는 -2.2° 어긋났다. 카메라가 기운 모양이다. 구를 그만큼 돌린 뒤 다시 재니 어긋남이 136° 구간 전체에서 -0.15° 안팎으로 평평해졌다(남은 기울기 0.07°). 천천히 돌아도 수평선이 오르내리지 않는다.
- **북쪽은 yaw 310.5°다(±1.5°).** 서쪽 벽이 끝나는 자리(지형 290.9° ↔ 사진 241.7° → 310.7°), 북쪽 가장자리 윤곽(브라이트 엔젤 협곡 패임 포함, 311.6°), 촬영 시각 15:03:49 MST의 해 방위(245.5° ↔ 사진 193.9° → 308.4°)가 서로 맞는다. 사진의 yaw는 오른쪽으로 갈수록 시계 방향이다.
- **처음 보는 방향은 yaw 300°(방위 약 350°, 북북서)다.** 안쪽 협곡의 검은 비슈누 편암 절벽, 톤토 대지, 북쪽 가장자리가 한 화면에 들어온다(`media_preview.jpg` 셋째 줄 왼쪽).
- **위치는 USGS GNIS 5229 그랜저 포인트(36.06464, -112.12202)다.** CONTENT의 `camera.stand`와 같은 점이다. DEM으로 보면 가장자리가 이 점에서 북쪽 약 40 m라, 카메라는 이 점에서 50 m 안쪽 가장자리 바위에 있었다.
- **소리는 그랜드캐니언 녹음만으로는 모자랐다.** NPS 공공 영역 그랜드캐니언 자연음은 15~17초짜리 두 개(배스 급류, 행스 크리크)뿐이었다. 그래서 바탕 바람과 큰까마귀는 로키산맥 국립공원 소리 도서관(공공 영역)에서, 협곡굴뚝새 노래는 Freesound CC0에서 가져왔다. 강물만 그랜드캐니언 녹음이다.
- **바탕 소리 구성(180초):** 바람(140 Hz 아래·3 kHz 위를 덜어 부드럽게) + 먼 강물(480 Hz 아래만, 바람보다 11 dB 낮게) + 협곡굴뚝새 22·88·147초 + 큰까마귀 51·119초(작은 메아리). 이음매 앞뒤 12초는 바람만 둔다. 끝 6초를 앞에 등전력으로 겹쳐 반복 이음매가 들리지 않는다. 협곡굴뚝새 파일 앞 1.3초의 녹음 안내 음성은 잘라 냈다.
- **그때·지금은 '같은 방향, 가까운 자리' 짝이다.** 그때 사진은 브라이트 엔젤 트레일 서쪽 호텔 포인트에서 북동쪽(가운데 브라이트 엔젤 협곡)을 찍었다. 지금 사진은 수백 m 떨어진 브라이트 엔젤 로지 마당에서 찍은 2011년 NPS 파노라마에서 브라이트 엔젤 협곡을 가운데 두고 4:3으로 잘라 냈다. 북쪽 가장자리가 두 사진 모두 위에서 약 19%에 오게 맞췄다. 자동 정합을 해 봤지만 찍은 자리와 빛이 달라 겹쳐 맞출 수는 없었다(`pair_note_ko`에 적음). 밀어 보기보다는 나란히 보기가 맞다.
- **문구는 사진 정보로 확인되는 것만 썼다.** 예: 「1900~1930년 무렵, 브라이트 엔젤 트레일 서쪽 가장자리에서 북동쪽을 찍은 유리 원판 사진입니다. 가운데로 브라이트 엔젤 협곡이 지나갑니다.」 연도 범위는 소장처 목록(1900/1930)을 따랐고, `year`는 1900, `year_label_ko`·`year_range`를 함께 넣었다.

## 확인한 것

- 지구본: 4096×2048·2048×1024, 경도 -180이 왼쪽 끝(눈으로 확인). JPEG q85, EXIF·ICC 없음.
- 360: 수평 보정 전후 스카이라인 비교(위 수치), 처음 보는 방향을 원근 투영으로 그려 확인, EXIF(GPS 포함) 제거.
- 소리: ffmpeg로 풀면 정확히 7,938,000샘플(180.000초). 통합 -23.0 LUFS, LRA 5.6 LU, 트루 피크 -4.2 dBFS. 이음매(마지막→처음) 샘플 차 0.0018로 평소 샘플 간 차 0.0056보다 작다. LAME 갭리스 헤더 확인(앞 1105, 뒤 479 샘플, `audio.json`의 `mp3_gapless`). 스펙트로그램으로 새소리 자리·안내 음성 제거 확인.
- 라이선스: Commons API(extmetadata·위키텍스트), Flickr 페이지(CC BY 2.0), NPS 소리 페이지 문구, Freesound 페이지(CC0), NASA 이미지 이용 지침을 직접 열어 확인.
- 모든 JSON 파싱 확인. 런타임에 읽는 것은 같은 폴더의 상대 경로 파일뿐이다(크레딧의 URL은 링크용).

## 남은 것과 주의

- 바람·큰까마귀는 그랜드캐니언이 아니라 로키산맥 국립공원 녹음이다. 크레딧 `modified_ko`에 적었다. 그랜드캐니언 가장자리를 직접 녹음한 공공 영역 파일을 찾으면 바꾸는 게 좋다.
- 배스 급류 페이지는 크레딧 칸이 비어 있다. NPS 미디어 정책상 NPS 미디어로 보고 공공 영역으로 적었다. 걱정되면 이 층만 빼도 된다(강물 층 볼륨 -11 dB).
- 협곡굴뚝새는 Freesound 원본(WAV)이 로그인 뒤에만 받아져 128 kbps 미리듣기 MP3를 썼다. CC0라 라이선스 문제는 없고, 새소리 한 토막이라 음질 차이는 작다.
- 360 사진에 관광객 여러 명이 작게 나온다(`people_visible: true`). NPS가 공개한 사진이고 얼굴은 알아보기 어렵다.
- Safari 등 갭리스 헤더를 무시하는 디코더는 앞뒤에 약 36 ms 무음이 붙을 수 있다. `audio.json`의 `loop_hint`대로 `loopStart`/`loopEnd`를 잡으면 된다.
- NASA 자료는 「NASA가 보증한다」로 읽히지 않게 써야 한다(크레딧 `notes`).
