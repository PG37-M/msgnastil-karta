/*!
 * MSG НАСТИЛ — интерактивная карта реализованных объектов.
 * Глобус на MapLibre GL (3D) + запасной 2D-режим на Leaflet (без WebGL).
 * Подключение: <div class="msgmap" data-msgmap data-src="/путь/objects.json"></div>
 * Тяжёлые библиотеки и данные грузятся лениво — когда блок приближается к экрану.
 */
(function () {
  'use strict';

  var SCRIPT = document.currentScript;
  var BASE = SCRIPT && SCRIPT.src ? SCRIPT.src.replace(/[^\/]*$/, '') : '';

  var DEFAULTS = {
    src: BASE + '../data/objects.json',          // список объектов (JSON; в Bitrix — AJAX-эндпоинт)
    countries: BASE + '../data/countries.json',  // границы стран (GeoJSON)
    vendor: BASE + '../vendor/',                 // maplibre-gl / leaflet
    relief: true,                                // синяя подложка с рельефом (data-relief="0" — отключить)
    reliefTiles: BASE + '../data/relief/{z}/{x}/{y}.webp',
    pitch: 26,                                   // наклон камеры (даёт объём выделенным странам); 0 — вид сверху
    projection: 'mercator',                    // 'globe' — вернуть глобус (data-projection="globe")
    homeBounds: [[18, 41], [180, 78]],           // исходный вид: вся Россия
    homeBoundsMobile: [[20, 43], [100, 67]],     // на телефоне — европейская часть и Урал/Сибирь (дальше — свайпом)
    home: { center: [88, 70], zoom: 2.1, mobileCenter: [68, 60], mobileZoom: 1.05 },   // вид глобуса со стороны полюса
    focusZoom: 4.6,
    mobileBreakpoint: 640
  };

  /* ---------- утилиты ---------- */
  var loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise(function (ok, fail) {
      var s = document.createElement('script');
      s.src = src; s.async = true; s.onload = ok;
      s.onerror = function () { fail(new Error('script ' + src)); };
      document.head.appendChild(s);
    }));
  }
  function loadCss(href) {
    return loaded[href] || (loaded[href] = new Promise(function (ok, fail) {
      var l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href; l.onload = ok;
      l.onerror = function () { fail(new Error('css ' + href)); };
      document.head.appendChild(l);
    }));
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function absTpl(t) {
    var i = t.indexOf('{'), a = document.createElement('a');
    a.href = i < 0 ? t : t.slice(0, i);
    return a.href + (i < 0 ? '' : t.slice(i));
  }
  function safeUrl(u) { return u && /^(https?:\/\/|\/|#)/i.test(u) ? u : ''; }
  function plural(n, f) {
    var a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return f[2];
    if (b > 1 && b < 5) return f[1];
    if (b === 1) return f[0];
    return f[2];
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch (e) { return false; }
  }
  var reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var ICON = {
    close: '<svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12"/></svg>',
    prev: '<svg viewBox="0 0 14 14"><path d="M9 2L4 7l5 5"/></svg>',
    next: '<svg viewBox="0 0 14 14"><path d="M5 2l5 5-5 5"/></svg>',
    home: '<svg viewBox="0 0 20 20"><path d="M3 9.5L10 3l7 6.5M5 8.5V16h3.5v-4h3v4H15V8.5"/></svg>',
    globe: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15M10 2.5c-3 3-3 12 0 15M10 2.5c3 3 3 12 0 15"/></svg>',
    tilt: '<svg viewBox="0 0 20 20"><path d="M2.5 14.5L6 6.5h8l3.500 8zM6.800 10.500h6.400"/></svg>',
    sun: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.700 4.700l1.400 1.400M13.900 13.900l1.400 1.400M15.300 4.700l-1.400 1.400M6.100 13.900l-1.400 1.400"/></svg>',
    moon: '<svg viewBox="0 0 20 20"><path d="M16.500 11.800A6.800 6.800 0 0 1 8.200 3.500a6.800 6.800 0 1 0 8.300 8.300z"/></svg>',
    flat: '<svg viewBox="0 0 20 20"><rect x="2.5" y="4.5" width="15" height="11" rx="2"/><path d="M2.5 10h15M7.5 4.5v11M12.5 4.5v11"/></svg>'
  };

  /* ---------- SVG фирменных меток ---------- */
  var BLUE = '#184597';      // синий логотипа МСГ НАСТИЛ
  var curTheme = 'dark';
  var ACCENT = '#d6544f';    // цвет выбранного объекта
  // Решётка из логотипа: 4×4 ячейки, повёрнута на 21°.
  function gridGlyph(cx, cy, size, color) {
    var t = size * 0.1, pitch = (size - t) / 4, r = '', i, o = -size / 2;
    for (i = 0; i < 5; i++) {
      r += '<rect x="' + (o + i * pitch).toFixed(2) + '" y="' + o + '" width="' + t.toFixed(2) + '" height="' + size + '"/>' +
           '<rect x="' + o + '" y="' + (o + i * pitch).toFixed(2) + '" width="' + size + '" height="' + t.toFixed(2) + '"/>';
    }
    return '<g transform="translate(' + cx + ' ' + cy + ') rotate(21)" fill="' + color + '">' + r + '</g>';
  }
  // Метка в стиле «круг с хвостиком + мягкая тень сбоку» (как на карте-референсе), решётка из логотипа внутри.
  function pinSVG(count, variant, k) {
    k = k || 1;
    var act = variant === 'act', id = act ? 'ga' : 'gd', col = act ? ACCENT : BLUE, dark = act ? '#a63733' : '#0f2f6b';
    var badge = count > 1
      ? '<circle cx="38" cy="8" r="8.6" fill="#fff" stroke="' + col + '" stroke-width="2"/>' +
        '<text x="38" y="' + (count > 9 ? 11.4 : 11.8) + '" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="' + (count > 9 ? 9.5 : 11.5) + '" font-weight="700" fill="' + (act ? '#8f2b28' : BLUE) + '">' + count + '</text>'
      : '';
    // как на референсе: кольцо-голова, белый круг внутри, хвост с прямой правой кромкой, тень справа
    var body = 'M24 39L21 58L39 31A18 18 0 1 0 24 39z';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + 36 * k + '" height="' + 45 * k + '" viewBox="0 0 48 60">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + (act ? '#e8837c' : '#2b64c4') + '"/><stop offset="1" stop-color="' + dark + '"/></linearGradient>' +
      '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#04132f" stop-opacity=".45"/><stop offset="1" stop-color="#04132f" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="M33 36L47 47L22 58.500z" fill="url(#' + id + 's)"/>' +
      '<path d="' + body + '" fill="url(#' + id + ')" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>' +
      '<circle cx="24" cy="21" r="11.800" fill="#fff"/>' +
      gridGlyph(24, 21, 14.500, col) + badge + '</svg>';
  }
  // Кластер: белое кольцо с тонкой обводкой, внутри тёмный круг с числом.
  function clusterSVG(n, k) {
    k = k || 1;
    var inner = n < 10 ? 15 : n < 30 ? 17 : 19, fs = n > 99 ? 14 : n > 9 ? 17 : 19;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + 46 * k + '" height="' + 46 * k + '" viewBox="0 0 60 60">' +
      '<circle cx="30" cy="31.500" r="27.500" fill="#04132f" fill-opacity=".14"/>' +
      (curTheme === 'light'
        ? '<circle cx="30" cy="30" r="27.500" fill="#fff" fill-opacity=".7" stroke="' + BLUE + '" stroke-opacity=".45" stroke-width="2.4"/>'
        : '<circle cx="30" cy="30" r="27.500" fill="#fff" fill-opacity=".5" stroke="#fff" stroke-opacity=".75" stroke-width="2.4"/>') +
      '<circle cx="30" cy="30" r="' + inner + '" fill="' + BLUE + '"/>' +
      '<text x="30" y="' + (30 + fs * .36) + '" text-anchor="middle" font-family="system-ui,Arial,sans-serif" font-size="' + fs + '" font-weight="700" fill="#fff">' + n + '</text></svg>';
  }
  function svgToImage(svg) {
    return new Promise(function (ok, fail) {
      var img = new Image();
      img.onload = function () { ok(img); };
      img.onerror = fail;
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  function placeholderSVG() {
    return '<svg viewBox="0 0 340 150" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b4f9c"/><stop offset="1" stop-color="#091d4a"/></linearGradient>' +
      '<pattern id="pp" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M0 0h22M0 0v22" stroke="#8cc4ff" stroke-opacity=".18" stroke-width="1.2" fill="none"/></pattern></defs>' +
      '<rect width="340" height="150" fill="url(#pg)"/><rect width="340" height="150" fill="url(#pp)"/>' +
      '<rect x="145" y="45" width="50" height="50" rx="7" fill="none" stroke="#bfe6ff" stroke-opacity=".7" stroke-width="2"/>' +
      '<path d="M161.700 45v50M178.300 45v50M145 61.700h50M145 78.300h50" stroke="#bfe6ff" stroke-opacity=".5" stroke-width="1.5"/></svg>';
  }

  /* ---------- страны с объектами ---------- */
  // Название страны в данных (рус.) -> название в наборе границ (Natural Earth, англ.).
  // Для остальных стран можно задать в объекте поле "country_en".
  var COUNTRY_EN = {
    'Россия': 'Russia', 'Беларусь': 'Belarus', 'Белоруссия': 'Belarus', 'Казахстан': 'Kazakhstan', 'Египет': 'Egypt',
    'Узбекистан': 'Uzbekistan', 'Киргизия': 'Kyrgyzstan', 'Кыргызстан': 'Kyrgyzstan', 'Таджикистан': 'Tajikistan',
    'Туркменистан': 'Turkmenistan', 'Азербайджан': 'Azerbaijan', 'Армения': 'Armenia', 'Грузия': 'Georgia', 'Молдова': 'Moldova',
    'Турция': 'Turkey', 'Китай': 'China', 'Монголия': 'Mongolia', 'Индия': 'India', 'Иран': 'Iran', 'Ирак': 'Iraq',
    'ОАЭ': 'United Arab Emirates', 'Саудовская Аравия': 'Saudi Arabia', 'Алжир': 'Algeria', 'Вьетнам': 'Vietnam',
    'Сербия': 'Serbia', 'Венгрия': 'Hungary', 'Болгария': 'Bulgaria', 'Польша': 'Poland', 'Германия': 'Germany',
    'Финляндия': 'Finland', 'Куба': 'Cuba', 'Бангладеш': 'Bangladesh', 'Индонезия': 'Indonesia', 'Нигерия': 'Nigeria',
    'Ангола': 'Angola', 'Мьянма': 'Myanmar', 'Афганистан': 'Afghanistan', 'Пакистан': 'Pakistan', 'Куба ': 'Cuba'
  };
  function activeCountries(cities) {
    var set = {};
    cities.forEach(function (c) {
      c.items.forEach(function (o) {
        var n = o.country_en || COUNTRY_EN[o.country] || o.country;
        if (n) set[n] = 1;
      });
    });
    return Object.keys(set);
  }

  /* ---------- данные ---------- */
  function groupCities(list) {
    var map = {}, cities = [];
    list.forEach(function (o) {
      var lat = Number(o.lat), lon = Number(o.lon);
      if (o.active === false || !isFinite(lat) || !isFinite(lon)) return;
      var key = (o.city || '') + '|' + (o.country || '');
      var c = map[key];
      if (!c) {
        c = map[key] = { id: cities.length, city: o.city || o.country || '', region: o.region || '', country: o.country || '', lat: lat, lon: lon, items: [] };
        cities.push(c);
      }
      c.items.push(o);
    });
    cities.forEach(function (c) {
      c.items.sort(function (a, b) {
        return (a.sort || 100) - (b.sort || 100) || String(b.period).localeCompare(String(a.period));
      });
    });
    return cities;
  }

  /* ---------- карточка (общая для 3D и 2D) ---------- */
  function Card(app) {
    this.app = app;
    var el = this.el = document.createElement('div');
    el.className = 'mm-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Карточка объекта');
    el.innerHTML = '<span class="mm-card__tail"></span><div class="mm-card__inner"></div>';
    this.inner = el.querySelector('.mm-card__inner');
    app.stage.appendChild(el);
    this.city = null; this.index = 0;
    var self = this;
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) {
        var tx = e.target.closest('.mm-card__txt');
        if (tx) { tx.classList.toggle('is-open'); app.reposition(); }
        return;
      }
      var a = t.getAttribute('data-act');
      if (a === 'close') app.close();
      else if (a === 'prev') self.go(self.index - 1);
      else if (a === 'next') self.go(self.index + 1);
      else if (a === 'go') self.go(+t.getAttribute('data-i'));
    });
    // клик по карте/вне карточки не должен проваливаться на карту
    ['mousedown', 'dblclick', 'wheel', 'touchstart'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true });
    });
  }
  Card.prototype.show = function (city, index) {
    this.city = city; this.index = index || 0;
    this.render();
    this.el.classList.add('is-open');
  };
  Card.prototype.hide = function () {
    this.el.classList.remove('is-open');
    this.city = null;
  };
  Card.prototype.go = function (i) {
    var n = this.city.items.length;
    this.index = (i + n) % n;
    this.render();
    this.app.reposition();
  };
  Card.prototype.render = function () {
    var c = this.city, o = c.items[this.index], n = c.items.length;
    var loc = [c.region, c.country].filter(Boolean).join(', ');
    var url = safeUrl(o.url);
    var media = o.photo
      ? '<img src="' + esc(o.photo) + '" alt="' + esc(o.title) + '" loading="lazy">'
      : placeholderSVG();
    this.el.classList.toggle('mm-card--nophoto', !o.photo);
    var chips = '';
    if (o.product) chips += '<span class="mm-chip">' + esc(o.product) + '</span>';
    if (o.period) chips += '<span class="mm-chip">' + esc(o.period) + '</span>';
    var nav = '';
    if (n > 1) {
      var dots = '';
      if (n <= 12) for (var i = 0; i < n; i++) dots += '<button type="button" class="mm-dot' + (i === this.index ? ' is-on' : '') + '" data-act="go" data-i="' + i + '" aria-label="Объект ' + (i + 1) + '">' + (i + 1) + '</button>';
      nav = '<div class="mm-card__nav">' +
        '<button type="button" class="mm-nav-btn" data-act="prev" aria-label="Предыдущий объект">' + ICON.prev + '</button>' +
        '<span class="mm-nav-pos">' + (this.index + 1) + ' / ' + n + '</span>' +
        '<button type="button" class="mm-nav-btn" data-act="next" aria-label="Следующий объект">' + ICON.next + '</button>' +
        (dots ? '<div class="mm-nav-dots">' + dots + '</div>' : '') + '</div>';
    }
    this.inner.innerHTML =
      '<div class="mm-card__media">' + media + '<button type="button" class="mm-card__close" data-act="close" aria-label="Закрыть">' + ICON.close + '</button></div>' +
      '<div class="mm-card__body">' +
      '<div class="mm-card__head"><span>' + esc(c.city) + '</span>' + (n > 1 ? '<span>— ' + n + ' ' + plural(n, ['проект', 'проекта', 'проектов']) + '</span>' : '') + '</div>' +
      '<h3 class="mm-card__title">' + esc(o.title) + '</h3>' +
      '<div class="mm-card__loc">' + esc(loc) + '</div>' +
      (chips ? '<div class="mm-card__chips">' + chips + '</div>' : '') +
      (o.description ? '<div class="mm-card__txt"><b>Задача</b><p>' + esc(o.description) + '</p></div>' : '') +
      (o.solution ? '<div class="mm-card__txt"><b>Решение</b><p>' + esc(o.solution) + '</p></div>' : '') +
      (url ? '<a class="mm-card__more" href="' + esc(url) + '">Подробнее <span aria-hidden="true">→</span></a>' : '') +
      nav + '</div>';
    var img = this.inner.querySelector('.mm-card__media img');
    if (img) img.addEventListener('error', function () {
      img.outerHTML = placeholderSVG();
    });
  };
  // Позиционирование рядом с меткой: справа или слева, всегда внутри сцены.
  Card.prototype.place = function (pt) {
    var st = this.app.stage, W = st.clientWidth, H = st.clientHeight;
    var cw = this.el.offsetWidth, ch = this.el.offsetHeight;
    var gap = 28, pinMid = pt.y - 20, safeRight = 64;
    var side = pt.x + gap + cw + safeRight <= W ? 'right' : (pt.x - gap - cw >= 12 ? 'left' : (pt.x < W / 2 ? 'right' : 'left'));
    var left = side === 'right' ? pt.x + gap : pt.x - gap - cw;
    left = clamp(left, 12, Math.max(12, W - cw - 12));
    var top = clamp(pinMid - ch / 2, 12, Math.max(12, H - ch - 12));
    this.el.classList.toggle('mm-card--right', side === 'right');
    this.el.classList.toggle('mm-card--left', side === 'left');
    this.el.style.left = Math.round(left) + 'px';
    this.el.style.top = Math.round(top) + 'px';
    this.el.style.setProperty('--mm-ox', side === 'right' ? '0' : '100%');
    var tailY = clamp(pinMid - top - 7, 16, ch - 30);
    this.el.querySelector('.mm-card__tail').style.top = tailY + 'px';
    this.el.style.setProperty('--mm-oy', tailY + 'px');
  };

  /* ---------- 3D-глобус (MapLibre GL) ---------- */
  function GlobeEngine(app) { this.app = app; this.globe = app.opts.projection === 'globe'; this.animate = true; this.tilt = !this.globe && app.opts.pitch > 0 && !!app.opts.startTilted; }

  GlobeEngine.prototype.init = function () {
    var self = this, app = this.app, o = app.opts;
    return Promise.all([
      loadCss(o.vendor + 'maplibre-gl.css'),
      loadScript(o.vendor + 'maplibre-gl.js'),
      fetch(o.countries).then(function (r) { if (!r.ok) throw new Error('countries'); return r.json(); })
    ]).then(function (res) {
      var countries = res[2];
      return self.build(countries);
    });
  };

  GlobeEngine.prototype.build = function (countries) {
    var self = this, app = this.app, o = app.opts, col = app.colors;
    var coarse = matchMedia('(pointer:coarse)').matches;

    // географическая сетка
    var grat = { type: 'FeatureCollection', features: [] }, lo, la, pts;
    var G = this.globe;
    for (lo = -180; lo < 180; lo += (G ? 20 : 15)) {
      pts = []; for (la = (G ? 10 : -85); la <= (G ? 89 : 85); la += 3) pts.push([lo, la]);
      if (G) pts.push([lo, 89.9]);
      grat.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
    }
    for (la = (G ? 20 : -75); la <= (G ? 80 : 75); la += (G ? 10 : 15)) {
      pts = []; for (lo = -180; lo <= 180; lo += 4) pts.push([lo, la]);
      grat.features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } });
    }
    // лёгкая вариация оттенка суши по странам — даёт «объём»
    countries.features.forEach(function (f) {
      var h = 0, n = f.properties.name || '';
      for (var i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) % 5;
      f.properties.shade = h;
    });

    var sources = {
      countries: { type: 'geojson', data: countries },
      graticule: { type: 'geojson', data: grat }
    };
    var layers = [
      { id: 'ocean', type: 'background', paint: { 'background-color': col.ocean } },
      { id: 'land', type: 'fill', source: 'countries', paint: {
        'fill-color': ['match', ['get', 'name'], 'Russia', col.landHi,
          ['match', ['get', 'shade'], 0, col.land, 1, '#3479cf', 2, '#2a6cc0', 3, '#3a82d6', '#2f74c9']],
        'fill-antialias': true } }
    ];
    if (o.relief) {
      sources.relief = { type: 'raster', tiles: [o.reliefTiles], tileSize: 512, minzoom: 0, maxzoom: 4 };
      layers.push({ id: 'relief', type: 'raster', source: 'relief',
        paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' } });
    }
    var act = activeCountries(app.cities);
    var inAct = ['in', ['get', 'name'], ['literal', act]];
    var hz = ['interpolate', ['linear'], ['zoom'], 1, 300000, 2, 150000, 3, 75000, 4, 37000, 5, 18500, 6, 9300, 7, 4600, 9, 1150, 11, 290];
    layers.push(
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': col.grid, 'line-width': this.globe ? 0.9 : 0.6, 'line-opacity': this.globe ? 0.42 : 0.2 } },
      { id: 'borders', type: 'line', source: 'countries', paint: {
        'line-color': col.border, 'line-opacity': o.relief ? 0.7 : 0.85,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 5, 1, 9, 1.8] } },
      // страны с объектами: тень-«подъём», подсветка, объёмная плита и яркий контур
      { id: 'act-shadow', type: 'line', source: 'countries', filter: inAct, layout: { visibility: this.globe ? 'none' : 'visible' }, paint: {
        'line-color': col.actShadow, 'line-width': 8, 'line-blur': 7, 'line-opacity': 0.6,
        'line-translate': [5, 9], 'line-translate-anchor': 'viewport' } },
      { id: 'act-fill', type: 'fill', source: 'countries', filter: inAct, paint: { 'fill-color': col.actFill, 'fill-opacity': curTheme === 'light' ? 0.5 : (this.globe ? 0.12 : 0.05) } }
    );
    if (o.pitch > 0 && !this.globe) layers.push(
      { id: 'act-3d', type: 'fill-extrusion', source: 'countries', filter: inAct, paint: {
        'fill-extrusion-color': col.actExtr, 'fill-extrusion-opacity': curTheme === 'light' ? 0.06 : 0.3, 'fill-extrusion-height': hz,
        'fill-extrusion-base': 0, 'fill-extrusion-vertical-gradient': true } }
    );
    layers.push(
      { id: 'act-edge', type: 'line', source: 'countries', filter: inAct, paint: {
        'line-color': col.actEdge, 'line-opacity': 0.95,
        'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.8, 5, 1.6, 9, 2.4] } }
    );

    var style = {
      version: 8,
      projection: { type: this.globe ? 'globe' : 'mercator' },
      sources: sources,
      layers: layers,
      light: { anchor: 'viewport', color: curTheme === 'light' ? '#ffffff' : '#e6f3ff', intensity: curTheme === 'light' ? 0.3 : 0.45, position: [1.2, 200, 40] }
    };
    if (this.globe) style.sky = curTheme === 'light' ? {
      'sky-color': '#3f74bb', 'horizon-color': '#eaf4ff', 'fog-color': '#4a7fc4',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.4,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
    } : {
      'sky-color': '#02060f', 'horizon-color': '#2f7fd8', 'fog-color': '#030a1a',
      'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.8, 'fog-ground-blend': 0.4,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0]
    };

    var home = o.home, isMobile = app.isMobile();
    var map;
    try {
      map = this.map = new maplibregl.Map({
        container: app.canvas,
        style: style,
        center: [60, 50],                          // стартуем «издали», затем плавно подлетаем к России
        zoom: 1, minZoom: this.minZoom(), maxZoom: 11.5, pitch: this.tilt && o.pitch > 0 ? o.pitch : 0,
        attributionControl: false,
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        cooperativeGestures: coarse,
        canvasContextAttributes: { antialias: true, preserveDrawingBuffer: /[?&]mmshot=1/.test(location.search) },
        locale: {
          'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl + колесо мыши для масштаба',
          'CooperativeGesturesHandler.MacHelpText': '⌘ + колесо мыши для масштаба',
          'CooperativeGesturesHandler.MobileHelpText': 'Двигайте карту двумя пальцами'
        }
      });
    } catch (e) { return Promise.reject(e); }
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: 'Границы и рельеф: Natural Earth'
    }), 'bottom-right');

    var ready = new Promise(function (ok, fail) {
      var t = setTimeout(function () { fail(new Error('map load timeout')); }, 20000);
      map.once('load', function () { clearTimeout(t); ok(); });
    });

    return ready.then(function () { return self.addPoints(); }).then(function () {
      self.bindEvents();
      self.addCountryLabels();
      self.addGraticuleLabels();
      // плавный «подлёт» к России
      self.home(0);                                  // открываемся сразу в нужном виде, без «подлёта»
      // страховка: если «подлёт» кто-то прервал, наклон всё равно должен включиться
      setTimeout(function () {
        if (self.tilt && !self.globe && o.pitch > 0 && Math.abs(map.getPitch() - o.pitch) > 1) {
          map.easeTo({ pitch: o.pitch, duration: 500 });
        }
      }, 300);
    });
  };

  GlobeEngine.prototype.featuresOf = function (cities) {
    return { type: 'FeatureCollection', features: cities.map(function (c) {
      return { type: 'Feature', properties: { id: c.id, count: c.items.length, lat: c.lat }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } };
    }) };
  };
  GlobeEngine.prototype.setCities = function (cities) {
    var src = this.map.getSource('cities');
    if (src) src.setData(this.featuresOf(cities));
    this.setFocus(null);
  };
  // показать выбранные города в кадре (padLeft — место под панель фильтров)
  GlobeEngine.prototype.fit = function (cities, padLeft) {
    var map = this.map, o = this.app.opts;
    if (!cities.length) return;
    var lo1 = 999, lo2 = -999, la1 = 999, la2 = -999;
    cities.forEach(function (c) { lo1 = Math.min(lo1, c.lon); lo2 = Math.max(lo2, c.lon); la1 = Math.min(la1, c.lat); la2 = Math.max(la2, c.lat); });
    if (lo2 - lo1 > 150 || cities.length > 25) return this.home();
    var pitch = this.tilt && !this.globe && o.pitch > 0 ? o.pitch : 0;
    if (cities.length === 1 || (lo2 - lo1 < 0.5 && la2 - la1 < 0.5)) {
      return map.easeTo({ center: [lo1, la1], zoom: 6, offset: [padLeft / 2, 0], duration: reduceMotion ? 0 : 900 });
    }
    var cam = map.cameraForBounds([[lo1, la1], [lo2, la2]], { padding: { top: 70, bottom: 70, left: padLeft + 50, right: 80 }, maxZoom: 6 });
    if (cam) map.easeTo({ center: cam.center, zoom: cam.zoom - pitch * 0.011, duration: reduceMotion ? 0 : 900 });
  };

  GlobeEngine.prototype.addPoints = function () {
    var self = this, app = this.app, map = this.map;
    var total = app.totalObjs, counts = {}, kk;
    for (kk = 1; kk <= app.maxCount; kk++) counts[kk] = 1;
    var jobs = [], PR = 3;                       // растеризуем метки в 3× — чёткие на Retina
    Object.keys(counts).forEach(function (k) {
      jobs.push(svgToImage(pinSVG(+k, 'def', PR)).then(function (img) { map.addImage('pin-' + k, img, { pixelRatio: PR }); }));
      jobs.push(svgToImage(pinSVG(+k, 'act', PR)).then(function (img) { map.addImage('apin-' + k, img, { pixelRatio: PR }); }));
    });
    for (var n = 2; n <= Math.max(total, 2); n++) (function (n) {
      jobs.push(svgToImage(clusterSVG(n, PR)).then(function (img) { map.addImage('cluster-' + n, img, { pixelRatio: PR }); }));
    })(n);

    // пульсирующая «земная» точка под меткой (обычная — голубая, у выбранного объекта — оранжевая)
    var self2 = this;
    var makePulse = function (rgb, core) {
      var size = 192;                              // 2× от логического размера 96
      return {
        width: size, height: size, data: new Uint8Array(size * size * 4),
        onAdd: function () {
          var c = document.createElement('canvas'); c.width = c.height = size;
          this.ctx = c.getContext('2d', { willReadFrequently: true });
        },
        render: function () {
          if (!self2.animate && this.drawn) return false;
          var t = reduceMotion ? 0.35 : (performance.now() % 1800) / 1800, ctx = this.ctx, r = size / 2;
          ctx.clearRect(0, 0, size, size);
          ctx.beginPath(); ctx.arc(r, r, 16 + t * 76, 0, Math.PI * 2);
          var lt = curTheme === 'light';
          ctx.fillStyle = 'rgba(' + rgb + ',' + ((1 - t) * (lt ? 0.1 : 0.26)) + ')'; ctx.fill();
          ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(' + rgb + ',' + ((1 - t) * (lt ? 0.55 : 0.85)) + ')'; ctx.stroke();
          
          this.data = ctx.getImageData(0, 0, size, size).data;
          this.drawn = true;
          if (!reduceMotion) map.triggerRepaint();
          return true;
        }
      };
    };
    map.addImage('pulse', makePulse(curTheme === 'light' ? '24,69,151' : '150,205,255', 'rgba(255,255,255,.98)'), { pixelRatio: 2 });
    map.addImage('pulse-a', makePulse('214,84,79', 'rgba(255,200,196,1)'), { pixelRatio: 2 });

    return Promise.all(jobs).then(function () {
      map.addSource('cities', {
        type: 'geojson', data: self.featuresOf(app.cities),
        cluster: true, clusterMaxZoom: 6, clusterRadius: 28,
        clusterProperties: { objs: ['+', ['get', 'count']] }
      });
      map.addSource('focus', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      var single = self.single = ['!', ['has', 'point_count']];
      map.addLayer({ id: 'pulse', type: 'symbol', source: 'cities', filter: single,
        layout: { 'icon-image': 'pulse', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 0.7 } });
      map.addLayer({ id: 'clusters', type: 'symbol', source: 'cities', filter: ['has', 'point_count'],
        layout: { 'icon-image': ['concat', 'cluster-', ['to-string', ['get', 'objs']]], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addLayer({ id: 'pins', type: 'symbol', source: 'cities', filter: single,
        layout: { 'icon-image': ['concat', 'pin-', ['to-string', ['get', 'count']]], 'icon-anchor': 'bottom',
          'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['-', 0, ['get', 'lat']] } });
      map.addLayer({ id: 'focus-pulse', type: 'symbol', source: 'focus', filter: ['==', ['get', 'mode'], 'active'],
        layout: { 'icon-image': 'pulse-a', 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'icon-size': 1.1 } });
      map.addLayer({ id: 'focus-pin', type: 'symbol', source: 'focus',
        layout: { 'icon-image': ['concat', ['case', ['==', ['get', 'mode'], 'active'], 'apin-', 'pin-'], ['to-string', ['get', 'count']]], 'icon-anchor': 'bottom',
          'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-size': ['match', ['get', 'mode'], 'active', 1.28, 1.12] } });
    });
  };

  GlobeEngine.prototype.addGraticuleLabels = function () {
  if (!this.globe) return;
  var map = this.map, els = [];
  var add = function (txt, lon, lat) {
    var el = document.createElement('div');
    el.className = 'mm-deg'; el.textContent = txt;
    new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map);
    els.push(el);
  };
  [30, 40, 50, 60, 70, 80].forEach(function (la) { add(la + '°', 128, la); });
  for (var lo = -180; lo < 180; lo += (this.app.isMobile() ? 40 : 20)) add((lo < 0 ? 360 + lo : lo) + '°', lo, 83);
  var upd = function () { var z = map.getZoom(); els.forEach(function (e) { e.classList.toggle('is-off', z > 5.5); }); };
  map.on('zoom', upd); upd();
};
GlobeEngine.prototype.addCountryLabels = function () {
    var map = this.map, items = this.labels = [];
    var L = [
      ['Россия', 108, 65, 1], ['Казахстан', 67, 48, 0], ['Китай', 103, 35, 0], ['Монголия', 103, 46.5, 0],
      ['Беларусь', 28, 53.5, 0], ['Турция', 35, 39, 0], ['Египет', 29.5, 26.5, 0], ['Иран', 54, 32.5, 0],
      ['Индия', 79, 22, 0], ['Германия', 10.3, 51.2, 0], ['Финляндия', 26, 64.5, 0], ['Швеция', 16, 62, 0],
      ['Норвегия', 9, 63, 0], ['Узбекистан', 63.5, 41.5, 0], ['Канада', -100, 58, 0], ['США', -100, 40, 0],
      ['Саудовская Аравия', 44, 24, 0]
    ];
    L.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'mm-country' + (c[3] ? ' mm-country--main' : '');
      el.textContent = c[0];
      new maplibregl.Marker({ element: el }).setLngLat([c[1], c[2]]).addTo(map);
      items.push(el);
    });
    var upd = function () {
      var z = map.getZoom();
      items.forEach(function (el, i) { el.classList.toggle('is-off', i === 0 ? z > 6 : (z > 5.5 || z < 2)); });
    };
    map.on('zoom', upd); upd();
  };

  GlobeEngine.prototype.minZoom = function () {
  var st = this.app.stage;
  return this.globe ? 0.7 : Math.max(0.3, Math.log(st.clientHeight / 512) / Math.LN2);
};
GlobeEngine.prototype.queryAt = function (point, layers) {
    var pad = 6;
    return this.map.queryRenderedFeatures([[point.x - pad, point.y - pad], [point.x + pad, point.y + pad]], { layers: layers });
  };

  GlobeEngine.prototype.bindEvents = function () {
    var self = this, app = this.app, map = this.map;
    map.on('click', function (e) {
      var f = self.queryAt(e.point, ['clusters', 'pins']);
      if (!f.length) return app.close();
      var p = f[0].properties;
      if (p.cluster_id !== undefined) {
        var src = map.getSource('cities');
        Promise.resolve(src.getClusterExpansionZoom(p.cluster_id)).then(function (z) {
          map.easeTo({ center: f[0].geometry.coordinates, zoom: Math.min(z + 0.3, 11), duration: 700 });
        });
        app.close();
      } else {
        app.toggle(app.cities[p.id]);
      }
    });
    map.on('mousemove', function (e) {
      var f = self.queryAt(e.point, ['clusters', 'pins']);
      map.getCanvas().style.cursor = f.length ? 'pointer' : '';
      if (f.length && f[0].properties.cluster_id === undefined) app.hover(app.cities[f[0].properties.id]);
      else app.hover(null);
    });
    map.on('mouseout', function () { app.hover(null); });
    map.on('move', function () { app.reposition(); });
    map.on('zoom', function () { app.hideHint(); });
    map.on('dragstart', function () { app.hideHint(); });
  };

  GlobeEngine.prototype.project = function (c) { var p = this.map.project([c.lon, c.lat]); return { x: p.x, y: p.y }; };
  GlobeEngine.prototype.isVisible = function (c) {
    if (this.globe) {
      var ctr = this.map.getCenter(), r = Math.PI / 180;
      var d = Math.acos(clamp(Math.sin(ctr.lat * r) * Math.sin(c.lat * r) +
        Math.cos(ctr.lat * r) * Math.cos(c.lat * r) * Math.cos((c.lon - ctr.lng) * r), -1, 1)) / r;
      var z = this.map.getZoom();
      if (d > (z < 2 ? 68 : z < 4 ? 78 : 86)) return false;
    }
    return true;
  };
  GlobeEngine.prototype.setFocus = function (c, mode) {
    var src = this.map.getSource('focus');
    if (!src) return;
    // базовая метка (и её пульсация у выбранного) прячется, чтобы под увеличенной/красной не оставалась синяя
    if (this.single && this.map.getLayer('pins')) {
      var not = c ? ['!=', ['get', 'id'], c.id] : null;
      this.map.setFilter('pins', not ? ['all', this.single, not] : this.single);
      this.map.setFilter('pulse', not && mode === 'active' ? ['all', this.single, not] : this.single);
    }
    src.setData({ type: 'FeatureCollection', features: c ? [{ type: 'Feature',
      properties: { count: c.items.length, mode: mode }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } }] : [] });
  };
  GlobeEngine.prototype.focusOn = function (c, offset, done) {
    var map = this.map;
    var z = Math.max(map.getZoom(), this.app.opts.focusZoom);
    map.once('moveend', done);
    map.easeTo({ center: [c.lon, c.lat], zoom: z, offset: offset, duration: reduceMotion ? 0 : 900 });
  };
  GlobeEngine.prototype.toggleTilt = function () {
  this.tilt = !this.tilt;
  var map = this.map, k = this.app.opts.pitch * 0.011;
  map.easeTo({ pitch: this.tilt ? this.app.opts.pitch : 0, zoom: map.getZoom() + (this.tilt ? -k : k), duration: 700 });
  return this.tilt;
};
GlobeEngine.prototype.zoomBy = function (d) { d > 0 ? this.map.zoomIn() : this.map.zoomOut(); };
  GlobeEngine.prototype.home = function (duration) {
    var o = this.app.opts, map = this.map, st = this.app.stage;
    duration = duration == null ? 1200 : duration;
    if (this.globe) {
      // на широких экранах глобус растёт: заполняет половину свободного места по бокам
      var zz = this.app.isMobile() ? o.home.mobileZoom : o.home.zoom, D0 = 1140, W = st.clientWidth;
      if (!this.app.isMobile() && W > D0) zz += Math.log2((W * 1.0) / D0);
      // приподнимаем глобус так, чтобы подпись «Казахстан» была видна внизу — при любой высоте экрана
      var offY = 0, ctr = this.app.isMobile() ? o.home.mobileCenter : o.home.center;
      if (!this.app.isMobile()) {
        var keep = { c: map.getCenter(), z: map.getZoom(), p: map.getPitch(), b: map.getBearing() };
        map.jumpTo({ center: ctr, zoom: zz, pitch: 0, bearing: 0 });
        var py = map.project([66, 48.5]).y, want = st.clientHeight * 0.935;
        map.jumpTo({ center: keep.c, zoom: keep.z, pitch: keep.p, bearing: keep.b });
        offY = Math.round(Math.max(-st.clientHeight * 0.25, Math.min(0, want - py)));
      }
      return map.easeTo({ center: ctr, zoom: zz, duration: duration, offset: [0, offY] });
    }
    var m = this.app.isMobile() ? 14 : 36;
    var cam = map.cameraForBounds(this.app.isMobile() ? o.homeBoundsMobile : o.homeBounds, { padding: { top: m, bottom: m + 30, left: m, right: m + (this.app.isMobile() ? 44 : 60) }, maxZoom: 5 });
    if (!cam) return;
    var ease = function (t) { return 1 - Math.pow(1 - t, 3); };
    var pitch = this.tilt && o.pitch > 0 ? o.pitch : 0;
    var view = { center: cam.center, zoom: cam.zoom - pitch * 0.011, pitch: pitch, offset: [0, 0] };
    if (duration) map.easeTo(Object.assign({ duration: duration, easing: ease }, view));
    else map.jumpTo(view);
  };
  GlobeEngine.prototype.toggleProjection = function () {
    this.globe = !this.globe;
    this.map.setProjection({ type: this.globe ? 'globe' : 'mercator' });
    return this.globe;
  };
  GlobeEngine.prototype.setAnimate = function (on) {
    this.animate = on;
    if (on && this.map) this.map.triggerRepaint();
  };
  GlobeEngine.prototype.resize = function () { if (!this.map) return; this.map.resize(); this.map.setMinZoom(this.minZoom()); };

  /* ---------- 2D-режим (Leaflet) — запасной вариант без WebGL ---------- */
  function FlatEngine(app) { this.app = app; this.globe = false; }

  FlatEngine.prototype.init = function () {
    var self = this, app = this.app, o = app.opts;
    return Promise.all([
      loadCss(o.vendor + 'leaflet.css'),
      loadScript(o.vendor + 'leaflet.js'),
      fetch(o.countries).then(function (r) { if (!r.ok) throw new Error('countries'); return r.json(); })
    ]).then(function (res) {
      return loadScript(o.vendor + 'leaflet.markercluster.js').then(function () { return res[2]; });
    }).then(function (countries) {
      var col = app.colors;
      var map = self.map = L.map(app.canvas, {
        zoomControl: false, attributionControl: false, minZoom: 1, maxZoom: 11, zoomSnap: 0.5,
        worldCopyJump: true, preferCanvas: true, maxBounds: [[-85, -540], [85, 540]], maxBoundsViscosity: 0.8
      });
      L.control.attribution({ prefix: false }).addAttribution('Границы и рельеф: Natural Earth').addTo(map);
      if (o.relief) {
        L.tileLayer(o.reliefTiles, { tileSize: 512, zoomOffset: -1, minZoom: 1, maxNativeZoom: 5 }).addTo(map);
        L.geoJSON(countries, { interactive: false, style: { color: col.border, weight: 0.8, opacity: 0.5, fill: false } }).addTo(map);
        var actL = activeCountries(app.cities);
        L.geoJSON(countries, { interactive: false, filter: function (f) { return actL.indexOf(f.properties.name) >= 0; },
          style: { color: col.actEdge, weight: 1.6, opacity: 0.95, fillColor: col.actFill, fillOpacity: 0.12 } }).addTo(map);
      } else {
        L.geoJSON(countries, { interactive: false, style: function (f) {
          return { color: col.border, weight: 0.8, opacity: 0.85, fillColor: f.properties.name === 'Russia' ? col.landHi : col.land, fillOpacity: 1 };
        } }).addTo(map);
      }
      var home = o.home;
      map.setView([home.center[1] - 5, home.center[0]], app.isMobile() ? 1.5 : 2.5);

      var cluster = self.cluster = L.markerClusterGroup({
        showCoverageOnHover: false, maxClusterRadius: 28, spiderfyOnMaxZoom: false, zoomToBoundsOnClick: true,
        iconCreateFunction: function (cl) {
          var n = cl.getAllChildMarkers().reduce(function (s, m) { return s + m.options.count; }, 0);
          var s = 46;
          return L.divIcon({ className: 'mm-cluster2d', html: clusterSVG(n, 1), iconSize: [s, s] });
        }
      });
      self.markers = {};
      self.buildMarkers = function () {
      self.cluster.clearLayers(); self.markers = {};
      app.cities.forEach(function (c) {
        var n = c.items.length;
        var m = L.marker([c.lat, c.lon], { count: n, keyboard: false, icon: L.divIcon({
          className: '', iconSize: [36, 45], iconAnchor: [18, 43],
          html: '<div class="mm-pin2d"><i class="mm-pulse2d"></i><span class="pin-def">' + pinSVG(n, 'def') + '</span><span class="pin-act">' + pinSVG(n, 'act') + '</span></div>' }) });
        m.on('click', function (e) { L.DomEvent.stopPropagation(e); app.toggle(c); });
        m.on('mouseover', function () { app.hover(c); });
        m.on('mouseout', function () { app.hover(null); });
        self.markers[c.id] = m;
        cluster.addLayer(m);
      });
      };
      self.buildMarkers();
      map.addLayer(cluster);
      map.on('click', function () { app.close(); });
      map.on('move zoom', function () { app.reposition(); });
      map.on('movestart zoomstart', function () { app.hideHint(); });
    });
  };
  FlatEngine.prototype.setCities = function () { this.buildMarkers(); };
  FlatEngine.prototype.fit = function (cities, padLeft) {
    if (!cities.length) return;
    var b = L.latLngBounds(cities.map(function (c) { return [c.lat, c.lon]; }));
    this.map.fitBounds(b, { paddingTopLeft: [padLeft + 50, 70], paddingBottomRight: [80, 70], maxZoom: 6, animate: !reduceMotion });
  };
  FlatEngine.prototype.project = function (c) { var p = this.map.latLngToContainerPoint([c.lat, c.lon]); return { x: p.x, y: p.y }; };
  FlatEngine.prototype.isVisible = function (c) {
    // метка скрыта кластером — карточку закрываем предсказуемо
    return !!this.cluster.getVisibleParent(this.markers[c.id]) && this.cluster.getVisibleParent(this.markers[c.id]) === this.markers[c.id];
  };
  FlatEngine.prototype.setFocus = function (c) {
    Object.keys(this.markers).forEach(function (k) {
      var el = this.markers[k]._icon; if (el) el.firstChild.classList.remove('is-active');
    }, this);
    if (c) { var el = this.markers[c.id]._icon; if (el) el.firstChild.classList.add('is-active'); }
  };
  FlatEngine.prototype.focusOn = function (c, offset, done) {
    var map = this.map, z = Math.max(map.getZoom(), 5);
    var pt = map.project([c.lat, c.lon], z).subtract([offset[0], offset[1]]);
    map.once('moveend', done);
    map.setView(map.unproject(pt, z), z, { animate: !reduceMotion, duration: 0.8 });
  };
  FlatEngine.prototype.zoomBy = function (d) { d > 0 ? this.map.zoomIn() : this.map.zoomOut(); };
  FlatEngine.prototype.home = function () { this.map.setView([this.app.opts.home.center[1] - 5, this.app.opts.home.center[0]], this.app.isMobile() ? 1.5 : 2.5); };
  FlatEngine.prototype.setAnimate = function () {};
  FlatEngine.prototype.resize = function () { this.map && this.map.invalidateSize(); };

  /* ---------- приложение ---------- */
  function App(root) {
    this.root = root;
    var d = root.dataset;
    this.opts = Object.assign({}, DEFAULTS, {
      src: d.src || DEFAULTS.src,
      countries: d.countries || DEFAULTS.countries,
      vendor: d.vendor || DEFAULTS.vendor,
      relief: !(d.relief === '0' || d.relief === 'false'),
      reliefTiles: absTpl(d.reliefTiles || DEFAULTS.reliefTiles),
      reliefTilesBase: absTpl(d.reliefTiles || DEFAULTS.reliefTiles),
      projection: /[?&]proj=globe/.test(location.search) ? 'globe' : (d.projection || DEFAULTS.projection),
      pitch: d.pitch != null ? +d.pitch : DEFAULTS.pitch,
      startTilted: d.tilt === '1' || d.tilt === 'true' || /[?&]tilt=1/.test(location.search)
    });
    var th = d.theme === 'light' ? 'light' : 'dark';
    // тема при открытии всегда задаётся атрибутом data-theme (по умолчанию тёмная); выбор посетителя не запоминаем
    this.theme = th;
    this.forceFlat = /[?&]mm2d=1/.test(location.search) || d.mode === '2d';
    this.active = null; this.hovered = null;
  }
  App.prototype.isMobile = function () { return this.stage.clientWidth <= this.opts.mobileBreakpoint; };
  App.prototype.cssVar = function (n, fb) {
    var v = getComputedStyle(this.root).getPropertyValue(n).trim();
    return v || fb;
  };

  App.prototype.mount = function () {
    var root = this.root;
    root.classList.add('msgmap');
    root.setAttribute('data-theme', this.theme); curTheme = this.theme;
    root.innerHTML =
      '<div class="mm-stage"><div class="mm-canvas"></div>' +
      '<div class="mm-status"><span>Загружаем карту…</span></div></div>';
    this.stage = root.querySelector('.mm-stage');
    this.canvas = root.querySelector('.mm-canvas');
    this.status = root.querySelector('.mm-status');
    this.colors = this.readColors();
  };
  App.prototype.readColors = function () {
    return {
      ocean: this.cssVar('--mm-ocean', '#0a2147'), land: this.cssVar('--mm-land', '#2c71c8'),
      landHi: this.cssVar('--mm-land-hi', '#7dbbf6'), border: this.cssVar('--mm-border', '#d8ecff'),
      grid: this.cssVar('--mm-grid', '#8cc4ff'),
      actShadow: this.cssVar('--mm-act-shadow', '#02122e'), actExtr: this.cssVar('--mm-act-extr', '#9fcdfa'),
      actEdge: this.cssVar('--mm-act-edge', '#ffffff'), actFill: this.cssVar('--mm-act-fill', '#ffffff')
    };
  };

  App.prototype.start = function () {
    var self = this;
    this.mount();
    // данные: либо URL (json), либо '#id' — JSON, вставленный прямо в страницу (так работает компонент Bitrix)
    var load = this.opts.src.charAt(0) === '#'
      ? new Promise(function (ok) { ok(JSON.parse(document.querySelector(self.opts.src).textContent)); })
      : fetch(this.opts.src).then(function (r) {
          if (!r.ok) throw new Error('data ' + r.status);
          return r.json();
        });
    return load.then(function (json) {
      self.demo = !!json.demo;
      self.allObjects = (json.objects || json).filter(function (o) { return o.active !== false; });
      self.cities = groupCities(self.allObjects);
      if (!self.cities.length) throw new Error('empty');
      self.totalObjs = self.allObjects.length;
      self.maxCount = self.cities.reduce(function (m, c) { return Math.max(m, c.items.length); }, 1);
      self.filters = { q: '', country: '', city: '', product: [], industry: [] };
      return self.startEngine();
    }).then(function () {
      self.buildUI();
      self.status.classList.add('is-hidden');
    }).catch(function (e) {
      console.error('[msgmap]', e);
      self.status.classList.add('is-error');
      self.status.firstChild.textContent = 'Не удалось загрузить карту. Обновите страницу.';
    });
  };

  App.prototype.startEngine = function () {
    var self = this;
    this.applyThemeTiles();
    var tryFlat = function () {
      self.canvas.innerHTML = ''; self.canvas.className = 'mm-canvas';
      self.engine = new FlatEngine(self);
      return self.engine.init();
    };
    if (this.forceFlat || !hasWebGL()) return tryFlat();
    this.engine = new GlobeEngine(this);
    return this.engine.init().catch(function (e) {
      console.warn('[msgmap] 3D недоступен, переключаюсь на 2D:', e);
      if (self.engine && self.engine.map && self.engine.map.remove) { try { self.engine.map.remove(); } catch (x) { } }
      var fresh = document.createElement('div'); fresh.className = 'mm-canvas';
      self.canvas.replaceWith(fresh); self.canvas = fresh;
      return tryFlat();
    });
  };

  App.prototype.buildUI = function () {
    var self = this, st = this.stage;
    this.card = new Card(this);
    // подсказка
    this.tip = document.createElement('div'); this.tip.className = 'mm-tip'; st.appendChild(this.tip);
    // статистика
    var stats = this.statsEl = document.createElement('div'); stats.className = 'mm-stats';
    this.updateStats();
    st.appendChild(stats);
    if (this.demo) { var dm = document.createElement('div'); dm.className = 'mm-demo'; dm.textContent = 'Демо-данные'; st.appendChild(dm); }
    var hint = this.hint = document.createElement('div'); hint.className = 'mm-hint';
    hint.textContent = 'Перетаскивайте и масштабируйте карту — нажмите на метку, чтобы увидеть объект';
    st.appendChild(hint);
    setTimeout(function () { self.hideHint(); }, 9000);
    // кнопки
    var ctl = document.createElement('div'); ctl.className = 'mm-controls';
    var isGL = this.engine instanceof GlobeEngine;
    ctl.innerHTML =
      '<button type="button" class="mm-btn-ctl" data-c="in" aria-label="Приблизить">+</button>' +
      '<button type="button" class="mm-btn-ctl" data-c="out" aria-label="Отдалить">−</button>' +
      '<button type="button" class="mm-btn-ctl" data-c="home" aria-label="Вернуться к исходному виду" title="К исходному виду">' + ICON.home + '</button>' +
      (isGL ? '<button type="button" class="mm-btn-ctl" data-c="tilt" aria-label="Объёмный вид / вид сверху" title="Объём / вид сверху" aria-pressed="false">' + ICON.tilt + '</button>' +
              '<button type="button" class="mm-btn-ctl" data-c="proj" aria-label="Сменить вид карты"></button>' : '') +
      (isGL ? '<button type="button" class="mm-btn-ctl" data-c="theme" aria-label="Сменить тему"></button>' : '');
    st.appendChild(ctl);
    this.ctl = ctl;
    this.syncCtl();
    ctl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-c]'); if (!b) return;
      var c = b.getAttribute('data-c');
      if (c === 'in') self.engine.zoomBy(1);
      else if (c === 'out') self.engine.zoomBy(-1);
      else if (c === 'home') { self.close(); self.engine.home(); }
      else if (c === 'tilt') { b.setAttribute('aria-pressed', self.engine.toggleTilt()); }
      else if (c === 'proj') self.switchView();
      else if (c === 'theme') self.switchTheme();
    });
    this.buildFilter();
    // закрытие по Esc
    document.addEventListener('keydown', function (e) {
      if (!self.active) return;
      if (e.key === 'Escape') self.close();
      else if (self.card.city && e.key === 'ArrowRight') self.card.go(self.card.index + 1);
      else if (self.card.city && e.key === 'ArrowLeft') self.card.go(self.card.index - 1);
    });
    this.root.tabIndex = -1;
    // экономим батарею: пульсация только когда блок виден
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { self.engine.setAnimate(en[0].isIntersecting); }).observe(st);
    }
    if ('ResizeObserver' in window) {
      var last = st.clientWidth;
      new ResizeObserver(function () {
        self.engine.resize();
        var w = st.clientWidth, was = last <= self.opts.mobileBreakpoint, now = w <= self.opts.mobileBreakpoint;
        last = w;
        if (was !== now) self.close();
        else self.reposition();
      }).observe(st);
    }
  };

  App.prototype.applyThemeTiles = function () {
    var o = this.opts;
    o.reliefTiles = this.theme === 'light' ? o.reliefTilesBase.replace('/relief/', '/relief-light/') : o.reliefTilesBase;
  };

  App.prototype.syncCtl = function () {
    if (!this.ctl) return;
    var g = this.opts.projection === 'globe', pj = this.ctl.querySelector('[data-c="proj"]'), tl = this.ctl.querySelector('[data-c="tilt"]');
    if (pj) {
      pj.innerHTML = g ? ICON.flat : ICON.globe;
      var t = g ? 'Плоская карта' : 'Глобус (вид с полюса)';
      pj.title = t; pj.setAttribute('aria-label', t);
    }
    var tb = this.ctl.querySelector('[data-c="theme"]');
    if (tb) {
      var lt = this.theme === 'light';
      tb.innerHTML = lt ? ICON.moon : ICON.sun;
      tb.title = lt ? 'Тёмная тема' : 'Светлая тема'; tb.setAttribute('aria-label', tb.title);
    }
    if (tl) { tl.hidden = g || !(this.opts.pitch > 0); tl.setAttribute('aria-pressed', !!(this.engine && this.engine.tilt)); }
  };

  // пересборка самой карты (смена вида или темы): интерфейс и фильтры остаются
  App.prototype.rebuild = function () {
    var self = this;
    if (this.switching) return;
    this.switching = true;
    this.close();
    try { if (this.engine.map && this.engine.map.remove) this.engine.map.remove(); } catch (x) { }
    var fresh = document.createElement('div'); fresh.className = 'mm-canvas';
    this.canvas.replaceWith(fresh); this.canvas = fresh;
    this.status.classList.remove('is-hidden');
    this.root.setAttribute('data-theme', this.theme); curTheme = this.theme;
    this.colors = this.readColors();
    return this.startEngine().then(function () {
      self.status.classList.add('is-hidden');
      self.syncCtl();
      if (self.filtersActive()) self.engine.fit(self.cities, self.panelPad());
    }).catch(function (e) { console.error('[msgmap]', e); }).then(function () { self.switching = false; });
  };
  App.prototype.switchView = function () {
    this.opts.projection = this.opts.projection === 'globe' ? 'mercator' : 'globe';
    return this.rebuild();
  };
  App.prototype.switchTheme = function () {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    try { localStorage.setItem('msgmap-theme', this.theme); } catch (x) { }
    return this.rebuild();
  };

  /* ---------- фильтры ---------- */
  var INDUSTRY_ORDER = ['Нефть и газ', 'Нефтехимия и химия', 'Энергетика', 'Металлургия, горнодобыча, стройматериалы', 'Пищевая промышленность и агро', 'ЦОД и электроника', 'Промышленность и транспорт', 'Строительство и благоустройство', 'Экология'];
  function productsOf(o) {
    var p = String(o.product || '').toLowerCase(), r = [];
    if (/сварн/.test(p)) r.push('Сварной настил');
    if (/прессован/.test(p)) r.push('Прессованный настил');
    if (/решет|решёт/.test(p)) r.push('Решётчатый настил');
    if (!r.length && o.product) r.push(String(o.product));
    return r;
  }
  App.prototype.filtersActive = function () {
    var f = this.filters;
    return !!(f.q || f.country || f.city || f.product.length || f.industry.length);
  };
  App.prototype.panelPad = function () { return this.stage.classList.contains('has-filter') && !this.isMobile() ? 340 : 0; };
  App.prototype.matches = function (o) {
    var f = this.filters;
    if (f.country && o.country !== f.country) return false;
    if (f.city && o.city !== f.city) return false;
    if (f.industry.length && f.industry.indexOf(o.industry) < 0) return false;
    if (f.product.length && !productsOf(o).some(function (p) { return f.product.indexOf(p) >= 0; })) return false;
    if (f.q) {
      var hay = [o.title, o.city, o.region, o.country, o.description, o.solution, o.product].join(' ').toLowerCase();
      if (hay.indexOf(f.q.toLowerCase()) < 0) return false;
    }
    return true;
  };

  App.prototype.buildFilter = function () {
    var self = this, st = this.stage, all = this.allObjects;
    var uniq = function (arr) { return arr.filter(function (v, i) { return v && arr.indexOf(v) === i; }); };
    var countries = uniq(all.map(function (o) { return o.country; })).sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    var prods = uniq([].concat.apply([], all.map(productsOf)));
    var inds = uniq(all.map(function (o) { return o.industry; }));
    inds.sort(function (a, b) { var x = INDUSTRY_ORDER.indexOf(a), y = INDUSTRY_ORDER.indexOf(b); return (x < 0 ? 99 : x) - (y < 0 ? 99 : y); });
    var chips = function (g, list) {
      return list.map(function (v) { return '<button type="button" class="mm-fchip" data-g="' + g + '" data-v="' + esc(v) + '" aria-pressed="false">' + esc(v) + '</button>'; }).join('');
    };
    var btn = this.fbtn = document.createElement('button');
    btn.type = 'button'; btn.className = 'mm-fbtn';
    btn.innerHTML = '<svg viewBox="0 0 20 20"><path d="M3 4.500h14l-5.200 6.300v4.700l-3.600 1.800v-6.500z"/></svg><span>Фильтры</span><i class="mm-fbadge" hidden></i>';
    st.appendChild(btn);
    var pn = this.fpanel = document.createElement('aside');
    pn.className = 'mm-filter'; pn.setAttribute('aria-label', 'Фильтры объектов'); pn.hidden = true;
    pn.innerHTML =
      '<div class="mm-filter__head"><b>Фильтры</b><button type="button" class="mm-flink" data-f="reset">Сбросить</button>' +
      '<button type="button" class="mm-fclose" data-f="close" aria-label="Закрыть фильтры">✕</button></div>' +
      '<div class="mm-filter__body">' +
      '<label class="mm-fl"><span>Поиск</span><input type="search" class="mm-fin" data-f="q" placeholder="Название, задача, решение" autocomplete="off"></label>' +
      '<div class="mm-fl"><span>Вид настила</span><div class="mm-fchips">' + chips('product', prods) + '</div></div>' +
      '<div class="mm-fl"><span>Отрасль</span><div class="mm-fchips">' + chips('industry', inds) + '</div></div>' +
      '<label class="mm-fl"><span>Страна</span><select class="mm-fin" data-f="country"><option value="">Все страны</option>' +
        countries.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select></label>' +
      '<label class="mm-fl"><span>Город / место</span><select class="mm-fin" data-f="city"></select></label>' +
      '<div class="mm-fcount"></div><ul class="mm-flist"></ul></div>';
    st.appendChild(pn);
    this.fillCitySelect();
    var open = function (on) {
      pn.hidden = !on; st.classList.toggle('has-filter', on); btn.hidden = on;
      if (on) { self.close(); self.hideHint(); }
    };
    this.setFilterOpen = open;
    btn.addEventListener('click', function () { open(true); });
    var timer;
    pn.addEventListener('input', function (e) {
      if (e.target.getAttribute('data-f') !== 'q') return;
      clearTimeout(timer);
      timer = setTimeout(function () { self.filters.q = e.target.value.trim(); self.applyFilters(); }, 220);
    });
    pn.addEventListener('change', function (e) {
      var k = e.target.getAttribute('data-f');
      if (k === 'country') { self.filters.country = e.target.value; self.filters.city = ''; self.fillCitySelect(); self.applyFilters(); }
      else if (k === 'city') { self.filters.city = e.target.value; self.applyFilters(); }
    });
    pn.addEventListener('click', function (e) {
      var chip = e.target.closest('.mm-fchip');
      if (chip) {
        var arr = self.filters[chip.getAttribute('data-g')], v = chip.getAttribute('data-v'), i = arr.indexOf(v);
        if (i < 0) arr.push(v); else arr.splice(i, 1);
        chip.setAttribute('aria-pressed', i < 0);
        return self.applyFilters();
      }
      var it = e.target.closest('[data-oid]');
      if (it) {
        var id = it.getAttribute('data-oid');
        for (var k = 0; k < self.cities.length; k++) {
          var ix = self.cities[k].items.findIndex(function (o) { return String(o.id) === id; });
          if (ix >= 0) { if (self.isMobile()) open(false); return self.open(self.cities[k], ix); }
        }
        return;
      }
      var a = e.target.closest('[data-f]'); if (!a) return;
      var f = a.getAttribute('data-f');
      if (f === 'close') open(false);
      else if (f === 'reset') self.resetFilters();
    });
    this.renderFilterList();
  };

  App.prototype.fillCitySelect = function () {
    var sel = this.fpanel.querySelector('[data-f="city"]'), c = this.filters.country;
    var names = [];
    this.allObjects.forEach(function (o) { if ((!c || o.country === c) && o.city && names.indexOf(o.city) < 0) names.push(o.city); });
    names.sort(function (a, b) { return a.localeCompare(b, 'ru'); });
    sel.innerHTML = '<option value="">Все города</option>' + names.map(function (n) { return '<option>' + esc(n) + '</option>'; }).join('');
    sel.value = this.filters.city;
  };

  App.prototype.resetFilters = function () {
    this.filters = { q: '', country: '', city: '', product: [], industry: [] };
    var pn = this.fpanel;
    pn.querySelector('[data-f="q"]').value = '';
    pn.querySelector('[data-f="country"]').value = '';
    this.fillCitySelect();
    [].forEach.call(pn.querySelectorAll('.mm-fchip'), function (c) { c.setAttribute('aria-pressed', 'false'); });
    this.applyFilters(true);
  };

  App.prototype.applyFilters = function (reset) {
    var self = this, list = this.allObjects.filter(function (o) { return self.matches(o); });
    this.close();
    this.cities = groupCities(list);
    this.engine.setCities(this.cities);
    this.updateStats();
    this.renderFilterList();
    var f = this.filters, n = (f.q ? 1 : 0) + (f.country ? 1 : 0) + (f.city ? 1 : 0) + f.product.length + f.industry.length;
    this.fbtn.querySelector('.mm-fbadge').hidden = !n;
    this.fbtn.querySelector('.mm-fbadge').textContent = n;
    if (n && this.cities.length) this.engine.fit(this.cities, this.panelPad());
    else if (reset === true) this.engine.home();
  };

  App.prototype.renderFilterList = function () {
    var pn = this.fpanel, n = 0;
    this.cities.forEach(function (c) { n += c.items.length; });
    pn.querySelector('.mm-fcount').textContent = n ? 'Найдено: ' + n + ' ' + plural(n, ['объект', 'объекта', 'объектов']) : 'Ничего не найдено — измените условия';
    var html = '';
    this.cities.forEach(function (c) {
      c.items.forEach(function (o) {
        html += '<li><button type="button" class="mm-fitem" data-oid="' + esc(o.id) + '"><b>' + esc(o.title) + '</b><span>' + esc(c.city) + (c.country && c.country !== 'Россия' ? ', ' + esc(c.country) : '') + '</span></button></li>';
      });
    });
    pn.querySelector('.mm-flist').innerHTML = html;
  };

  App.prototype.updateStats = function () {
    var objs = 0, countries = {};
    this.cities.forEach(function (c) { objs += c.items.length; countries[c.country] = 1; });
    var nc = Object.keys(countries).length, ncity = this.cities.length;
    this.statsEl.innerHTML = '<span><b>' + objs + '</b>' + plural(objs, ['объект', 'объекта', 'объектов']) + '</span>' +
      '<span><b>' + ncity + '</b>' + plural(ncity, ['город', 'города', 'городов']) + '</span>' +
      '<span><b>' + nc + '</b>' + plural(nc, ['страна', 'страны', 'стран']) + '</span>';
  };

  App.prototype.hideHint = function () { if (this.hint) this.hint.classList.add('is-hidden'); };

  App.prototype.hover = function (c) {
    if (this.hovered === c) return;
    this.hovered = c;
    if (this.engine.map && this.engine instanceof GlobeEngine) {
      this.engine.setFocus(c && c !== this.active ? c : (this.active || null), c && c !== this.active ? 'hover' : 'active');
    }
    var tip = this.tip;
    if (!c || c === this.active || this.isMobile()) { tip.classList.remove('is-on'); return; }
    var p = this.engine.project(c), n = c.items.length;
    tip.innerHTML = esc(c.city) + (n > 1 ? '<small>' + n + '</small>' : '');
    tip.style.transform = 'translate(' + Math.round(p.x - tip.offsetWidth / 2) + 'px,' + Math.round(p.y - 58) + 'px)';
    tip.classList.add('is-on');
  };

  App.prototype.toggle = function (c) { this.active === c ? this.close() : this.open(c); };

  App.prototype.open = function (c, idx) {
    var self = this, st = this.stage;
    this.hover(null);
    this.active = c;
    this.card.hide(); this.card.city = null;
    this.engine.setFocus(c, 'active');
    this.card.el.classList.toggle('mm-card--sheet', this.isMobile());
    this.card.el.classList.remove('is-open');
    // сначала рендерим (чтобы знать размер), затем доводим карту
    this.card.city = c; this.card.index = idx || 0; this.card.render();
    var W = st.clientWidth, H = st.clientHeight, offset;
    if (this.isMobile()) {
      var sheetH = Math.min(this.card.el.offsetHeight || 300, H * 0.62);
      offset = [0, -sheetH / 2 + 20];
    } else {
      offset = [(this.stage.classList.contains('has-filter') ? W * 0.40 : W * 0.32) - W / 2, 30];   // метку — левее центра, справа место под карточку
    }
    this.engine.focusOn(c, offset, function () {
      if (self.active !== c) return;
      self.card.show(c, idx || 0);
      self.reposition();
    });
  };

  App.prototype.close = function () {
    if (!this.active) return;
    this.active = null;
    this.card.hide();
    this.engine.setFocus(null);
    this.tip.classList.remove('is-on');
  };

  // Карточка «привязана» к метке: следуем за ней при панорамировании/зуме;
  // если метка ушла за горизонт, за край экрана или скрылась в кластере — закрываем.
  App.prototype.reposition = function () {
    var c = this.active;
    if (!c || !this.card.city) return;
    if (this.isMobile()) { this.card.el.classList.add('mm-card--sheet'); }
    var p = this.engine.project(c), st = this.stage;
    var out = !this.engine.isVisible(c) || p.x < -10 || p.y < 20 || p.x > st.clientWidth + 10 || p.y > st.clientHeight + 30;
    if (out) return this.close();
    if (!this.isMobile()) { this.card.el.classList.remove('mm-card--sheet'); this.card.place(p); }
  };

  /* ---------- автозапуск с ленивой загрузкой ---------- */
  function boot(root) {
    if (root.__msgmap) return;
    var app = root.__msgmap = new App(root);
    app.start();
  }
  function init() {
    var nodes = document.querySelectorAll('[data-msgmap]');
    Array.prototype.forEach.call(nodes, function (n) {
      // заглушка до загрузки, чтобы не было прыжка вёрстки
      n.classList.add('msgmap');
      if (!('IntersectionObserver' in window)) return boot(n);
      new IntersectionObserver(function (en, ob) {
        if (en[0].isIntersecting) { ob.disconnect(); boot(n); }
      }, { rootMargin: '500px 0px' }).observe(n);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.MSGMap = { boot: boot };
})();
