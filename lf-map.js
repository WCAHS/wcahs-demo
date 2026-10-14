// Lost & Found maps and address lookup — shared by lost-found.html, its
// Spanish copy, and the admin. One copy, so the public form and the staff
// editor can't drift apart the way the four pet-icon copies once did.
//
//   WCAHSMap.addressInput(input, { onPick })   type-ahead under an <input>
//   WCAHSMap.picker(div, { lat, lng, onChange }) map you tap / drag a pin on
//   WCAHSMap.pins(div, reports, { onClick })   lost (red) + found (green) pins
//
// Addresses come from our own /api/addresses (Minnesota's open address points
// for Waseca, Steele, Le Sueur and Rice counties). When that has little to
// offer — a park, a business, Blue Earth or Freeborn county — it falls back to
// Photon, a free OpenStreetMap search, limited to this corner of the state.
(function () {
  var LEAFLET = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
  var HOME = [44.0777, -93.5074];               // Waseca
  var BOX = { w: -94.6, s: 43.4, e: -92.6, n: 44.7 };
  var es = (document.documentElement.lang || '').indexOf('es') === 0;
  var T = es
    ? { searching: 'Buscando…', none: 'No encontramos esa dirección — toque el mapa para marcar el lugar.', tap: 'Toque el mapa o arrastre el marcador para ajustar el lugar.', lost: 'PERDIDO', found: 'ENCONTRADO', approx: 'Ubicación aproximada' }
    : { searching: 'Searching…', none: 'No match — tap the map to drop a pin instead.', tap: 'Tap the map or drag the pin to fine-tune the spot.', lost: 'LOST', found: 'FOUND', approx: 'Approximate location' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var _loading = null;
  function load() {
    if (window.L) return Promise.resolve(window.L);
    if (_loading) return _loading;
    _loading = new Promise(function (resolve, reject) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET + 'leaflet.min.css';
      document.head.appendChild(css);
      var s = document.createElement('script');
      s.src = LEAFLET + 'leaflet.min.js';
      s.onload = function () { resolve(window.L); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return _loading;
  }

  function baseMap(L, el, center, zoom) {
    var map = L.map(el, { scrollWheelZoom: false, tap: true }).setView(center || HOME, zoom || 13);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    return map;
  }

  function dot(L, color) {
    return L.divIcon({
      className: '',
      html: '<div style="width:22px;height:22px;border-radius:50%;background:' + color + ';border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"></div>',
      iconSize: [22, 22], iconAnchor: [11, 11]
    });
  }

  // ── Address type-ahead ──
  function photon(q) {
    var url = 'https://photon.komoot.io/api/?limit=5&lang=en&lat=' + HOME[0] + '&lon=' + HOME[1] +
      '&bbox=' + [BOX.w, BOX.s, BOX.e, BOX.n].join(',') + '&q=' + encodeURIComponent(q);
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      return (d.features || []).map(function (f) {
        var p = f.properties || {};
        var line1 = p.name && p.name !== p.street ? p.name : [p.housenumber, p.street].filter(Boolean).join(' ');
        var label = [line1 || p.street, p.city || p.county].filter(Boolean).join(', ');
        return { label: label, lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
      }).filter(function (x) { return x.label; });
    }).catch(function () { return []; });
  }

  function addressInput(input, opts) {
    opts = opts || {};
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.setAttribute('autocomplete', 'off');
    var list = document.createElement('div');
    list.style.cssText = 'position:absolute;left:0;right:0;top:100%;z-index:1000;background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-top:4px;box-shadow:0 8px 24px rgba(0,0,0,.12);display:none;max-height:260px;overflow-y:auto';
    wrap.appendChild(list);
    var timer = null, seq = 0, items = [];

    function close() { list.style.display = 'none'; }
    function show(html) { list.innerHTML = html; list.style.display = 'block'; }
    function pick(i) {
      var it = items[i]; if (!it) return;
      input.value = it.label;
      close();
      if (opts.onPick) opts.onPick(it);
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      var q = input.value.trim();
      if (opts.onType) opts.onType(q);
      if (q.length < 3) { close(); return; }
      timer = setTimeout(function () {
        var mine = ++seq;
        show('<div style="padding:10px 14px;color:#9ca3af;font-size:13px">' + T.searching + '</div>');
        fetch('/api/addresses?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).catch(function () { return []; })
          .then(function (local) {
            local = Array.isArray(local) ? local : [];
            return local.length >= 3 ? local : photon(q).then(function (more) { return local.concat(more).slice(0, 8); });
          })
          .then(function (res) {
            if (mine !== seq) return;
            items = res;
            if (!res.length) { show('<div style="padding:10px 14px;color:#9ca3af;font-size:13px">' + T.none + '</div>'); return; }
            show(res.map(function (r, i) {
              return '<div data-i="' + i + '" style="padding:10px 14px;font-size:14px;cursor:pointer;border-bottom:1px solid #f3f4f6">' + esc(r.label) + '</div>';
            }).join(''));
          });
      }, 250);
    });
    list.addEventListener('mousedown', function (e) {
      var row = e.target.closest('[data-i]');
      if (row) { e.preventDefault(); pick(Number(row.getAttribute('data-i'))); }
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  }

  // ── Pin picker ──
  function picker(el, opts) {
    opts = opts || {};
    var api = { map: null, marker: null, setPoint: function () {} };
    load().then(function (L) {
      var has = opts.lat != null && opts.lng != null;
      var map = baseMap(L, el, has ? [opts.lat, opts.lng] : HOME, has ? 16 : 12);
      api.map = map;
      var hint = document.createElement('p');
      hint.textContent = T.tap;
      hint.style.cssText = 'font-size:12px;color:#9ca3af;margin-top:6px';
      el.parentNode.insertBefore(hint, el.nextSibling);
      function place(lat, lng, zoom) {
        if (!api.marker) {
          api.marker = L.marker([lat, lng], { draggable: true }).addTo(map);
          api.marker.on('dragend', function () {
            var p = api.marker.getLatLng();
            if (opts.onChange) opts.onChange(p.lat, p.lng, 'drag');
          });
        } else api.marker.setLatLng([lat, lng]);
        if (zoom) map.setView([lat, lng], zoom);
      }
      if (has) place(opts.lat, opts.lng);
      map.on('click', function (e) {
        place(e.latlng.lat, e.latlng.lng);
        if (opts.onChange) opts.onChange(e.latlng.lat, e.latlng.lng, 'tap');
      });
      api.setPoint = function (lat, lng) { place(lat, lng, 17); };
      // A map created inside something that was hidden or still animating open
      // measures itself as 0x0; re-measure once it's on screen.
      setTimeout(function () { map.invalidateSize(); }, 250);
    });
    return api;
  }

  // ── Pins for many reports ──
  function pins(el, reports, opts) {
    opts = opts || {};
    return load().then(function (L) {
      var withPin = reports.filter(function (r) { return r.lat != null && r.lng != null; });
      var map = baseMap(L, el, HOME, 11);
      var bounds = [];
      withPin.forEach(function (r) {
        var lost = r.type === 'lost';
        var m = L.marker([r.lat, r.lng], { icon: dot(L, lost ? '#cc1f1f' : '#2d7a3a') }).addTo(map);
        var title = esc(r.pet_name || ((es ? (r.species === 'Dog' ? 'Perro' : r.species === 'Cat' ? 'Gato' : 'Mascota') : (r.species || 'Pet'))));
        m.bindPopup('<b style="color:' + (lost ? '#cc1f1f' : '#2d7a3a') + '">' + (lost ? T.lost : T.found) + '</b> ' + title +
          (r.address ? '<br><span style="color:#6b7280">' + esc(r.address) + '</span>' : '') +
          (opts.approximate ? '<br><span style="color:#9ca3af;font-size:11px">' + T.approx + '</span>' : '') +
          (opts.onClick ? '<br><a href="#" data-open="' + r.id + '">' + (es ? 'Ver detalles' : 'View details') + ' &rarr;</a>' : ''));
        bounds.push([r.lat, r.lng]);
      });
      if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
      else if (bounds.length === 1) map.setView(bounds[0], 14);
      if (opts.onClick) {
        el.addEventListener('click', function (e) {
          var a = e.target.closest('[data-open]');
          if (a) { e.preventDefault(); opts.onClick(Number(a.getAttribute('data-open'))); }
        });
      }
      setTimeout(function () { map.invalidateSize(); }, 250);
      return { map: map, count: withPin.length };
    });
  }

  window.WCAHSMap = { load: load, addressInput: addressInput, picker: picker, pins: pins, esc: esc };
})();
