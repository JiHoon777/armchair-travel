"""Copy and section layout for the armchair plan page.

Numbers come from docs/research/01~05 (checked 2026-10-13). Anything marked
목표치 is a target to be measured in step 1, not a research result.
"""
import json
import os
from pathlib import Path

HERE = Path(__file__).resolve().parent
RESEARCH = HERE / 'research'

TITLE = '지금 거기'
METER0 = ('우주', '400 km')

CONTINENT_KO = {'asia': '아시아', 'europe': '유럽', 'africa': '아프리카', 'north_america': '북아메리카',
                'south_america': '남아메리카', 'oceania': '오세아니아', 'antarctica': '남극'}
BIOME_KO = {'mountain': '산', 'canyon': '협곡', 'waterfall': '폭포', 'glacier_ice': '빙하', 'volcano': '화산',
            'karst': '카르스트', 'desert_dunes': '사막', 'salt_flat': '소금 평원', 'coast_cliff_fjord': '피오르·해안',
            'reef_island': '산호초·섬', 'forest': '숲', 'lake_river': '호수·강', 'sky': '밤하늘',
            'monolith_rock': '바위산'}

# 첫 12곳: 지도 이름, 카드 한 줄(훅), 서는 곳(한국어), 지도 이름표 위치(dx, dy, anchor)
LAUNCH_COPY = {
    'grand-canyon': ('그랜드캐니언', '협곡 맨 아래 바위는 약 18억 년 전 것입니다. 강은 500만~600만 년 동안 깎았습니다.', '마더 포인트', (12, 16, 'start')),
    'moraine-lake-banff': ('모레인 호수', '빙하가 갈아 낸 돌가루가 물에 떠서 청록빛만 되돌립니다.', '록파일 전망대', (12, 5, 'start')),
    'yellowknife-aurora': ('옐로나이프', '높은 산이 없는 평원이라 하늘 전체가 오로라 무대가 됩니다.', '파일럿 기념탑', (12, -4, 'start')),
    'salar-de-uyuni': ('우유니', '높이 차가 1 m도 안 되는 소금 평원입니다. 비가 오면 하늘이 바닥에 비칩니다.', '잉카와시섬', (12, 5, 'start')),
    'jungfrau-aletsch': ('융프라우', '알프스에서 가장 긴 알레치 빙하는 1870년 이후 3.2 km 짧아졌습니다.', '스핑크스 전망대', (12, 12, 'start')),
    'geirangerfjord': ('게이랑에르', '빙하가 판 15 km 바닷길 양쪽에서 절벽과 폭포가 마주 봅니다.', '달스니바', (12, -4, 'start')),
    'mount-everest': ('에베레스트', '8,848.86 m 꼭대기 바위는 옛 바다 밑에서 쌓인 석회암입니다.', '칼라파타르', (-12, -8, 'end')),
    'ha-long-bay': ('할롱베이', '바다 위 석회암 섬 1,969개. 이름은 「내려온 용」이라는 뜻입니다.', '띠똡섬', (0, 26, 'middle')),
    'jeju-volcanic-island': ('제주', '약 200만 년 전 바다 밑 화산에서 시작한 섬입니다. 성산일출봉에서 해가 뜹니다.', '성산일출봉', (12, 5, 'start')),
    'namib-sossusvlei': ('나미브', '붉은 모래 언덕 아래, 600~700년 전에 죽은 나무가 썩지 않고 서 있습니다.', '듄 45', (-12, 5, 'end')),
    'victoria-falls': ('빅토리아 폭포', '너비 1,708 m의 물 커튼입니다. 현지 이름 모시오아툰야는 「천둥 치는 연기」입니다.', '데인저 포인트', (12, 5, 'start')),
    'great-barrier-reef': ('그레이트배리어리프', '산호초 2,900여 개가 2,300 km 넘게 이어진, 생물이 만든 가장 큰 구조물입니다.', '힐 인렛 전망대', (0, 26, 'end')),
}


def load_places():
    path = Path(os.environ.get('ARMCHAIR_PLACES', RESEARCH / '03-places.json'))
    rows = json.loads(path.read_text(encoding='utf-8'))
    launch = [r for r in rows if r['tier'] == 'launch']
    nxt = [r for r in rows if r['tier'] == 'next']
    return rows, launch, nxt


def short(s, n=70):
    s = (s or '').strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    for sep in ('다. ', '. ', ', '):
        k = cut.rfind(sep)
        if k > n * 0.5:
            return cut[:k + 1].strip()
    return cut.rstrip() + '…'


def esc(s):
    return (s or '').replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build(S, H):
    sec, head, table = H['section'], H['head'], H['table']
    rows, launch, nxt = load_places()
    out = []

    # ------------------------------------------------------------ hero
    out.append(sec('hero', 0, 'light', '우주', '400 km', f'''
<div class="hero-text">
  <h1 class="hero-title">지금 거기</h1>
  <p class="hero-en">OUT THERE, NOW · 가제</p>
  <p class="hero-lede">집에서 세계의 자연 경관을 보는 웹사이트입니다. 지구본에서 한 곳을 고르면 카메라가 그곳으로 내려가 천천히 날아다닙니다. 궁금하면 그곳의 이야기가 한 겹씩 열립니다. 해와 날씨는 그곳의 지금 그대로입니다.</p>
  <p class="hero-meta"><span>three.js</span><span>PC·폰 브라우저</span><span>한국어 먼저</span><span>서베이 + 그림 기획서 초안</span></p>
</div>
<figure class="pic pic--globe">{S.hero_globe(launch)}</figure>'''))

    # ------------------------------------------------------------ brief
    out.append(sec('brief', 0, 'light', '우주', '400 km', head(
        '요청 정리', '말씀하신 것과 제가 정한 것',
        '질문에서 고르신 두 가지는 확정으로 적었습니다. 나머지는 서베이를 보고 제가 정한 가정입니다. 가정은 고쳐 주시면 바로 바꿉니다.') + '''
<div class="two">
  <div class="given">
    <h3>말씀하신 것</h3>
    <ul class="short">
      <li>사람들이 편하게 세계의 자연 경관을 보는 사이트</li>
      <li>경관마다 역사적인 설명</li>
      <li>three.js로 만들기</li>
      <li>어떤 뷰를 보여 줄지는 서베이로 정하기</li>
      <li>컨셉은 "집에서 세계 여행"</li>
    </ul>
    <h3>질문에서 고르신 것 <small class="c-dim">확정</small></h3>
    <ul class="short">
      <li>이번 끝은 서베이와 그림 기획서 초안입니다. 구현은 확인을 받고 시작합니다.</li>
      <li>상업 이용이 되는 데이터만 씁니다. 나중에 수익을 내도 바꿀 것이 없습니다.</li>
    </ul>
  </div>
  <div class="given">
    <h3>제가 정한 것 <small class="c-dim">가정 · 근거는 아래</small></h3>
    <ul class="short">
      <li>기본은 틀어 두기입니다. 손을 대면 둘러보고, 떼면 다시 흐릅니다.</li>
      <li>하늘에서는 3D 지형으로, 땅에서는 실제 360 사진으로 보여 줍니다.</li>
      <li>설명은 네 겹입니다. 한 줄 → 카드 → 90초 듣기 → 깊이 읽기.</li>
      <li>해와 날씨는 그곳의 지금입니다. 하루를 빨리 감아 볼 수도 있습니다.</li>
      <li>첫 출시는 12곳입니다.</li>
      <li>한국어 먼저, 영어는 2단계에서.</li>
      <li>광고는 넣지 않습니다.</li>
    </ul>
  </div>
</div>'''))

    # ------------------------------------------------------------ survey 1: gap
    items = [
        dict(name='YouTube 4K 자연 채널', x=0.05, y=0.03),
        dict(name='WindowSwap', x=0.13, y=0.11),
        dict(name='NRK 슬로 TV', x=0.03, y=0.2),
        dict(name='Apple 에어리얼', x=0.2, y=0.28),
        dict(name='explore.org 라이브캠', x=0.26, y=0.44),
        dict(name='Google Earth', x=0.86, y=0.34, dx=-12),
        dict(name='MS 플라이트 시뮬레이터', x=0.96, y=0.05, dx=-12),
        dict(name='GeoGuessr', x=0.8, y=0.18, dx=-12),
        dict(name='Google Earth Voyager', x=0.6, y=0.74),
        dict(name='Arts &amp; Culture', x=0.52, y=0.6),
        dict(name='NPS 가상 방문', x=0.46, y=0.86),
        dict(name='BRINK Traveler (VR)', x=0.72, y=0.5),
        dict(name='우리', x=0.16, y=0.82, us=True),
    ]
    out.append(sec('gap', 1, 'light', '성층권', '30 km', head(
        '서베이 ① 이미 있는 것', '풍경 영상은 많고, 설명하며 흐르는 3D는 비어 있습니다',
        '비슷한 서비스 29개를 두 축에 놓았습니다. 틀어 두는 쪽은 설명이 없고, 설명이 깊은 쪽은 직접 눌러 읽어야 합니다. 왼쪽 위가 비어 있습니다.') + f'''
<figure class="pic pic--wide"><div class="pic-scroll" tabindex="0" role="region" aria-label="서비스 위치 지도">{S.positioning(items)}</div><figcaption>가로는 보는 방식, 세로는 설명의 깊이입니다. 점 위치는 서비스마다 조사한 내용으로 제가 놓았습니다.</figcaption></figure>
<ul class="short">
  <li>틀어 두는 서비스(유튜브 4K, Apple 에어리얼, WindowSwap)는 장소 이름 정도만 줍니다. Apple TV 사용자들은 "여기가 어디냐"를 찾느라 블로그 댓글로 방법을 주고받습니다.</li>
  <li>브라우저에서 실제 자연 지형을 3D로 보여 주는 서비스 가운데 널리 쓰이는 것은 Google Earth뿐입니다. 그것도 직접 모는 도구입니다.</li>
  <li>그 자리에 선 느낌과 시간대 바꾸기는 VR 헤드셋이나 게임 안에만 있습니다.</li>
  <li>한국어로 된 자연 경관 서비스는 2020~2021년 랜선여행 캠페인 뒤로 꾸준한 곳이 없습니다.</li>
  <li>큰 회사도 이 영역을 자주 접습니다. Earth View 웹(2024-01)과 FATMAP(2024-10)이 닫혔습니다. 오래가려면 유지비가 0에 가까워야 합니다.</li>
</ul>
<p class="note">빈자리는 좁습니다. 풍경 영상은 유튜브가, 3D 지구 탐색은 Google이 압도합니다. 남는 자리는 <b>자연 명소 수십 곳 × 저절로 흐르는 카메라 × 겹겹 설명 × 한국어</b>가 겹치는 곳입니다.</p>'''))

    # ------------------------------------------------------------ survey 2: how people watch
    out.append(sec('watch', 1, 'light', '비행기', '10 km', head(
        '서베이 ② 보는 사람', '사람들은 풍경을 틀어 두고 봅니다',
        '보는 사람은 세 무리입니다. 못 가는 사람(요양 시설, 몸이 불편한 사람), 가기 전인 사람, 다녀온 사람입니다. 짧게 들어와도 길게 틀어 두는 시청이 흔합니다.') + '''
<div class="stats stats--4">
  <div class="stat"><p class="stat-num">124<span class="stat-unit">만 명</span></p><p class="stat-label">베르겐 철도 7시간 중계를 본 노르웨이 사람<small>NRK 슬로 TV, 2009. 인구의 약 20%</small></p></div>
  <div class="stat"><p class="stat-num">298<span class="stat-unit">초</span></p><p class="stat-label">Apple TV 에어리얼 한 편의 길이 중앙값<small>114편 직접 측정. 풍경만 보면 384초</small></p></div>
  <div class="stat"><p class="stat-num">53<span class="stat-unit">%</span></p><p class="stat-label">첫 화면이 3초를 넘기면 떠날 수 있는 모바일 방문<small>Google, 2016, 모바일 사이트 3,700개</small></p></div>
  <div class="stat"><p class="stat-num">42~56<span class="stat-unit">%</span></p><p class="stat-label">모니터로 게임을 해도 멀미를 겪은 사람<small>대학생 40명, 최대 50분</small></p></div>
</div>
<p class="note">화면으로 보는 자연도 기분을 올리지만 효과는 작습니다. 차이를 만든 것은 <b>소리</b>와 <b>직접 움직여 보기</b>였습니다. 소리 없는 가상 숲은 회복 효과가 없었습니다. 헤드셋 실험에서는 TV, 360 영상, 직접 움직이는 3D 가운데 3D만 TV보다 기분을 더 올렸습니다. 평면 화면에서도 그런지는 1단계에서 직접 봐야 합니다. 그래서 이 사이트는 '치유'를 약속하지 않고 '잠깐 쉬어 가는 창'으로 소개합니다.</p>'''))

    # ------------------------------------------------------------ pick
    out.append(sec('pick', 2, 'dark', '새벽 구름', '5 km', head(
        '방향 고르기', '세 안을 견주고, 틀어 두는 창에 이야기를 겹쳤습니다',
        '빈자리가 A와 B 사이에 있었습니다. A를 기본 화면으로 두고 B의 설명을 겹겹이 얹었습니다. C의 지구본은 첫 화면으로만 씁니다.') + f'''
<ul class="concepts">
  <li class="concept is-pick">
    {S.concept_window()}
    <span class="pick-tag">기본 화면</span>
    <h3><span class="num">A</span>틀어 두는 창</h3>
    <dl><dt>무엇</dt><dd>화면보호기처럼 풍경이 계속 흐릅니다.</dd>
        <dt>좋은 점</dt><dd>가장 편하고, 만들기도 가장 쉽습니다.</dd>
        <dt>걸리는 점</dt><dd>혼자서는 유튜브 4K·Apple 에어리얼과 겹칩니다.</dd></dl>
  </li>
  <li class="concept is-pick">
    {S.concept_story()}
    <span class="pick-tag">겹겹이 얹음</span>
    <h3><span class="num">B</span>이야기 여행</h3>
    <dl><dt>무엇</dt><dd>정거장을 따라 카메라가 움직이고 해설이 나옵니다.</dd>
        <dt>좋은 점</dt><dd>설명이 가장 깊습니다.</dd>
        <dt>걸리는 점</dt><dd>장소마다 만드는 품이 크고, 보는 사람이 따라가야 합니다.</dd></dl>
  </li>
  <li class="concept">
    {S.concept_explore()}
    <span class="pick-tag" style="background: transparent; border: 2px solid currentColor; color: inherit;">첫 화면만</span>
    <h3><span class="num">C</span>지구본 탐험</h3>
    <dl><dt>무엇</dt><dd>지구본을 돌려 어디든 직접 날아갑니다.</dd>
        <dt>좋은 점</dt><dd>자유롭습니다.</dd>
        <dt>걸리는 점</dt><dd>Google Earth와 정면으로 겨루고, 덜 편합니다.</dd></dl>
  </li>
</ul>'''))

    # ------------------------------------------------------------ flow
    steps = [
        ('내려가기', '30초', S.step_descend(), '지구본에서 그곳으로 내려갑니다. 구름을 지날 때 이름이 뜹니다.'),
        ('크게 보기', '3분', S.step_wide(), '높이 떠서 천천히 한 바퀴 돕니다. 지금 그곳의 해와 날씨입니다.'),
        ('다가가기', '3분', S.step_close(), '이야기가 있는 곳(지층, 폭포 끝, 빙하 앞)으로 천천히 다가가며 돕니다.'),
        ('그 자리에 서기', '3분', S.step_stand(), '전망대에서 찍은 360 사진입니다. 끌면 둘러보고, 놓으면 다시 천천히 돕니다.'),
        ('하루 빨리 감기', '3분', S.step_dusk(), '그곳의 오늘 하루를 3분에 돌립니다. 해가 지면 다음 곳으로 넘어갑니다.'),
    ]
    lis = ''.join(f'''<li class="step">{pic}<div class="step-head"><span class="step-no">{i + 1}</span><h3 class="step-title">{t}</h3></div>
<p class="step-time">{tm}</p><p class="step-note">{note}</p></li>''' for i, (t, tm, pic, note) in enumerate(steps))
    lis = lis.replace('<svg viewBox', '<svg class="step-pic" viewBox')
    out.append(sec('flow', 2, 'dark', '헬기 고도', '3 km', head(
        '한 곳을 보는 흐름', '한 곳은 약 12분, 다섯 장면으로 흐릅니다',
        '아무것도 누르지 않으면 이 순서대로 흐르고, 끝나면 다음 장소로 넘어갑니다. 장면 길이는 Apple 에어리얼(한 편 약 5분)과 오디오 가이드(한 꼭지 90초) 사이에서 잡은 목표치입니다.') +
        f'<ol class="steps steps--flow">{lis}</ol>'))

    # ------------------------------------------------------------ screens
    hot_ids = {'grand-canyon', 'moraine-lake-banff'}
    home_places = [dict(r, hot=r['id'] in hot_ids) for r in launch]
    sun_rows = [dict(name_ko='그랜드캐니언', sunrise='06:41 해 뜸 · 맑음 4°C'),
                dict(name_ko='모레인 호수', sunrise='07:53 해 뜸 · 12분 뒤'),
                dict(name_ko='옐로나이프', sunrise='08:17 해 뜸 · 오로라 지는 중')]
    out.append(sec('screens', 3, 'dark', '헬기 고도', '1 km', head(
        '화면', '화면은 네 가지입니다',
        '글자와 버튼은 가만히 두면 3초 뒤 숨고, 건드리면 바로 나옵니다. 설명 글은 그림 위에 굽지 않고 HTML로 얹어서 화면 낭독기도 읽게 합니다.') + f'''
<div class="screens">
  <figure class="pic pic--screen">{S.screen_home(home_places, sun_rows)}<figcaption>첫 화면. 지금 낮과 밤이 도는 지구본입니다. 「그냥 틀어 두기」는 지금 해 뜨는 곳부터 돕니다. 「들어가기」 한 번에 소리와 전체 화면이 켜집니다.</figcaption></figure>
  <figure class="pic pic--screen">{S.screen_play()}<figcaption>틀어 둔 화면. 위에는 장소와 그곳의 지금(시각·날씨), 아래에는 한 줄 설명과 멈춤·소리·이야기·다음 버튼이 있습니다.</figcaption></figure>
  <figure class="pic pic--screen">{S.screen_card()}<figcaption>이야기 카드. 멈추거나 ⓘ를 누르면 옆에 열립니다. 카드 3장, 그때와 지금, 90초 듣기, 깊이 읽기, 그리고 맨 아래 출처와 사진 크레딧입니다.</figcaption></figure>
  <figure class="pic pic--screen">{S.screen_look()}<figcaption>그 자리에 서기. 전망대에서 찍은 360 사진을 끌어서 둘러봅니다. 손을 떼면 4초 뒤 천천히 다시 돕니다.</figcaption></figure>
</div>'''))

    # ------------------------------------------------------------ comfort rules
    rules = [
        ('3초 안에 첫 풍경', '첫 장면은 가벼운 사진으로 1초 안에, 움직임은 3초 안에. 고해상 지형은 뒤에서 채웁니다.', '3초를 넘기면 모바일 방문의 53%가 떠날 수 있다(Google 2016, 관찰 통계)'),
        ('기본은 틀어 두기', '들어오면 저절로 납니다. 끌거나 터치하면 둘러보기, 손을 떼고 4초 뒤 원래 길로 돌아갑니다.', '헤드셋 실험에서 직접 움직이는 3D만 TV보다 기분을 더 올렸다(N=96)'),
        ('한 장면 3~6분, 한 번에 5~15분', '장소 하나에 장면 4~5개. 끝나면 조용히 다음 장소로 이어집니다.', '에어리얼 중앙값 298초, 연구의 노출 시간 5·15분'),
        ('카메라는 일정하게, 수평으로, 천천히', '수평선 고정(기울기 0°), 회전은 초당 10° 이하(출발값), 땅 가까이선 걷기~달리기 빠르기.', '회전 드럼 실험에서 초당 60°까지는 빠를수록 멀미가 컸다'),
        ('출발·멈춤은 짧고 드물게', '가속과 감속은 1~2초(출발값). 장소 사이는 컷 대신 짧은 페이드. 흔들림 효과는 쓰지 않습니다.', '가속은 짧고 드물게(Meta 이동 지침)'),
        ('소리는 첫 클릭 뒤, 자연음은 작게', '「들어가기」 한 번에 소리와 전체 화면. 물·새·바람 소리를 낮게 깝니다.', '브라우저는 클릭 전 소리 재생을 막는다. 소리 없는 가상 숲은 효과가 없었다'),
        ('UI는 숨고, 건드리면 나온다', '3초 동안 입력이 없으면 글과 버튼을 숨깁니다.', 'Apple TV: 누르면 장소 이름, 밀면 다음 장소'),
        ('언제나 멈출 수 있게', '늘 닿는 멈춤 버튼과 스페이스 키. 기기에서 「동작 줄이기」를 켰으면 비행 대신 정지 장면과 느린 디졸브.', 'WCAG 2.2.2, 40세 이상 미국인 35.4% 전정 이상'),
        ('글은 읽히게, 낭독기가 읽게', '풍경 위 글은 반투명 바탕으로 대비 4.5:1 이상. 캔버스 밖 HTML로 둡니다. 해설 음성에는 자막.', 'WCAG 1.4.3, 캔버스는 보조 기술에 안 보인다'),
        ('데이터를 아낀다', '기본 화질은 중간. 데이터 절약을 켰으면 정지 장면 위주로.', '4K 영상은 시간당 약 3.7 GB'),
        ('틀어 둘 때만 화면을 깨워 둔다', '자동 재생 중에만 화면 꺼짐을 막고, 멈추면 놓습니다.', 'Screen Wake Lock, 2025-03부터 주요 브라우저 공통'),
        ('새 장소를 꾸준히 더한다', '정기적으로 장소를 더하고 「새로 들어온 곳」을 첫 화면에 둡니다.', '1905년 Hale\'s Tours는 새 필름이 모자라 시들었다'),
    ]
    rl = ''.join(f'''<li class="rule"><span class="rule-no">{i + 1}</span><div class="rule-body"><h3>{t}</h3><p>{d}</p><small>{e}</small></div></li>'''
                 for i, (t, d, e) in enumerate(rules))
    out.append(sec('rules', 3, 'dark', '전망대 위', '300 m', head(
        '편하게 보기', '편하게 보기 규칙 열두 가지',
        '연구와 브라우저 정책에서 뽑았습니다. 「출발값」이라고 쓴 숫자는 연구가 정한 값이 아니라 시작점입니다. 1단계에서 5~10명이 10분씩 보는 시험으로 고칩니다.') +
        f'<ol class="rules">{rl}</ol>'))

    # ------------------------------------------------------------ places
    conts = sorted({r['continent'] for r in launch}, key=lambda c: list(CONTINENT_KO).index(c))
    biomes = {r['biome'] for r in launch}
    cards = []
    for r in launch:
        short_name, hook, vp, _ = LAUNCH_COPY.get(r['id'], (r['name_ko'], short(r.get('geology_hook_ko'), 74), r['viewpoints'][0]['name'] if r.get('viewpoints') else '', None))
        cards.append(f'''<li class="place"><div class="place-pic">{S.postcard(r['biome'], esc(r['name_ko']))}</div>
<h3 class="place-name">{esc(r['name_ko'])}</h3>
<p class="place-meta">{esc(r['country_ko'])} · {BIOME_KO[r['biome']]}</p>
<p class="place-hook">{esc(hook)}</p>
<p class="place-view">서는 곳: {esc(vp)}</p></li>''')
    next_line = ', '.join(esc(r['name_ko']) + (' (공원과 촬영 규칙을 협의한 뒤에만)' if r['id'].startswith('uluru') else '') for r in nxt)
    out.append(sec('places', 4, 'dark', '전망대', '0 m', head(
        '어떤 뷰', f'첫 12곳은 {len(conts)}개 대륙, {len(biomes)}가지 경관입니다',
        f'세계 명소 목록(New7Wonders, 세계 7대 자연경관, UNESCO 자연유산), 방문객 수, 한국 관심도를 모아 {len(rows)}곳을 추리고 다섯 가지로 점수를 매겼습니다. 알아보는가, 화면에서 멋진가, 이야기가 있는가, 데이터가 있는가, 차분히 볼 수 있는가.') + f'''
<figure class="pic pic--plain"><div class="pic-scroll" tabindex="0" role="region" aria-label="장소 지도">{S.world_map(rows, LAUNCH_COPY)}</div><figcaption>주황 점이 첫 12곳, 흰 점이 다음 후보입니다.</figcaption></figure>
<ul class="places">{''.join(cards)}</ul>
<p class="note"><b>다음 12곳:</b> {next_line}</p>
<p class="note">데이터 점수가 3 이하인 다섯 곳(할롱베이, 제주, 빅토리아 폭포, 그레이트배리어리프, 옐로나이프)은 30 m 지형만으로는 모자랍니다. 물보라, 바다 위 봉우리, 오로라는 셰이더로 따로 만들어야 해서 2단계 품을 따로 잡았습니다.</p>'''))

    # ------------------------------------------------------------ explanation layers
    layer_rows = [
        ('한 줄', '40~60자', '늘 보임'),
        ('카드 3장', '장당 250~350자', '멈추거나 ⓘ'),
        ('90초 듣기', '약 640자', '누르면'),
        ('깊이 읽기', '1,500~2,500자 + 출처', '원하는 사람만'),
    ]
    src_rows = [
        ['사실(좌표·높이·면적·등재)', 'Wikidata', 'CC0', '<span class="ok">상업 OK</span>', '빌드 때 받아 사실 상자로'],
        ['문장', '직접 씀', '—', '<span class="ok">상업 OK</span>', '위키백과는 참고문헌을 찾는 데만'],
        ['세계유산 설명', 'UNESCO', '복제 금지', '<span class="no">링크만</span>', '"공식 등재 설명" 링크로 보냄'],
        ['사진·소리', 'NPS·USGS·NASA → NZ DOC·swisstopo → Commons', '공공 영역 → CC BY → CC BY-SA', '<span class="ok">상업 OK</span>', '파일마다 작가·라이선스 줄'],
        ['국내 장소', '국가유산청 Open API', '설명문은 표시 없음', '<span class="ok">사실만</span>', '좌표·면적·지정일만, 설명은 직접'],
    ]
    out.append(sec('layers', 5, 'dark', '카이밥 석회암', '−10 m · 2억 7천만 년', head(
        '설명', '설명은 네 겹입니다',
        '어느 겹에서 멈춰도 이야기가 끝나게 씁니다. 화면 캡션에는 화면에 안 보이는 것만 씁니다. 지층처럼, 아래로 갈수록 두껍고 오래됩니다.') + f'''
<figure class="pic pic--wide"><div class="pic-scroll" tabindex="0" role="region" aria-label="설명 네 겹">{S.strata(layer_rows)}</div></figure>
<ul class="short">
  <li><b>훅 먼저.</b> 첫 문장은 이곳이 왜 놀라운지 말합니다. 위치와 면적은 사실 상자로 뺍니다.</li>
  <li><b>시간은 익숙한 단위로 접습니다.</b> 지구 46억 년을 하루로 접으면 1초가 약 5만 3천 년입니다.</li>
  <li><b>크기는 아는 것으로 견줍니다.</b> 그랜드캐니언에서 가장 깊은 곳(1,829 m)은 성산일출봉(182 m)을 열 개 쌓은 높이입니다.</li>
  <li><b>그때와 지금.</b> 같은 자리에서 본 1984년 위성 사진과 지금, 옛 사진과 지금을 밀어서 견줍니다.</li>
  <li><b>현지 전설.</b> 「전해지는 이야기」로 표시하고 어느 공동체의 이야기인지 밝힙니다.</li>
</ul>
{table(['무엇', '어디서', '라이선스', '상업', '쓰는 법'], src_rows, '설명 출처와 라이선스')}'''))

    # ------------------------------------------------------------ views / tech
    labels = [
        (300, 120, 330, 40, '지형: Copernicus 30 m · Mapterhorn', 'start'),
        (180, 190, 40, 250, '위성 사진: Sentinel-2 2016판(10 m), 미국은 NAIP 60 cm', 'start'),
        (560, 60, 690, 26, '하늘·해: three.js Sky + suncalc', 'end'),
        (90, 40, 40, 30, '날씨: MET Norway', 'start'),
        (560, 236, 690, 300, '360 사진: Wikimedia Commons', 'end'),
        (420, 300, 690, 380, '소리: Pixabay · Freesound(CC0·BY)', 'end'),
    ]
    view_rows = [
        ['3D 지형 + 위성 사진', '좋음(지면 3 km 위)', '나쁨', '1~2주', '<b>1단계 하늘</b>'],
        ['360 사진', '—', '가장 진짜 같음', '2일~1주', '<b>1단계 땅</b>'],
        ['지구본(실시간 낮밤)', '전체 보기', '—', '3~5일', '<b>1단계 첫 화면</b>'],
        ['하늘·해·날씨', '장면을 크게 살림', '제한적', '2~3일', '<b>1단계 간단판</b>'],
        ['Google 실사 3D', '가장 좋음(명소)', '나무·바위가 뭉개짐', '2~4일 + 튜닝 1주', '2단계 「실사 모드」 시험'],
        ['2.5D 시차', '—', '좋음, 크게 움직이면 찢어짐', '1~2주', '2단계'],
        ['드론·360 영상', '가장 좋음', '물·구름이 움직임', '3~5일 + 영상 구하기', '몇 곳만'],
        ['가우시안 스플랫', '찍은 범위만', '찍은 범위만 최상', '1주 + 장소당 수일', '실험'],
        ['양식화 지형(등고선·음영)', '일관됨', '일관됨', '1~3주', '저사양·대체 뷰'],
    ]
    out.append(sec('views', 6, 'light', '레드월 석회암', '−500 m · 약 3억 4천만 년', head(
        '그리는 법', '하늘에서는 3D 지형, 땅에서는 360 사진으로 보여 줍니다',
        '열 가지 방식을 견줬습니다. 사진측량 3D는 도시와 일부 명소에만 있고, 자연 경관은 대부분 위성 사진을 입힌 지형이었습니다. 그래서 하늘은 공개 지형 데이터로 직접 그리고, 땅은 실제 360 사진으로 보여 줍니다.') + f'''
<figure class="pic pic--wide"><div class="pic-scroll" tabindex="0" role="region" aria-label="한 장면을 그리는 재료">{S.stack(labels)}</div><figcaption>한 장면을 무엇으로 그리는지 이름표를 붙였습니다. 모두 상업 이용이 됩니다.</figcaption></figure>
{table(['방식', '하늘에서', '땅에서', '1인 품', '어디에'], view_rows, '보여 주는 방식 비교', pick=[0, 1, 2, 3])}
<p class="note">위성 사진 10 m는 지면 약 6 km 밖에서 선명합니다. 그래서 카메라를 지면 약 3 km 위에서 비스듬히 내려다보게 묶습니다. 더 가까이 가야 하는 곳은 그 나라의 공공 데이터를 씁니다. 1단계 그랜드캐니언은 미국 공공 영역의 1 m 지형(USGS 3DEP)과 60 cm 항공 사진(NAIP)이 있어 가까이 가도 선명합니다. 스위스(swisstopo)도 출처만 밝히면 상업 이용이 됩니다. Google 실사 3D는 화질이 가장 좋지만 Google 지도가 아닌 지도와 한 화면에 둘 수 없고 저장도 안 됩니다. 그래서 별도 「실사 모드」로 2단계에서 시험합니다.</p>'''))

    # ------------------------------------------------------------ cost
    cost_rows = [
        ('직접 올린 공개 데이터', 7, True),
        ('Esri 영상 (세션 과금 적용 시)', 396, False),
        ('Google 실사 3D', 594, False),
        ('MapTiler', 4455, False),
        ('Mapbox', 4600, False),
        ('Google 위성 타일', 6060, False),
        ('Google Street View', 12280, False),
    ]
    nc_rows = [
        ['Sentinel-2 cloudless 2018~2025판', 'CC BY-NC-SA', '2016판(CC BY)을 씀'],
        ['MapTiler Free · Cesium ion 무료판', '비상업', '직접 올린 지형'],
        ['Open-Meteo 무료판', '비상업', 'MET Norway(CC BY 4.0)'],
        ['BBC 효과음 · xeno-canto 대부분', '개인·비상업', 'NPS 소리(공공 영역), Freesound CC0·BY'],
        ['Depth Anything 큰 모델', 'CC BY-NC', 'Small·Base(Apache 2.0)'],
        ['NAVER CLOVA Voice', '파일 저장 금지', 'Google·Azure TTS로 미리 만든 MP3'],
    ]
    out.append(sec('cost', 6, 'light', '레드월 석회암', '−500 m · 약 3억 4천만 년', head(
        '비용', '월 10만 방문이어도 데이터 값은 $10 안팎입니다',
        '타일마다 돈을 받는 지도 API는 방문이 늘면 그대로 비싸집니다. 공개 데이터를 Cloudflare R2에 직접 올려 두면 전송료가 없어 거의 늘지 않습니다. 가정: 방문 한 번 6분, 장소 3곳.') + f'''
<figure class="chart"><div class="chart-scroll" tabindex="0" role="region" aria-label="월 10만 방문 데이터 비용">{S.cost_bars(cost_rows).replace('<svg ', '<svg class="wide" ', 1)}</div>
<figcaption>월 10만 방문 기준 월 비용(USD, 2026-10-13 가격표). 도메인·서버비는 뺐습니다. 노란 막대가 1단계에서 쓰는 방식입니다. Esri 세션 과금이 위성 영상 타일에도 적용되는지는 확인하지 못했습니다. 적용되지 않으면 타일 과금으로 월 약 $2,700입니다.</figcaption></figure>
<h3 class="given" style="font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h3);">상업 이용이 안 돼서 뺀 것</h3>
{table(['빼는 것', '조건', '대신 쓰는 것'], nc_rows, '비상업 전용이라 뺀 데이터')}'''))

    # ------------------------------------------------------------ making
    making = '출처 모으기=52|AI 초안=64|다듬기=102|사실 확인=142|사진·라이선스=167|영어판=192|음성=207'
    out.append(sec('making', 7, 'light', '타피츠 사암', '−1.1 km · 약 5억 년', head(
        '만드는 품', '한 곳에 3~4.5시간, 12곳이면 약 50시간입니다',
        'AI로 초안을 쓰되, 미리 모은 출처 안에서만 쓰고 문장마다 출처와 맞춰 봅니다. 인용을 붙인 생성형 검색도 문장의 절반 정도만 출처가 받쳐 줬기 때문입니다.') + f'''
<figure class="chart"><div class="chart-scroll" tabindex="0" role="region" aria-label="장소 하나를 만드는 데 드는 시간">
<svg class="cumchart" role="img" aria-label="장소 하나 만드는 단계별 누적 시간" data-rows="{making}" data-unit="분"></svg></div>
<figcaption>장소 하나에 드는 시간(분, 단계별 중간값을 쌓은 목표치). 가장 큰 변수는 사실 확인과 한국어 자료 부족입니다. 자연유산 문서 가운데 한국어 위키백과에 있는 것은 절반이고, 길이는 영어의 약 7분의 1입니다.</figcaption></figure>
<ul class="short">
  <li>현지·원주민 이름을 먼저 쓰고 공식 이름을 함께 적습니다. 이름 분쟁은 날짜와 주체를 밝힙니다.</li>
  <li>「발견했다」 대신 「유럽인으로는 처음 기록했다」라고 씁니다.</li>
  <li>성지 촬영 규칙은 카메라 제한으로 지킵니다. 울룰루는 첫 목록에서 뺐습니다(가상·360 촬영을 원칙적으로 막음).</li>
  <li>기후 이야기는 측정값과 그때·지금 사진으로 보여 주고, 당부는 한 문장을 넘기지 않습니다.</li>
  <li>해설 음성은 빌드 때 MP3로 미리 만들고, 화면에 「AI 합성 음성」이라고 표시합니다.</li>
</ul>'''))

    # ------------------------------------------------------------ compete
    comp_rows = [
        ['Google Earth (Voyager)', '지구본에서 내려가기, 이야기 정거장', '저절로 흐릅니다. Google 화면은 상업 사용이 금지라 쓰지 않습니다'],
        ['Apple 에어리얼 · 유튜브 4K', '5분 안팎의 긴 장면, 이름은 물을 때만', '여기가 어디고 왜 이렇게 생겼는지 설명합니다'],
        ['WindowSwap', '남의 창밖을 보는 편안함', '실제 자연 명소, 그곳의 지금 해와 날씨'],
        ['BRINK Traveler (VR, 3D 장소 58곳, 울산바위·한국어 음성 포함)', '명소마다 실제 사진을 나란히, 하늘과 별자리 변화', '헤드셋 없이 브라우저에서, 그곳의 지금 해와 날씨, 겹겹 설명'],
        ['explore.org (Fat Bear Week)', '지금 일어나는 일이 다시 오게 한다(2026년 약 250만 표)', '오로라·단풍·해돋이 같은 「지금」을 2단계에서'],
        ['Radio Garden', '점을 누르면 그곳으로', '소리 대신 풍경'],
    ]
    out.append(sec('compete', 7, 'light', '타피츠 사암', '−1.1 km · 약 5억 년', head(
        '비슷한 것', '가져올 것과 다르게 갈 것',
        '정면으로 겨루지 않고, 각자 잘하는 것 하나씩만 빌립니다.') +
        table(['서비스', '가져올 것', '다르게 갈 것'], comp_rows, '비슷한 서비스에서 가져올 것과 다른 것')))

    # ------------------------------------------------------------ steps
    build_steps = [
        ('한 곳', '그랜드캐니언 하나. 지구본 → 내려가기 → 다섯 장면 12분, 손대면 둘러보기, 설명 네 겹, 소리.',
         '5~10명이 10분씩 보고 멀미·편안함·지루함을 답합니다. 같은 장면을 Sentinel-2 10 m·NAIP 60 cm·Google 실사로 찍어 견줍니다.', '2~3주(목표치)'),
        ('12곳', '첫 12곳, 하루 빨리 감기, 그곳의 지금 날씨, 크레딧 페이지, 영어판.',
         '12곳을 처음부터 끝까지 틀어 두고 막힘·오류가 없습니다.', '6~8주(목표치)'),
        ('공개', '도메인, 「새로 들어온 곳」, 후원 버튼, 오로라·단풍 같은 「지금」 알림.',
         '공개 주소. 이후 장소를 정기적으로 더합니다.', '2주(목표치)'),
    ]
    bl = ''.join(f'''<li class="step"><span class="step-no">{i + 1}</span><h3 class="step-title">{t}</h3>
<dl class="step-facts"><dt>범위</dt><dd>{sc}</dd><dt>끝</dt><dd>{done}</dd><dt>기간</dt><dd class="step-time">{dur}</dd></dl></li>'''
                 for i, (t, sc, done, dur) in enumerate(build_steps))
    out.append(sec('steps', 8, 'light', '가장 오래된 바위', '−1.6 km · 약 18억 년', head(
        '만드는 순서', '세 단계로 만들고, 1단계에서 멈춰 묻습니다',
        '1단계가 끝나면 직접 보시고, 계속할지와 2단계 범위를 정합니다. 기간은 목표치입니다. 1단계 시제품: <a href="https://claude.ai/artifact/DyiDov5tYmNKwMCcURHpqs">지금 거기 시제품</a>') +
        f'<ol class="steps steps--build" style="--n: 3">{bl}</ol>' + '''
<h3 style="font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h3);">1단계를 시작하기 전에 확인할 것</h3>
<ul class="short">
  <li>Sentinel-2 2016판(CC BY)을 장소별로 잘라 올리는 것이 EOX 조건에 맞는지. 안 되면 Copernicus 원본(상업 이용 가능)으로 장소 12곳의 구름 없는 사진을 직접 만듭니다.</li>
  <li>Google 실사 3D를 지구본과 다른 화면으로 떼어 두면 「Google 지도가 아닌 지도와 함께 쓰지 않는다」 조항에 맞는지. 맞지 않으면 실사 모드는 뺍니다.</li>
  <li>제주의 국내 지형·항공 사진을 상업적으로 써도 되는지. 국내 고해상도 원천은 공개 목록에 없었습니다.</li>
</ul>'''))

    # ------------------------------------------------------------ open
    out.append(sec('open', 8, 'light', '가장 오래된 바위', '−1.6 km · 약 18억 년', head(
        '정해야 할 것', '정해 주시면 좋은 것') + '''
<ul class="short">
  <li><b>이름.</b> 가제는 「지금 거기」입니다. 다른 후보는 「창밖은 지구」, 「느린 비행」입니다.</li>
  <li><b>첫 장소.</b> 그랜드캐니언을 추천합니다. 미국 공공 영역의 1 m 지형·사진·소리가 있고, 지층 이야기가 분명합니다. 제주 성산일출봉으로 시작할 수도 있지만, 국내 지형·영상 데이터의 라이선스부터 확인해야 합니다.</li>
  <li><b>설명 글의 라이선스.</b> 위키백과처럼 CC BY-SA로 열면 위키백과 글을 번역해 쓸 수 있어 빨라집니다. 직접 써서 닫아 두면 나중에 책이나 앱으로 내기 쉽습니다.</li>
  <li><b>AI 합성 음성.</b> 해설 음성에 써도 되는지 정해 주세요. 쓰면 화면에 표시합니다.</li>
  <li><b>수익.</b> 후원, 소액 구독, 교육·관광청 의뢰 가운데 무엇을 볼지는 3단계 전에 정하면 됩니다.</li>
</ul>'''))

    # ------------------------------------------------------------ footer
    out.append(sec('foot', 8, 'light', '가장 오래된 바위', '−1.6 km · 약 18억 년', '''
<dl class="foot-list">
  <dt>서베이</dt><dd>armchair/docs/research/01~05 (.md 노트, .json 표). 갈래마다 1차 출처로 반박 검증한 결과가 노트 끝 「검증」 절에 있습니다.</dd>
  <dt>원본</dt><dd>armchair/docs/build_plan.py → plan.html (content.py 글, scenes.py 그림, sprites.py 도트)</dd>
  <dt>지도</dt><dd>Natural Earth 110m 육지(공공 영역)를 2도 격자로 찍었습니다.</dd>
  <dt>숫자</dt><dd>조사 숫자는 2026-10-13 기준입니다. 「목표치」와 「출발값」은 1단계에서 재고 고칩니다.</dd>
  <dt>시제품</dt><dd>https://claude.ai/artifact/DyiDov5tYmNKwMCcURHpqs (armchair/site, 보고서는 armchair/docs/proto)</dd>
</dl>''', cls='band foot'))

    return ''.join(out)
