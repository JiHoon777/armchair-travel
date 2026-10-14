# 지금 거기 — 1단계 시제품 (그랜드캐니언)

지구본에서 그랜드캐니언으로 내려가 다섯 장면(내려가기 30초 → 크게 보기 3분 → 다가가기 3분 → 그 자리에 서기 3분 → 하루 빨리 감기 3분)을 틀어 두고 보는 사이트입니다. 빌드 없이 정적 파일 그대로 돌아갑니다. three.js r170은 jsDelivr에서 import map으로 불러옵니다.

## 실행

```sh
tools/serve.sh          # site/ 를 http://localhost:8077 로 엽니다 (python3 -m http.server)
```

브라우저에서 http://localhost:8077 을 엽니다. `file://`로 열면 데이터를 못 읽습니다.

## 조작

| 키 | 하는 일 |
|---|---|
| 스페이스 | 멈춤 / 다시 재생 (멈추면 이야기 카드가 옆에 열리고, 다음 스페이스는 다시 재생합니다) |
| → / ← | 다음 장면 / 처음부터 또는 앞 장면 |
| I | 이야기 카드 열기·닫기 |
| M | 소리 켜기·끄기 |
| F | 전체 화면 |
| Esc | 열린 창 닫기 |

끌면 둘러보고, 손을 떼면 4초 뒤 원래 길로 돌아갑니다. 돌아오는 시간은 돌린 만큼 길어져서 회전이 초당 9°(위아래 4.5°)를 넘지 않습니다. 너무 크게 돌려서 8초 넘게 걸릴 때는 0.6초 어두워졌다가 원래 길에서 다시 밝아집니다. 360 사진에서는 돌려 놓은 방향이 그대로 남습니다. 휠·두 손가락으로 화각을 조금 바꿉니다.

시작 버튼은 모두 자연 소리를 작게 켭니다(「그냥 틀어 두기」, 「들어가기 · 전체 화면」, 지구본의 점). 소리 버튼이나 M으로 끄면 다음 시작에도 꺼진 채로 둡니다(「들어가기」만 다시 켭니다). 「들어가기」는 전체 화면도 켜고 한 바퀴 뒤 지구본에 머물고, 「그냥 틀어 두기」는 계속 돕니다. 이야기 카드가 열려 있어도 멈춤·소리·다음 버튼은 카드 왼쪽(폰은 카드 위쪽 ▶·✕)에서 누를 수 있습니다. 캡션을 누르면 이야기 카드가 열립니다. 기기에서 「동작 줄이기」를 켜면 비행 없이 장면마다 정지 화면과 3초 디졸브로 보여 줍니다. 데이터 절약을 켰거나 2G·3G 연결이면 폰용 작은 텍스처를 씁니다.

## 시험용 URL 인자

| 인자 | 뜻 |
|---|---|
| `?scene=wide&t=60` | 그 장면, 그 초로 바로 갑니다 (descend, wide, approach, stand, daylapse, ascend) |
| `?time=2026-10-13T17:30:00Z` | 지금 시각을 바꿉니다 (그곳의 해·하늘·시간 표시) |
| `?still=1` | 시간을 멈춥니다 (스크린숏용) |
| `?lowres=1` | 폰용 텍스처, 화소 비율 1 |
| `?nogui=1` | 글자와 버튼을 숨깁니다 |
| `?autoplay=1` | 클릭 없이 소리 없이 시작합니다 |
| `?reduced=1` | 「동작 줄이기」처럼 봅니다 |
| `?open=cards` · `deep` · `credits` | 창을 열어 둡니다 (스크린숏용) |
| `?speed=20` | 장면 시간을 20배로 돌립니다 (전체 흐름 시험용, 0.1~60) |
| `?debug=crack` | 하늘 대신 자홍색 배경, 구름 없음 (지형 구멍 찾기, `tools/check_cracks.mjs`) |
| `?lod=0` | 모든 조각을 한 LOD 단계로 고정합니다 (이음매 원인 가르기용) |
| `?lite=1` | 데이터 절약이 켜진 것처럼 작은 텍스처를 씁니다 |
| `?paused=1` | `?scene=` 으로 들어간 뒤 멈춘 상태로 둡니다 (이야기 카드가 열림, 스크린숏용) |
| `?disposems=2500` | 한 바퀴 뒤 지구본에서 지형을 비우기까지의 시간 (기본 60초, 시험용) |

`window.__armchair` 에 상태(state, scene, t, fps, camera, sun)와 `readyForShot()`, 점검용 `audio()`·`look()`·`paths()`·`narration()`·`terrainState()`·`tune({grade, ambDay, sunDay, bounce, hazeElev, debake, steep})` 이 있습니다.

## 점검 도구 (Node 24, 설치할 것 없음)

```sh
node tools/check_paths.mjs --dem both   # 카메라 길의 회전·흐름·지면 거리 한계 (합성 지형 + 실제 지형)
node site/test/sun.test.mjs             # 해 뜨고 지는 시각
node site/test/paths.test.mjs           # 장면 사이 연속성
node tools/check_browser_tests.mjs      # site/test/index.html (PNG 디코딩 정확도 등)
node tools/check_page.mjs               # 여러 URL을 헤드리스 크롬으로 열어 오류 확인
node tools/check_interact.mjs           # 클릭·키·끌기로 흐름 확인
tools/shots.sh                          # docs/proto/shots/*.png (데스크톱 1280×720, 폰 390×844)
node tools/validate_data.mjs            # 데이터 계약 검사 (JSON 모양, 그림 크기, DEM 디코딩, 크기, 크레딧, 글 분량, 아티팩트 규칙)
node tools/integrate_shots.mjs          # 통합 스크린숏 16장 × (데스크톱, 폰) → docs/proto/shots/integrate/
node tools/check_cracks.mjs             # 지형 구멍·이음매 검사 (18자세 × 데스크톱·폰)
node tools/check_fullrun.mjs            # ?autoplay=1&speed=20 으로 한 바퀴 + 두 번째 바퀴 시작까지, 콘솔 오류 0 확인
node tools/check_touch.mjs              # 폰 터치: 끌기·4초 유지·복귀, 360 사진, 핀치, 탭
node tools/measure_timing.mjs --throttle 20   # 첫 지구본 프레임·지형 준비 시간 (로컬, 20 Mbit/s)
node tools/check_fixes.mjs              # 2026-10-13 검토 지적 회귀 시험 (되돌림 속도, 소리 디코딩 1번, 카드와 버튼, 늦은 지형, 장면 경계 끌기, 해설 멈춤, 소리 깨우기, 지형 비우기, 창 포커스, 밤 선택, three.js 차단 안내, 알림 겹침, 시각 칩, 360 사진 회전 범위)
uv run --quiet --with numpy --with pillow python -I tools/measure_color.py IMG x0 y0 x1 y1   # 화면 영역의 평균 색·채도·밝기 (색 보정용)
```

## 파일

| 경로 | 내용 |
|---|---|
| `index.html`, `css/app.css` | 화면 (HTML 글자는 캔버스 위에 얹음) |
| `js/main.js` | 시작, 시계, 데이터, 그리기, 매 프레임 |
| `js/config.js` | 조정값 한곳 (편안함 한계, 장면 길이, 지형·하늘 값) |
| `js/paths.js` | 장면별 카메라 길 (순수 함수, Node에서도 import) |
| `js/sequencer.js` | 장면 순서와 시간 |
| `js/terrain.js` | 지형: Terrarium PNG를 정확히 디코딩, 12×12 조각 LOD, 높이는 정점 셰이더가 읽음. 해 쪽으로 DEM을 따라가는 GPU 패스로 그림자(해가 0.25° 움직일 때만 다시 그림), 항공 사진에 구워진 한낮 그림자는 들어 올림 |
| `js/sky.js`, `js/skymath.js` | 하늘(Preetham), 박명 돔, 지평선 색에 맞춘 연무, 별 |
| `js/globe.js`, `js/landmask.js` | 첫 화면 지구본(낮·밤), 내려갈 때 덧대는 500 m 지역 패치(약 1,200 km)와 100 km 항공 사진 패치, 데이터 없을 때 쓰는 대체 지구본 |
| `js/pano.js` | 360 사진 |
| `js/look.js` | 끌어서 둘러보기 |
| `js/ui.js` | 칩, 캡션, 장면 점, 카드, 깊이 읽기, 크레딧, 알림 |
| `js/audio.js`, `js/narration.js` | 자연 소리(클릭 뒤), 기기 음성 해설 |
| `js/sun.js` | 해 위치·해 뜨고 지는 시각 (NOAA 식 직접 구현) |
| `js/procedural.js` | 지형 데이터가 없을 때 쓰는 협곡 모양 높이 |
| `js/data.js` | 데이터 경로와 없을 때의 대체 내용 |
| `data/` | 다른 담당이 만드는 데이터 (지형, 사진, 소리, 글) |
| `test/` | 브라우저·Node 시험 |

데이터 파일이 하나도 없어도 열립니다(대체 지구본, 협곡 모양 지형, 안내 글). 외부 요청은 jsDelivr(three.js)와 Google Fonts뿐이고, 데이터는 모두 같은 폴더에서 상대 경로로 읽습니다.
