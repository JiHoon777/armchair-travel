# 04. three.js로 보여 줄 수 있는 뷰 — 방식·데이터·비용·라이선스

조사일 2026-10-13. 가격·약관·라이선스는 공식 페이지와 원문 PDF를 직접 열어 확인했다. 타일 크기·CORS·Wikimedia Commons 수량은 이날 curl과 공개 API로 직접 쟀다 [M].
검색 결과 요약으로만 본 것은 (검색 요약), 확인 못 한 것은 (미확인)으로 적었다. 조사 도중 검색 한도가 차서 몇 항목(360 전용 깊이 모델, 공개 스플랫 캡처의 라이선스, 한국 지역 커버리지)은 더 파지 못했다. 금액은 따로 적지 않으면 2026-10-13 확인 기준 USD다.

## 요약

1. **기본 공중 뷰는 'DEM + 위성영상' 3D 지형이다.** 3DTilesRendererJS 0.5.2(2026-08)부터 Terrarium DEM 타일과 XYZ 영상을 직접 읽어서 three.js 라이브러리 하나로 된다 [10]. Copernicus GLO-30·Mapterhorn은 상용이 되고 [14][17], 직접 호스팅하면 10만 방문에도 월 $10 아래다.
2. **Google Photorealistic 3D Tiles는 화질이 가장 좋고 방문당 값도 싸지만 약관이 무겁다.** 루트 요청 월 1,000건 무료, 이후 1,000건당 $6.00이다 [1]. 방문당 1건이면 10만 방문에 월 약 $594다. 캐시 금지, 비구글 지도와 한 화면 금지, 조명 고정이 따라온다 [3][4][8].
3. **자연 경관은 대부분 사진측량 3D가 아니다.** 상세 메시는 2,000~2,500개 도시와 일부 명소에 몰려 있고, 나머지는 "고도형 메시"다 [6][9]. 공중에서는 좋지만 땅에 서면 나무가 덩어리가 된다 [8].
4. **땅에 선 느낌은 360 사진이 가장 싸고 가장 진짜 같다.** Commons '360° panoramas' 분류에 1,419,503개 파일이 있다 [28]. CC BY·BY-SA라 표기하면 상용이 되지만, 원본이 크고(표본 중앙값 36 MB) 핫링크를 권하지 않아 다시 인코딩해서 직접 호스팅한다 [27][M].
5. **유튜브 360·드론 영상은 three.js 텍스처로 못 쓴다.** 정책이 플레이어 변경과 화면·소리 분리를 금지한다 [37]. 영상은 라이선스 받은 파일을 직접 스트리밍해야 하고, 4K 360은 분당 약 150 MB(20 Mbps 가정)다.
6. **스플랫은 렌더러는 준비됐는데 쓸 만한 자연 경관 캡처가 없다.** Spark 2.x(MIT)는 LoD 스트리밍으로 폰에서 약 50만 개를 그린다 [42][43]. 재사용 가능한 공개 캡처는 못 찾았고, 미국 국립공원은 드론이 금지다 [40].
7. **편안함은 하늘·시간·소리에서 싸게 나온다.** three.js Sky·suncalc·MET Norway 날씨(CC BY 4.0, 상용 가능)·Pixabay 소리로 비용이 0에 가깝다 [55][56][59][41]. 반면 Open-Meteo 무료판, BBC 효과음, xeno-canto 대부분, EOX 2018~2025, Depth Anything 큰 모델은 **비상업 전용**이다.
8. **비용을 가르는 것은 '타일당 과금'이다.** three.js에서 Mapbox·MapTiler·Google 2D 타일을 쓰면 10만 방문에 월 약 $4,500~6,100이다(방문당 200~300건 가정). 같은 조건에서 Esri 세션 과금은 약 $396, 직접 호스팅은 약 $7이다.

---

## 뷰 한눈에 보기

전송량·모바일·공수 칸은 아래 출처 수치와 측정 [M]에 기댄 추정이다. 공수는 three.js에 익숙한 1인 기준 판단이다.

| 뷰 | 공중 실감 | 지상 실감 | 전송량 | 모바일 | 1인 공수 | 차분한 감상 | 판정 |
|---|---|---|---|---|---|---|---|
| 실사 3D 타일 (Google) | 최상(명소) / 좋음(나머지) | 중간. 나무·바위가 녹은 덩어리 | 공개 실측 없음(미확인) | iOS 메모리 크래시 보고 | 2~4일 + 튜닝 1주 | 좋음. 조명 고정 | 업그레이드 '실사 모드' |
| DEM + 위성영상 | 좋음(지면 1~10 km 위) | 나쁨 | 처음 6~7 MB/장소, 이후 약 3 MB/분 | 가벼움 | 1~2주 | 매우 좋음(자동 선회) | **MVP 공중 뷰** |
| 360 사진 | 없음(드론 파노라마 제외) | 최상(실사) | 장당 2~3 MB(4K 재인코딩) | 가벼움 | 2일~1주 | 매우 좋음 | **MVP 지상 뷰** |
| 2.5D 시차 | — | 좋음. 크게 움직이면 경계가 찢어짐 | 사진 + 깊이 0.5~1 MB | 가벼움~중간 | 1~2주 | 좋음(숨 쉬는 움직임) | MVP 후반 |
| 360·드론 영상 | 최상(드론) | 최상(물·구름이 움직임) | 약 150 MB/분(4K 360) | 디코딩 부담 | 기술 3~5일, 수급이 병목 | 좋음 | 일부 장소 업그레이드 |
| 가우시안 스플랫 | 캡처 범위 안 좋음 | 캡처 범위 안 최상 | 100만 개 ≈ SPZ 25 MB(계산) | 폰 약 50만 개 예산 | 렌더 1주 + 장소당 수일~수주 | 좋음 | 영웅 장소 실험 |
| 양식화 지형 | 일관됨(사실 아님) | 일관됨 | 약 1~2 MB/분 | 가벼움 | 1~3주(룩 개발) | 매우 좋음 | 대체 뷰·브랜드 톤 |
| 지구본 홈 | 개요 전용 | — | 텍스처 2~10 MB 한 번 | 가벼움 | 3~5일 | 좋음 | **MVP 홈** |
| 하늘·시간·날씨 | DEM 장면을 크게 살림 | 360에는 제한적 | 수 KB | Sky 가벼움, 볼륨 구름 무거움 | 2~3일 → 1~2주 | 핵심 | **MVP 간단판** |
| 주변 소리 | 몰입 상승 | 몰입 상승 | 약 0.7 MB/분(96 kbps) | 탭 뒤 재생 | 2~4일 + 수급 | 핵심 | **MVP 포함** |

---

## 1. 실사 3D — Google Photorealistic 3D Tiles

### 무엇인가
- Google Earth와 같은 3D 원천을 OGC 3D Tiles로 주는 API다 [5]. 3D는 49개국 이상, 2D는 250개국·지역 이상이다 [5].
- 상세 메시는 2,000~2,500개 도시에 있다 [6][9]. 나머지는 "The uncovered areas contain 3D-textured elevation-like mesh data."(상세 데이터가 없는 곳은 텍스처를 입힌 고도형 메시다) [6].
- Map Tiles API는 Google 자체 제품보다 낮은 해상도로 줄 수 있다 [6]. 범위는 Google Earth의 '3D Coverage' 레이어로 확인한다 [6].

### 자연 경관에서는
- 명소는 좋다. 사진가용 앱 TPE는 델리케이트 아치 모델이 정확한 촬영 위치를 찾기에 충분하고 숲과 나무 한 그루까지 들어 있다고 했다(2026-09-09) [7].
- Google Earth 화면으로 하프돔을 재구성한 연구는 LiDAR 대비 면적 98.1%가 5 m 안이었다(2020) [13](검색 요약). 유명 암벽은 진짜 3D다.
- 땅에 서면 약점이 보인다. 조명이 촬영 당시로 "구워져" 다시 비출 수 없고, 걷다 보면 나무 위에 서게 된다 [8]. 해안에 가짜 물 같은 메시 결함도 있다 [8].
- 폭포·빙하·협곡의 지역별 품질 비교 자료는 못 찾았다(미확인). 후보 장소마다 Google Earth로 먼저 본다.

### 값과 한도
- SKU는 Enterprise. 월 1,000건 무료, 1,000건당 $6.00(10만 건까지) → $5.10 → $4.20 → $3.30 → $2.40(500만 건 초과)이다 [1].
- 루트 타일셋 요청 하나가 세션 토큰을 주고, 그 토큰으로 3시간 동안 렌더러 타일을 받는다 [2]. 렌더러 타일은 일일 한도에 안 들어간다 [2]. 3시간 안에는 다시 과금하지 않는다 [9].
- 기본 한도는 루트 요청 하루 10,000건, 렌더러 분당 12,000건이다(프로젝트 전체 합) [2].
- 데이터 전송량은 공개 실측치를 못 찾았다(미확인). 지오메트리와 텍스처를 함께 받으니 DEM + 영상보다 무거울 것으로 본다(추정).
- EEA 청구 주소 계정은 2025-07-08부터 일부 콘텐츠가 빠진다 [31]. 한국 청구 주소는 해당 없다.

### 약관
- 표기: Google 로고(높이 16~19dp), 공간이 좁으면 "Google Maps" 글자. 타일의 copyright 필드를 모아 한 줄로 보여 준다 [3].
- 캐시: "you must not pre-fetch, index, store, or cache any Content"(콘텐츠를 미리 받거나 저장·캐시하면 안 된다) [3]. 오프라인도 안 된다 [3].
- 혼합: 내 3D 물체는 얹어도 되지만 타일에서 뽑아낸 물체는 안 된다 [3]. 이용약관 3.2.3(e)는 "Customer will not use the Google Maps Core Services with or near a non-Google Map"(비구글 지도와 함께 또는 가까이 쓰지 않는다)이다(2026-08-26 수정판) [4].
- 같은 조항 (d)는 Google 제품을 다시 만드는 것을 막고 "substantial, independent value"를 요구한다 [4]. 큐레이션과 해설이 그 가치가 된다.
- 홍보 영상은 30초 이하만 된다 [3].

### three.js로 붙이기
- 3DTilesRendererJS(Apache-2.0, NASA-AMMOS)의 GoogleCloudAuthPlugin이 세션 토큰, 타일별 저작권 수집, 로고 표기를 처리한다 [10].
- 모바일 위험: CesiumJS에서 iPhone 텍스처 메모리가 1,000 MB를 넘어 죽는 보고가 있다 [11](검색 요약). 3DTilesRendererJS도 긴 세션에서 JS 힙이 계속 는다는 보고가 있다 [12](검색 요약). LRU 캐시가 가득 차면 새 타일을 안 받는다 [10].

**우리 사이트로 옮기면:** 화질 1등이고 10만 방문에 월 약 $594라 값은 문제가 아니다. 문제는 약관이다. 비구글 지구본·지형과 한 화면에 못 두니 별도 '실사 모드' 화면으로 떼고, 시간대 조명 연출은 이 화면에서 포기한다.

---

## 2. DEM + 위성영상으로 만드는 3D 지형

### DEM (고도)

| 소스 | 해상도 | 라이선스·상용 | 비용·접근 | 비고 |
|---|---|---|---|---|
| Copernicus GLO-30 | 30 m 전 지구 | 무료. 복제·배포·공중 전달·변형·결합 허용 → 상용 가능 [14] | AWS에서 계정 없이 COG로 받음 [15] | 출처 문구 + 면책 문장 필수 [14]. 일부 국가 타일 미공개 [15] |
| AWS Terrain Tiles (Mapzen) | SRTM 30 m 바탕, 미국 3DEP 등 | 원천별. 미국 자료는 공공 영역, 노르웨이·호주 CC BY 4.0 등 [16] | 무료, 계정 불필요 [16] | Terrarium PNG, z15까지(z16은 404) [M] |
| Mapterhorn | 전 지구 30 m, 일부 국가 0.25~1 m | 원천 151개, NC·SA 없음. 일본 GSI는 승인번호 조건 [17] | 공개 타일 URL·PMTiles 다운로드. 이용 한도 미기재 [17] | 512 WebP Terrarium. z0~12 전 지구, z13~17 고해상도 지역 [17] |
| Mapbox Terrain-DEM v1 | z14까지 | Mapbox 약관 | Mapbox SDK 전용 | "It is not available via the Raster Tiles API."(Raster Tiles API로는 못 받는다) [19] |
| Mapbox Terrain-RGB v1 | z15까지 | Mapbox 약관 | Raster Tiles API 과금 [18] | 2021-12-01 이후 고도 갱신 없음 [19] |
| Cesium World Terrain | 전 지구 약 1 km, ±60° 30~90 m, 유럽 30 m, 미국 1~30 m [20] | ion 플랜 따름. 무료판은 비상업 [20] | Commercial $149/월부터 [20] | quantized-mesh. QuantizedMeshPlugin으로 읽음 [10] |
| MapTiler terrain | (미확인) | 유료 플랜만 상용 [21] | Flex $30/월부터 [21] | — |

- Copernicus 표기: "© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved". 변형했으면 앞에 "produced using Copernicus WorldDEM-30"을 붙인다 [14]. 공식 보증처럼 보이면 안 되고(6d), 재배포 권리를 넘길 때는 같은 의무를 지운다(6e) [14].

### 위성영상

| 소스 | 해상도 | 라이선스·상용 | 비용 | 캐시·오프라인 |
|---|---|---|---|---|
| EOX Sentinel-2 cloudless | 10 m | 2016판 CC BY 4.0(상용 가능), 2018~2025판 CC BY-NC-SA 4.0 [22] | 비상업 무료. 상용 라이선스 가격 비공개(미확인) [22] | 2016판은 받아서 직접 호스팅 가능 |
| Esri World Imagery | 대부분 1 m 이하, 미국·서유럽 일부 30 cm, 작은 축척 15 m [24] | Esri Master License Agreement [24] | 타일: 월 200만 건 무료 후 1,000건당 $0.15. 세션: 월 1,000건 무료 후 1,000세션당 $4 [23] | "not intended to be used to export tiles for offline"(오프라인 내보내기용 아님) [24] |
| Mapbox Satellite | (미확인) | Mapbox 약관 | 월 75만 건 무료 → 1,000건당 $0.25/$0.20/$0.15 [18] | 캐시 규칙 원문 미확인 |
| MapTiler Satellite | (미확인) | Free는 "testing, PoC, prototyping, personal, or non-commercial use"(시험·개인·비상업용) [21] | Flex $30/월: 50만 요청, 초과 1,000건당 $0.15 [21] | (미확인) |
| Google 2D 위성 타일 | (미확인) | GMP 약관 [4] | 월 10만 건 무료 후 1,000건당 $0.60부터 [1] | 캐시 금지 [3] |
| NASA GIBS·Blue Marble | 전 지구용 저해상도 | 자유 공유, 출처 표기 요청 [25][51] | 무료 | 지구본 텍스처용 |

- Esri는 2025-10에 세션 과금을 추가했다 [26](검색 요약). 세션은 REST `sessions/start`로 열고 최대 12시간이며, 세션 토큰은 Basemap Styles 서비스 전용이다(Esri 개발자 문서, 2026-10-13 확인). three.js에서 World Imagery 래스터 타일을 세션 토큰으로 받아 세션 과금만 되는지는 확인 못 했다(미확인).
- Esri 표기는 "Esri, Vantor, Earthstar Geographics, and the GIS User Community"다 [24]. Maxar가 Vantor로 바뀌었다.
- EOX는 2026-06부터 표기를 "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data <연도>)"로 통일했다 [22].

### 얼마나 가까이 가도 되나 (계산)
가정: 세로 화각 45°, 화면 높이 1,000 px. 화면 1 px이 거리 d에서 약 0.00079·d m를 덮는다. 영상 1화소가 화면 2 px 이하로 늘어나는 거리를 '선명 한계'로 잡았다.

| 자료 | 해상도 | 선명 한계 거리 |
|---|---|---|
| Esri 30 cm(미국·서유럽 일부) | 0.3 m | 약 0.2 km |
| Esri Vivid Standard | 1.2 m | 약 0.8 km |
| Sentinel-2 cloudless | 10 m | 약 6.4 km |
| Esri 15 m TerraColor 지역 | 15 m | 약 9.6 km |
| DEM 30 m(격자 한 칸 ≤ 화면 10 px) | 30 m | 약 3.8 km |
| DEM 1 m(3DEP·swissALTI3D 등) | 1 m | 약 0.13 km |

- 절벽·폭포는 거리와 상관없이 약하다. 위에서 찍은 영상이 수직면에 늘어지고, 높이장은 돌출부를 못 그린다.
- 카메라를 지면 약 3 km 위에서 30°쯤 비스듬히 내려다보게 묶으면 화면 대부분이 4 km 밖이라 S2로도 버틴다(화면 아래쪽은 조금 흐리다). 1 km까지 내려가려면 Esri급 영상과 1 m DEM이 필요하다.

### 실제 타일 크기 (산지 5곳, 2026-10-13 측정 [M])

| 소스 | 형식 | 타일 크기 | 최대 줌 | CORS |
|---|---|---|---|---|
| Esri World Imagery | 256 JPEG | 10~23 KB | z16 응답 | 허용(*) |
| EOX S2 cloudless | 256 JPEG | 10~21 KB(z12~14) | z16도 응답(업샘플) | 허용(Origin 반사) |
| AWS Terrain Tiles | 256 PNG | 122~136 KB | z15 | 허용(*) |
| Mapterhorn | 512 WebP | 139~222 KB | 그랜드캐니언·요세미티·마터호른 z16 응답, 이구아수·하롱베이는 z14부터 404 | 허용(*) |

- 같은 256 px 기준으로 DEM PNG가 영상 JPEG보다 5~13배 무겁다. 전송량의 큰 몫은 DEM이다. DEM은 영상보다 한두 줌 낮게 받아 줄인다.
- 3DTilesRendererJS는 TerrariumMeshPlugin·TerrainRGBMeshPlugin(0.5.2, 2026-08-24 추가), QuantizedMeshPlugin, XYZ·WMTS·PMTiles 영상 오버레이, TopoLinesPlugin(등고선 예제)을 갖췄다 [10]. 지형과 Google 3D를 같은 렌더러에서 바꿔 끼운다. 지형 플러그인은 나온 지 두 달이라 거칠 수 있다.
- TerrariumMeshPlugin은 XYZ URL 템플릿만 받는다(기본 256 px, maxZoom 15) [10]. PMTiles DEM은 바로 못 읽는다. z/x/y 타일 파일로 풀어 R2에 올리거나 Worker로 풀어 준다. 파일로 풀면 10절 R2 계산(타일 1장 = 읽기 1건)이 그대로 맞는다. Mapterhorn은 tileDimension 512로 맞춘다.

**우리 사이트로 옮기면:** MVP 공중 뷰는 Mapterhorn/Copernicus DEM을 장소별 z/x/y 타일 파일(또는 PMTiles + Worker)로 잘라 R2에 직접 올리고, 영상은 상용 안전한 S2 cloudless 2016(CC BY)으로 시작한다. 카메라는 약 3 km 헬리콥터 고도로 묶는다. 근접이 필요한 장소만 Esri 세션 과금을 붙인다. Mapbox Terrain-DEM은 three.js에서 못 쓴다.

---

## 3. 360 사진과 2.5D 시차

### 360 사진 출처

| 출처 | 양 | 라이선스 | 우리 three.js 뷰어에 | 비용 |
|---|---|---|---|---|
| Wikimedia Commons | '360° panoramas' 분류 1,419,503개 [28] | 파일별 CC BY·BY-SA·PD. 표기하면 상용 가능 | 됨. 핫링크는 "possible, but is not recommended"(가능하지만 권하지 않음) [27] | 무료 |
| Mapillary | 도로·산책로 위주 | CC BY-SA 4.0, 일부 데이터셋 BY-NC-SA (약관 3(b), 2024-02-15) [30] | 됨. 앱별 client_id, Mapillary 로고·링크 표기. 상용은 약관 12조 목적과 재식별 금지 조건 [30] | 무료 쿼터(미확인) |
| Google Street View 타일 | 넓음. Google 촬영 + 사용자 사진 섞임, 고를 수 없음 [31] | GMP 약관 | 됨. 대신 비구글 지도와 한 화면 금지 [4] | 월 10만 타일 무료 후 1,000장당 $2.00 [1] |
| Flickr CC | (미확인) | 사진별 CC. 상용은 그 라이선스가 허용해야 함 [32] | API 상용 키는 심사·유료일 수 있고 페이지당 30장 [32] | API 키는 Pro 전용 [32](검색 요약) |

- Commons 최근 추가 15개는 모두 Mapillary에서 옮겨 온 Insta360 사진이었다 [M]. 자연 경관용 고품질 360은 장소마다 골라야 한다.
- Commons 등장방형 분류의 가나다순 처음 40개는 중앙값 36 MB, 최대 500 MB였다. 30개가 CC BY-SA, 10개가 CC BY였다 [M]. 4K~8K 큐브 타일로 다시 인코딩한다.
- Commons는 2026-01부터 표준 썸네일 폭 11단계(20~3840 px) 밖의 직접 요청(핫링크)을 거부한다 [29]. 받아서 직접 호스팅한다. 서버는 CORS를 허용한다 [M].
- Street View 타일은 줌 0~5, 최대 13,312 px 폭이다 [31]. 파노라마마다 저작권 표기와 "Report a problem" 링크를 띄워야 한다 [31]. 방문당 3장(장당 28타일)이면 10만 방문에 월 약 $12,280이다.
- 뷰어는 Photo Sphere Viewer(three.js 기반, MIT, 5.15.1)나 직접 만든 구체 메시면 된다 [36].

### 2.5D 시차 (단안 깊이 추정)

| 모델 | 라이선스 | 상용 |
|---|---|---|
| Depth Anything V2 Small | Apache-2.0 [33] | 됨 |
| Depth Anything V2 Base·Large·Giant | CC BY-NC 4.0 [33] | 안 됨 |
| Depth Anything 3 Small·Base·Metric-Large·Mono-Large(2025-11-14) | Apache 2.0 [34] | 됨 |
| Depth Anything 3 Large·Giant·Nested | CC BY-NC 4.0 [34] | 안 됨 |
| Apple SHARP(사진 1장 → 3D 가우시안, GPU에서 1초 미만) | 가중치 "exclusively for Research Purposes"(연구 목적 전용) [35] | 안 됨 |

- 방식: 깊이를 미리 만들어 구체·평면 메시를 변위시킨다. 카메라를 조금만 흔들어도 사진이 숨 쉬듯 산다.
- 한계: 크게 움직이면 물체 경계가 찢어지고 뒤가 비어 있다. 360 전용 깊이 모델의 라이선스는 확인 못 했다(미확인).
- BY-SA 사진으로 만든 깊이·변형물은 BY-SA로 내야 한다.

**우리 사이트로 옮기면:** 지상 뷰는 Commons 360(CC BY/BY-SA)을 받아 큐브 타일로 바꿔 R2에 올린다. 장소마다 작가·라이선스 크레딧 줄이 필수다. 시차는 DA3 Small/Base나 V2 Small(Apache)만 쓴다. Street View는 값과 약관 때문에 뺀다.

---

## 4. 360·드론 영상

- 유튜브 정책은 "modify, build upon, or block any portion or functionality of a YouTube player"(플레이어를 바꾸거나 덧대거나 막지 말 것)와 화면·소리 분리를 금지한다(2026-09-14) [37]. 다른 출처 iframe 화면은 브라우저가 WebGL로 넘겨주지도 않는다. 유튜브는 공식 임베드로만 띄운다.
- 자유 라이선스 영상은 적다. Commons '360-degree videos'는 63개, 'Aerial videos'는 47개다 [28][M].
- Pixabay 영상·소리는 상용이 되지만, 손대지 않은 원본 그대로의 '단독' 재배포는 금지다(2024-11-18 약관) [41].
- 직접 촬영: 미국 국립공원은 2014년 정책(PM 14-05)으로 드론 이착륙·조종을 금지했고 아직 유효하다 [40](검색 요약). 유명 명소일수록 드론 촬영이 어렵다.
- 전송: 4K 360을 20 Mbps로 잡으면 분당 약 150 MB, 1080p 드론 영상 6 Mbps면 분당 약 45 MB다(계산).
- 호스팅: Cloudflare Stream은 저장 1,000분당 월 $5, 재생 1,000분당 $1이다 [38]. 방문당 3분이면 10만 방문에 월 약 $305다. R2는 전송이 무료다 [39]. Stream의 360 지원은 문서에 없다(미확인).

**우리 사이트로 옮기면:** 영상은 MVP에서 뺀다. 물·구름이 살아 있어야 하는 몇 장소에만 라이선스 받은 클립을 VideoTexture로 붙인다. 유튜브는 "원본 보기" 링크로만 쓴다.

---

## 5. 가우시안 스플랫

- Spark(World Labs, MIT): 2.3.1(2026-10-01). PLY·SPZ·SPLAT·KSPLAT·SOG를 읽는다 [42]. 2.0(2026-04-14)부터 LoD 스트리밍(.RAD, HTTP Range)이 되고, 폰 약 50만 개·데스크톱 약 250만 개 예산으로 1억 개 넘는 장면을 그린다 [43](검색 요약).
- GaussianSplats3D(MIT): "this repo is no longer in active development"(더는 활발히 개발하지 않는다)이고 Spark를 권한다. 모바일 성능도 약하다 [44].
- 용량: 표준 PLY는 splat당 약 248바이트라 100만 개가 약 250 MB다(계산). SPZ는 보통 PLY보다 약 10배 작다 [45] → 약 25 MB.
- 캡처 출처: 자연 명소의 재사용 가능한 공개 스플랫은 못 찾았다(미확인). 직접 찍으면 드론 규제 [40]와 촬영·학습 비용이 든다.
- 생성형: World Labs Marble은 Standard에서 SPZ/PLY를 내보내고 상용 권리는 Pro부터다 [46]. 가격은 월 $20/$35/$95로 알려져 있다 [46](검색 요약). 실제 장소가 아니라 만들어 낸 장면이다.

**우리 사이트로 옮기면:** 렌더러는 Spark로 정해 둔다. 콘텐츠는 직접 찍거나 라이선스를 산 영웅 장소 1~2곳으로 실험한다. 생성형 장면은 '진짜 여행' 약속과 맞지 않아 쓰지 않는다.

---

## 6. 양식화 렌더링 (DEM 기반)

- 등고선: 3DTilesRendererJS 예제의 TopoLinesPlugin이 타일 위에 등고선을 그린다 [10]. MapLibre 쪽 maplibre-contour(BSD-3-Clause, 0.1.1)는 DEM 타일에서 바로 등고선을 만든다 [48].
- 음영 기복: DEM 법선으로 셰이더에서 계산한다. Natural Earth와 Natural Earth III 음영 기복 이미지는 공공 영역이다 [49](검색 요약).
- 회화풍: Kuwahara 필터 후처리가 three.js에서 쓰인다(2024-10-29 글) [47](검색 요약). 로우폴리는 DEM 격자를 성기게 하고 flat shading이면 된다.
- 비용은 DEM뿐이라 거의 0이다. 영상 라이선스 문제가 사라진다.
- 단점: "진짜 거기 있다"는 느낌은 사진보다 약하다.

**우리 사이트로 옮기면:** 로딩 중 화면, 저사양 기기, 영상 라이선스가 막힌 장소의 대체 뷰로 쓴다. 사이트의 그림 톤을 정하는 데도 쓴다.

---

## 7. 지구본 홈 화면

- three-globe(MIT, 2.45.5)와 globe.gl(MIT, 2.46.2)이 점·호·라벨·타일 레이어를 준다. 'Day/Night Cycle'과 'Solar Terminator' 예제가 있다 [50].
- 낮밤 경계는 표면 법선과 태양 방향의 내적에 smoothstep 하나로 된다 [52](검색 요약). 태양 위치는 suncalc(BSD-2-Clause)로 구한다 [56].
- 텍스처: NASA 자료는 대개 미국 내 저작권이 없고 NASA를 출처로 밝히면 된다. NASA가 보증하는 것처럼 보이게 하면 안 된다 [51]. Natural Earth는 공공 영역이다 [49].
- Radio Garden(2016)은 지구본 위 초록 점을 누르면 그 도시 라디오가 나온다 [53](검색 요약). '점을 누르면 그곳으로'의 원형이다.

**우리 사이트로 옮기면:** 홈은 실시간 낮밤이 도는 지구본과 장소 점이다. "지금 해가 뜨는 곳", "지금 비 오는 곳"이 자연스러운 진입점이 된다. 비용 0, 3~5일.

---

## 8. 하늘·대기·시간·날씨

- takram three-geospatial(MIT): three-atmosphere 0.19.1(Beta)은 사전 계산 대기 산란, three-clouds 0.7.6(Beta)은 볼륨 구름이다 [54]. 3d-tiles-renderer와 함께 쓰도록 만들었다. WebGPU판은 대기 완료, 구름 진행 중이다 [54].
- three.js 예제의 Sky(Preetham 모델)는 가볍고 바로 쓴다(three 0.186.1) [55].
- Google 3D는 조명이 구워져 있어 시간대 하늘과 어긋난다 [8]. 대기·안개 연출은 DEM 장면에서 가장 잘 먹힌다.

| 날씨 API | 무료 | 상용 | 라이선스·조건 |
|---|---|---|---|
| Open-Meteo | 비상업만. 분당 600, 시간당 5,000, 하루 10,000, 월 300,000건 [57] | Standard 월 100만 건 €29/월, Professional 500만 건 €99/월(연 €319·€1,099, 2026-10-13 가격표) [57]. 2023-06 발표 때는 $29·$99로 적었다 [58] | CC BY 4.0. 광고·구독이 붙으면 상용 [57] |
| MET Norway | 상용 포함 무료 | 됨 | CC BY 4.0 + NLOD 2.0 [59]. 초당 20건 넘으면 협의, 식별 헤더 필수, 트래픽이 크면 캐시 프록시 필수 [59] |

- 장소 50곳을 서버에서 시간당 한 번만 받아 두면 월 36,000건이다(계산). 방문 수와 상관없다.

**우리 사이트로 옮기면:** MVP는 three.js Sky + suncalc로 '그곳의 지금 해 위치'를 그리고, MET Norway로 지금 날씨를 얹는다. takram 대기·구름은 데스크톱 업그레이드다.

---

## 9. 주변 소리

| 출처 | 라이선스 | 상용 | 비고 |
|---|---|---|---|
| Freesound | 파일별 CC0 / CC BY 4.0 / CC BY-NC 4.0, 옛 녹음은 Sampling+ 1.0 [60] | CC0·BY만 | API 상용 조건은 UPF와 개별 협의 [60] |
| Pixabay 효과음 | Pixabay Content License [41] | 됨. 표기 불필요(약관 6조) | 원본 그대로 단독 재배포 금지 |
| BBC Sound Effects | RemArc: 개인·교육·연구용 [61] | 안 됨. 광고·후원이 붙어도 상용. 상용은 Pro Sound Effects에서 구매 [61] | 사이트 본문으로 확인(2026-10-13) |
| xeno-canto | 100만+ 녹음, 모두 CC [62] | 대부분 BY-NC 계열 [62](검색 요약) | 녹음자·라이선스·번호 표기 |

- 브라우저는 사용자가 누르기 전 소리 자동 재생을 막는다. 첫 화면에 '소리 켜기'가 필요하다.
- 96 kbps 루프면 분당 약 0.7 MB다(계산).

**우리 사이트로 옮기면:** MVP는 Pixabay와 Freesound CC0·CC BY만 쓰고 크레딧 페이지를 둔다. 새소리는 xeno-canto 중 CC BY 녹음만 골라 쓴다.

---

## 10. 월 비용 추정

가정: 방문 1회 = 6분, 장소 3곳(각 2분) + 지구본. 512 px 타일 기준 장소당 처음 약 70건 + 선회 중 약 30건 → 방문당 약 300건(DEM 100, 영상 200). Google 3D는 한 페이지 세션에 루트 1건. 브라우저 캐시는 빼고 셌다. 가격은 2026-10-13 확인.

| 선택지 | 방문당 사용량 | 월 1만 방문 | 월 10만 방문 |
|---|---|---|---|
| Google 3D Tiles [1] | 루트 1건(1.5건) | $54($84) | $594($849) |
| Mapbox Raster Tiles(위성+Terrain-RGB) [18] | 300건 | $512 | 약 $4,600(2,000만 건 초과분 영업 문의, $0.15 가정) |
| MapTiler Flex [21] | 300건 | $405 | $4,455 |
| Google 2D 위성 타일 [1] | 200건 | $1,020 | $6,060 |
| Esri 타일 과금 [23] | 영상 200건 | $0 | $2,700 |
| Esri 세션 과금 [23] | 1세션 | $36 | $396 |
| Cesium ion [20] | 루트·영상 세션 | Premium $499(각 월 1만) | Custom(미확인) |
| 직접 호스팅 R2(Copernicus/Mapterhorn + S2 2016) [39] | 300건 | $0 | 약 $7 |
| 360 사진 직접 호스팅 R2 [39] | 3장 × 3 MB | $0(전송 90 GB) | $0(전송 900 GB) |
| 360·드론 영상 Cloudflare Stream [38] | 3분 | 약 $35 | 약 $305 |
| Street View 타일 [1] | 3장 × 28타일 | $1,480 | $12,280 |
| 날씨: MET Norway / Open-Meteo 상용 [59][57] | 서버 캐시 | $0 / €29 | $0 / €29 |

- Google 2D·Street View 타일은 기본 한도가 프로젝트당 하루 15,000건·분당 6,000건(둘 합산)이다 [2]. 표의 두 줄은 한도 상향을 받아야 나오는 값이다.
- Mapbox GL JS로 그리면 지도 로드 과금(월 5만 무료 후 1,000건당 $5부터)이고 타일 요청은 무제한이다 [18]. 10만 방문 × 3로드면 약 $950이지만 three.js가 아니다.
- 타일당 과금은 방문 수에 정비례한다. 방문당 1건 과금(Google 3D 루트, Esri 세션)과 직접 호스팅은 훨씬 완만하다.

**우리 사이트로 옮기면:** 공중 뷰를 직접 호스팅으로 시작하면 트래픽이 늘어도 비용이 안 튄다. 유료 API는 '방문당 1건' 구조(Google 3D 루트, Esri 세션)만 쓴다.

---

## 11. 추천 스택

### MVP — 상용 안전 경로
1. 홈: globe.gl/three-globe + NASA Blue/Black Marble 텍스처 + suncalc 낮밤 경계 [50][51][56].
2. 공중 뷰: 3DTilesRendererJS TerrariumMeshPlugin + Mapterhorn/Copernicus DEM(장소별 z/x/y 타일 파일, R2) + S2 cloudless 2016 영상 [10][14][17][22]. 카메라는 지면 약 3 km 위에서 비스듬히 자동 선회. Esri 영상을 붙인 장소만 1 km까지 내린다.
3. 지상 뷰: Commons 360(CC BY/BY-SA)을 큐브 타일로 바꿔 R2에 호스팅 [27][39]. 크레딧 줄 필수.
4. 분위기: three.js Sky + suncalc + MET Norway 날씨 + Pixabay·Freesound CC0/BY 소리 [55][56][59][41][60].
5. 예상 비용: 1만 방문 월 $0~10, 10만 방문 월 약 $10(도메인·서버 제외).

### 업그레이드 경로 (순서대로)
1. 근접 영상: 선명도가 모자란 장소만 Esri World Imagery 세션 과금(10만 방문 약 $396/월) [23]. 국가 정사영상(스위스·프랑스·뉴질랜드·미국 등)은 라이선스 확인 뒤 추가(미확인).
2. 2.5D 시차: DA3 Small/Base(Apache)로 360 사진에 숨결 [34].
3. 실사 모드: Google Photorealistic 3D Tiles를 별도 화면으로(10만 방문 약 $594/월) [1][4]. iOS 메모리 실측 뒤.
4. 대기·구름: takram three-atmosphere/clouds, 데스크톱 먼저 [54].
5. 영상·스플랫: 라이선스를 확보한 장소 몇 곳만. Cloudflare Stream·Spark [38][42].

### 비상업 전용 (상용으로 가면 바꿔야 할 것)
- 지도·영상: EOX S2 cloudless 2018~2025(CC BY-NC-SA) [22], MapTiler Free [21], Cesium ion Community [20], Open-Meteo 무료판 [57].
- 모델: Depth Anything V2 Base 이상, DA3 Large 이상(CC BY-NC), Apple SHARP(연구 전용) [33][34][35].
- 소리: BBC Sound Effects, xeno-canto NC 녹음, Freesound CC BY-NC [61][62][60].
- 생성 장면: World Labs Marble Free/Standard 결과물 [46].

**우리 사이트로 옮기면:** 상용 여부를 아직 안 정했어도 MVP를 상용 안전 경로로 만들면 나중에 바꿀 게 없다. 비상업 전용 자료는 '실험' 표시를 붙여 따로 둔다.

---

## 남은 질문

- 상용 여부: 광고·구독을 붙이면 Open-Meteo 기준으로 상용이다 [57]. 결정이 먼저다.
- 후보 장소마다 Google 3D가 사진측량인지 Google Earth 3D Coverage로 확인해야 한다 [6].
- Google 3D와 DEM 뷰의 실제 전송량, iOS Safari 메모리를 프로토타입으로 재야 한다(미확인).
- 한국 경관(한라산·설악산)의 Google 3D 품질과 국내 DEM·정사영상 라이선스를 확인 못 했다(미확인). Mapterhorn 원천 목록에 한국 고해상도 자료는 없다 [17].
- Google 약관의 "near a non-Google Map" 범위: 비구글 지구본에서 구글 실사 화면으로 넘어가는 구성이 되는지 Google에 물어야 한다 [4].
- Esri 세션 과금이 three.js 직접 타일 요청에 적용되는지, 'Powered by Esri' 표기 위치(미확인).
- Mapterhorn 공개 타일은 이용 한도가 문서에 없다 [17]. 직접 호스팅으로 옮길 시점을 정해야 한다.

---

## 출처

- [1] Google Maps Platform, 가격표(Map Tiles·Street View) (2026-10-13 확인). https://developers.google.com/maps/billing-and-pricing/pricing
- [2] Google, Map Tiles API Usage and Billing. https://developers.google.com/maps/documentation/tile/usage-and-billing
- [3] Google, Map Tiles API Policies. https://developers.google.com/maps/documentation/tile/policies
- [4] Google, Google Maps Platform Terms of Service (최종 수정 2026-08-26). https://cloud.google.com/maps-platform/terms
- [5] Google, Map Tiles 제품 페이지. https://mapsplatform.google.com/maps-products/map-tiles/
- [6] Luciad, Google 3D Tiles 연결 문서. https://dev.luciad.com/portal/productDocumentation/LuciadRIA/docs/articles/howto/ogc3dtiles/google3DTiles.html
- [7] The Photo Ephemeris, Photorealistic 3D Tiles in TPE (2026-09-09). https://photoephemeris.com/articles/photorealistic-3d-tiles-in-tpe
- [8] The Photo Ephemeris, Terrain vs Photorealistic in FPV Mode (2026-08-21). https://photoephemeris.com/en/help/tpe-web/terrain-vs-photorealistic-in-fpv-mode/
- [9] afi.io, What is the Google Photorealistic 3D Tiles API (2025-04-10). https://blog.afi.io/blog/what-is-the-google-photorealistic-3d-tiles-api/
- [10] NASA-AMMOS, 3DTilesRendererJS 저장소·플러그인 API·CHANGELOG (npm 0.5.3, 2026-09-18). https://github.com/NASA-AMMOS/3DTilesRendererJS
- [11] Cesium Community, iOS memory crash with Google 3D Tiles (검색 요약). https://community.cesium.com/t/ios-memory-crash-with-google-3d-tiles/33037
- [12] three.js forum, 3d-tiles-renderer memory problem (검색 요약). https://discourse.threejs.org/t/3d-tiles-renderer-memory-problem/90078
- [13] IEEE JSTARS, Google Earth 화면 기반 하프돔 재구성 연구 (2020-01, 검색 요약). https://doaj.org/article/ca456a99e9754c25a1d1e794876a42d0
- [14] Copernicus WorldDEM-30 라이선스 (PDF). https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/DEM/resources/license/License-COPDEM-30.pdf
- [15] AWS Open Data, Copernicus DEM. https://registry.opendata.aws/copernicus-dem/
- [16] AWS Open Data, Terrain Tiles / Tilezen 출처 표기 문서. https://registry.opendata.aws/terrain-tiles/ , https://github.com/tilezen/joerd/blob/master/docs/attribution.md
- [17] Mapterhorn, 소개·Data Access·attribution.json (2025~2026). https://mapterhorn.com/data-access/ , https://download.mapterhorn.com/attribution.json
- [18] Mapbox, Pricing (2026-10-13 확인). https://www.mapbox.com/pricing
- [19] Mapbox, Terrain-DEM v1 / Terrain-RGB v1 / Raster Tiles API 문서. https://docs.mapbox.com/data/tilesets/reference/mapbox-terrain-dem-v1/ , https://docs.mapbox.com/api/maps/raster-tiles/
- [20] Cesium, ion Pricing / Cesium World Terrain. https://cesium.com/platform/cesium-ion/pricing/ , https://cesium.com/platform/cesium-ion/content/cesium-world-terrain/
- [21] MapTiler, Cloud Pricing (2026-10-13 확인). https://www.maptiler.com/cloud/pricing/
- [22] EOX, EOxCloudless Pricing / License 문서. https://cloudless.eox.at/pricing , https://cloudless.eox.at/documentation/license
- [23] Esri, ArcGIS Location Platform Pricing (2026-10-13 확인). https://location.arcgis.com/pricing/
- [24] Esri, World Imagery 항목 설명·라이선스 (2026-10 수정). https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9
- [25] NASA, GIBS API 문서. https://nasa-gibs.github.io/gibs-api-docs/
- [26] Esri, Location Platform 기본지도 세션 과금 발표 (2025-10-08, 검색 요약). https://www.esri.com/about/newsroom/announcements/esri-arcgis-location-platform-adds-session-usage-pricing-for-basemaps
- [27] Wikimedia Commons, Reusing content outside Wikimedia. https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
- [28] Wikimedia Commons API 직접 조회 (2026-10-13): Category:360° panoramas, 360-degree videos, Aerial videos. https://commons.wikimedia.org/wiki/Category:360%C2%B0_panoramas
- [29] MediaWiki, Common thumbnail sizes (표준 폭 20~3840 px, 2026-10-13 확인) / InstantCommons. https://www.mediawiki.org/wiki/Common_thumbnail_sizes , https://www.mediawiki.org/wiki/InstantCommons
- [30] Mapillary, Terms of Use (시행 2024-02-15) / 도움말 Licenses. https://www.mapillary.com/terms , https://help.mapillary.com/hc/en-us/articles/115001770409-Licenses
- [31] Google, Street View Tiles 문서. https://developers.google.com/maps/documentation/tile/streetview
- [32] Flickr, API Terms of Use (2018-05-09) / Pro 전용 API 키(검색 요약). https://www.flickr.com/services/api/tos/ , https://www.flickrhelp.com/hc/en-us/articles/4404070036884-Flickr-API
- [33] Depth Anything V2 저장소. https://github.com/DepthAnything/Depth-Anything-V2
- [34] Depth Anything 3 저장소 (2025-11-14 공개). https://github.com/ByteDance-Seed/Depth-Anything-3
- [35] Apple, ml-sharp 저장소·LICENSE_MODEL. https://github.com/apple/ml-sharp
- [36] Photo Sphere Viewer (npm @photo-sphere-viewer/core 5.15.1, 2026-08-02, MIT). https://www.npmjs.com/package/@photo-sphere-viewer/core
- [37] YouTube API Services, Developer Policies (2026-09-14). https://developers.google.com/youtube/terms/developer-policies
- [38] Cloudflare, Stream Pricing. https://developers.cloudflare.com/stream/pricing/
- [39] Cloudflare, R2 Pricing. https://developers.cloudflare.com/r2/pricing/
- [40] NPS, Unmanned Aircraft in the National Parks (검색 요약). https://www.nps.gov/articles/unmanned-aircraft-in-the-national-parks.htm
- [41] Pixabay, Terms of Service (2024-11-18). https://pixabay.com/service/terms/
- [42] Spark 저장소·사이트 (npm @sparkjsdev/spark 2.3.1, 2026-10-01, MIT). https://github.com/sparkjsdev/spark , https://sparkjs.dev/
- [43] Radiance Fields, World Labs Releases Spark V2.0 / World Labs 블로그 Spark 2.0 (2026-04-14, 검색 요약). https://radiancefields.com/world-labs-releases-spark-v2.0 , https://worldlabs.ai/blog/spark-2.0
- [44] mkkellogg, GaussianSplats3D 저장소 (npm 0.4.7, 2025-01-25). https://github.com/mkkellogg/GaussianSplats3D
- [45] Niantic, SPZ 저장소. https://github.com/nianticlabs/spz
- [46] World Labs, Marble Gaussian splat 내보내기 문서 / 가격(제3자 정리, 검색 요약). https://docs.worldlabs.ai/marble/export/gaussian-splat , https://skywork.ai/blog/llm/marble-ai-pricing-access/
- [47] Maxime Heckel, On Crafting Painterly Shaders (2024-10-29, 검색 요약). https://blog.maximeheckel.com/posts/on-crafting-painterly-shaders
- [48] maplibre-contour (npm 0.1.1, 2026-09-17, BSD-3-Clause). https://www.npmjs.com/package/maplibre-contour
- [49] Natural Earth 소개·이용 조건 / Natural Earth III 이용 조건 (검색 요약). https://www.naturalearthdata.com/about/ , https://www.shadedrelief.com/natural3/pages/use.html
- [50] vasturiano, three-globe (npm 2.45.5, 2026-10-13) / globe.gl (npm 2.46.2, 2026-08-22). https://github.com/vasturiano/three-globe
- [51] NASA, Media Usage Guidelines (2026-08-13). https://www.nasa.gov/nasa-brand-center/images-and-media/
- [52] three.js forum, Timetate — 실시간 낮밤 경계 세계시계 (검색 요약). https://discourse.threejs.org/t/timetate-a-world-clock-built-on-a-real-time-day-night-terminator/93975
- [53] The FADER, Radio Garden 소개 (2016-12-12, 검색 요약). https://www.thefader.com/2016/12/12/radiogarden-discover-live-streaming-radio-across-the-glove
- [54] takram, three-geospatial 저장소 (three-atmosphere 0.19.1, three-clouds 0.7.6, 2026-05-06). https://github.com/takram-design-engineering/three-geospatial
- [55] three.js (npm 0.186.1, 2026-09-24, MIT), examples Sky. https://www.npmjs.com/package/three
- [56] mourner, suncalc (BSD-2-Clause, npm 2.1.1, 2026-10-05). https://github.com/mourner/suncalc
- [57] Open-Meteo, Pricing(Stripe 가격표, EUR) / Terms (2026-10-13 확인). https://open-meteo.com/en/pricing , https://open-meteo.com/en/terms
- [58] Open-Meteo, API Subscriptions for Commercial Use (2023-06-12). https://openmeteo.substack.com/p/api-subscriptions-for-commercial
- [59] MET Norway, Terms of Service / License. https://api.met.no/doc/TermsOfService , https://api.met.no/doc/License
- [60] Freesound, API Terms of Use / FAQ. https://freesound.org/help/tos_api/ , https://freesound.org/help/faq/
- [61] BBC Sound Effects 사이트 About·Licensing·다운로드 안내 본문 (2026-10-13 확인) / DIY Photography 보도. https://sound-effects.bbcrewind.co.uk/licensing , https://www.diyphotography.net/the-bbc-sound-effects-archive-is-now-free-to-download-with-over-33000-files/
- [62] Wikipedia, Xeno-canto / 라이선스 구성(검색 요약). https://en.wikipedia.org/wiki/Xeno-canto
- [M] 직접 측정 (2026-10-13): curl로 Esri·EOX·AWS·Mapterhorn 타일 크기와 CORS 헤더(그랜드캐니언·요세미티·마터호른·이구아수·하롱베이, z12/14/16), Wikimedia Commons API로 분류 수량·파일 크기·라이선스 표본 40개.

---

## 검증 (2026-10-13)

결정에 걸린 주장 14개를 원문(가격표·약관·라이선스 PDF·저장소·npm·공개 API)으로 다시 열어 반박을 시도했다. 틀린 것은 본문과 JSON을 고쳤다.

| 주장 | 판정 | 바로잡은 내용 | 출처 |
|---|---|---|---|
| Google 3D 가격: 월 1,000건 무료, $6.00→$5.10→$4.20→$3.30→$2.40 | 맞음 | 구간은 10만·50만·100만·500만 건. 1만 방문 $54, 10만 방문 $594 계산도 맞다 | developers.google.com/maps/billing-and-pricing/pricing |
| 루트 1건 = 렌더러 3시간, 렌더러는 일일 한도 밖, 루트 하루 1만·렌더러 분당 1.2만 | 맞음 | 분당 1.2만은 프로젝트 전체 합이다. 동시 접속이 많으면 먼저 걸릴 수 있다(추정) | developers.google.com/maps/documentation/tile/usage-and-billing |
| GMP 약관 3.2.3(e) 비구글 지도 '함께·가까이' 금지, (b) 캐시 금지 (2026-08-26판) | 맞음 | (b)는 서비스별 약관이 허용한 캐시만 예외다. Map Tiles 정책은 HTTP Cache-Control을 따르라고 한다(브라우저 캐시는 됨) | cloud.google.com/maps-platform/terms , developers.google.com/maps/documentation/tile/policies |
| 상세 메시 2,000여 도시, 나머지는 고도형 메시, 해상도가 Google 제품보다 낮을 수 있음 | 맞음 | 출처가 Luciad 문서(제3자)다. Google 제품 페이지는 '49개국 이상'만 적었다 | Luciad 문서, mapsplatform.google.com/maps-products/map-tiles/ |
| Mapbox Terrain-DEM v1은 SDK 전용, Raster Tiles API 월 75만 무료 후 $0.25부터 | 맞음 | 구간 $0.25/$0.20/$0.15, 2,000만 건 초과는 영업 문의 | docs.mapbox.com Terrain-DEM v1, mapbox.com/pricing |
| Copernicus GLO-30: 무료, 복제·배포·공중 전달·변형·결합 허용, 출처 문구·면책 문장'만' 요구 | 일부 고침 | 공식 보증 암시 금지(6d)와 하위 이용자에게 같은 의무 지우기(6e)도 요구한다 | License-COPDEM-30.pdf |
| EOX: 2016판만 CC BY 4.0, 2018~2025판 CC BY-NC-SA 4.0, 상용은 별도·가격 비공개 | 맞음 | 상용 라이선스 이름은 'EOX Commercial Attribution-RestrictedUse 1.2'. 원본 그대로 재배포는 무료라도 금지 | cloudless.eox.at/pricing , /documentation/license , /license-legal |
| Esri: 타일 월 200만 무료 후 1,000건당 $0.15, 세션 월 1,000 무료 후 1,000세션당 $4 | 맞음 | 세션 최대 12시간도 공식 문서로 확인. 세션 토큰은 Basemap Styles 서비스 전용이라 World Imagery 래스터에 쓰이는지는 여전히 미확인 | location.arcgis.com/pricing/ , developers.arcgis.com/rest/basemap-styles/sessions-start-get/ |
| Mapterhorn: 512 px WebP Terrarium, z0~12 전 지구·z13~17 고해상도, 원천 151개에 NC·SA 없음, 이용 한도 미기재 | 맞음 | 코드 BSD-3-Clause. 한국 원천 없음도 다시 확인 | download.mapterhorn.com/attribution.json , mapterhorn.com/data-access/ |
| 3DTilesRendererJS 0.5.2(2026-08-24) 지형 플러그인, 최신 0.5.3(2026-09-18), Apache-2.0 | 맞음 | 지형 플러그인은 XYZ URL만 받는다. PMTiles DEM은 z/x/y 파일로 풀거나 Worker가 필요해 본문을 고쳤다 | CHANGELOG, src/three/plugins/API.md, npm |
| YouTube 정책: 플레이어 변경·덧대기 금지, 화면·소리 분리 금지 (2026-09-14) | 맞음 | — | developers.google.com/youtube/terms/developer-policies |
| Commons '360° panoramas' 1,419,503개, 표본 40개 중앙값 36 MB, BY-SA 30·BY 10 | 맞음 | 같은 날 API 재조회는 1,420,064개(계속 는다). 표본은 '360° panoramas with equirectangular projection' 앞 40개로 똑같이 나왔다(중앙값 36.3 MB, 최대 500.7 MB) | Commons API |
| Depth Anything V2 Small만 Apache, DA3 Small·Base·Metric-L·Mono-L Apache, Large·Giant BY-NC | 맞음 | 재학습판 DA3-LARGE-1.1·GIANT-1.1·NESTED-1.1도 CC BY-NC 4.0 | DA3·DA V2 README |
| Open-Meteo 무료는 비상업·하루 1만 미만, 상용 Standard 월 100만 건 $29(2023-06) | 일부 고침 | 현재 가격표는 유로다. Standard €29/월, Professional €99/월(연 €319·€1,099) | open-meteo.com/en/pricing(Stripe 가격표), /en/terms |

함께 고친 것:
- Google 2D·Street View 타일 기본 한도는 하루 15,000건·분당 6,000건(합산)이다. 10절 표에 한도 상향 전제를 적었다.
- Mapillary는 약관 원문으로 확인했다. CC BY-SA 4.0(일부 BY-NC-SA), Mapillary 로고·링크 표기, 상용은 12조 조건.
- BBC Sound Effects는 사이트 본문으로 확인했다. RemArc는 비상업 전용이고, 상용은 Pro Sound Effects에서 산다.
- Commons 썸네일 제한은 MediaWiki 문서로 확인했다. 표준 폭은 20~3840 px 11단계다.
- Pixabay 표기 불필요는 약관 6조로, Natural Earth 공공 영역은 공식 이용 조건으로, 미국 국립공원 드론 금지(PM 14-05)는 NPS 원문으로 확인했다.
- R2의 r2.dev 공개 주소는 속도 제한이 걸린 개발용이다. 서비스는 커스텀 도메인으로 연다.

여전히 못 연 것: xeno-canto 약관(봇 차단), Natural Earth III 이용 조건(403), World Labs Marble 공식 가격표, Esri 세션 발표문(403), Flickr Pro 전용 API 키 안내(403).
