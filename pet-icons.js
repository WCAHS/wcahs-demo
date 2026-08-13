/* WCAHS pet attribute icons — single source of truth.
 *
 * Loaded by pets.html, index.html and their /es mirrors. Previously each page
 * carried its own copy of this, which is how the legend on pets.html ended up
 * still showing the original PNG art months after the cards had been switched to
 * generic SVGs. One copy now; add an icon here and every page picks it up.
 *
 * The dog/cat/kid/housetrained art are solid-black alpha PNGs, so they're painted
 * with the tile's own `color` via a CSS mask rather than dropped in as <img>.
 * That's what lets your artwork take the green / red / grey state colours the way
 * an inline SVG would.
 *
 * Usage:
 *   wcahsPetIcons.build(animal.attributes)                    // full row, greys included
 *   wcahsPetIcons.build(animal.attributes, {knownOnly:true})  // only what we actually know
 *   wcahsPetIcons.renderLegend(document.getElementById('iconLegend'))
 */
(function () {
  var ES = (document.documentElement.lang || '').toLowerCase().indexOf('es') === 0;

  var T = ES ? {
    dogYes:'Compatible con perros', dogNo:'No compatible con perros', dogUnk:'Se desconoce con perros',
    catYes:'Compatible con gatos',  catNo:'No compatible con gatos',  catUnk:'Se desconoce con gatos',
    kidYes:'Compatible con niños',  kidNo:'Hogar solo para adultos',  kidUnk:'Se desconoce con niños',
    house:'Entrenado en casa', litter:'Entrenado con arenero', notHouse:'No entrenado en casa',
    bonded:'Pareja vinculada', notBonded:'No es pareja vinculada', diet:'Dieta especial',
    lDogs:'Perros', lCats:'Gatos', lKids:'Niños', lHouse:'Entrenado en casa',
    lBonded:'Pareja vinculada', lDiet:'Dieta especial',
    kYes:'Compatible con', kNo:'No compatible con', kUnk:'Se desconoce', kSpecial:'Aplica a esta mascota'
  } : {
    dogYes:'Dog-Friendly', dogNo:'Not Good with Dogs', dogUnk:'Unknown with Dogs',
    catYes:'Cat-Friendly', catNo:'Not Good with Cats', catUnk:'Unknown with Cats',
    kidYes:'Kid-Friendly', kidNo:'Adult-Only Home',    kidUnk:'Unknown with Kids',
    house:'Housetrained', litter:'Litter Box Trained', notHouse:'Not Housetrained',
    bonded:'Bonded Pair', notBonded:'Not a Bonded Pair', diet:'Special Dietary Needs',
    lDogs:'Dogs', lCats:'Cats', lKids:'Kids', lHouse:'Housetrained',
    lBonded:'Bonded Pair', lDiet:'Special Diet',
    kYes:'Good with', kNo:'Not good with', kUnk:'Not known', kSpecial:'Applies to this pet'
  };

  var CSS =
    '.attr-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px}' +
    '.attr-yes{background:#e8ebe3;color:#48543e}' +
    '.attr-no{background:#fee2e2;color:#dc2626}' +
    '.attr-unknown{background:#f3f4f6;color:#d1d5db}' +
    '.attr-special{background:#fef3c7;color:#b45309}' +
    '.attr-art{width:17px;height:17px;background-color:currentColor;' +
      '-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;' +
      '-webkit-mask-position:center;mask-position:center;' +
      '-webkit-mask-size:contain;mask-size:contain}' +
    ".art-dog{-webkit-mask-image:url('/images/icons/dog-friendly.png');mask-image:url('/images/icons/dog-friendly.png')}" +
    ".art-cat{-webkit-mask-image:url('/images/icons/cat-friendly.png');mask-image:url('/images/icons/cat-friendly.png')}" +
    ".art-kid{-webkit-mask-image:url('/images/icons/kid-friendly.png');mask-image:url('/images/icons/kid-friendly.png')}" +
    ".art-house{-webkit-mask-image:url('/images/icons/litter-trained.png');mask-image:url('/images/icons/litter-trained.png')}" +
    /* tall/narrow art needs a nudge to match the optical weight of the wide art */
    '.art-kid{width:15px;height:19px}.art-house{width:14px;height:19px}';

  (function injectCss() {
    if (document.getElementById('wcahs-pet-icons-css')) return;
    var st = document.createElement('style');
    st.id = 'wcahs-pet-icons-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  })();

  var art = {
    dog:   '<span class="attr-art art-dog"></span>',
    cat:   '<span class="attr-art art-cat"></span>',
    kid:   '<span class="attr-art art-kid"></span>',
    house: '<span class="attr-art art-house"></span>',
    // No silhouette art exists for these two, so they're solid-fill SVGs rather than
    // thin outlines — otherwise they'd look weightless next to the masked PNGs.
    bonded:'<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M12 21C12 21 4 14.5 4 9.5 4 6.5 6.5 4 9 4c1.74 0 2.73.72 3 1.28C12.27 4.72 13.26 4 15 4c2.5 0 5 2.5 5 5.5C20 14.5 12 21 12 21z"/></svg>',
    diet:  '<svg viewBox="0 0 24 24" fill="currentColor" style="width:17px;height:17px"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 15.5a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm1.1-5.4c-.05.6-.5 1-1.1 1s-1.05-.4-1.1-1L10.6 8a1.4 1.4 0 112.8 0z"/></svg>'
  };

  function tile(cls, title, icon) {
    return '<span class="attr-icon ' + cls + '" title="' + title + '">' + icon + '</span>';
  }

  function state(attrs, yes, no) {
    if (attrs.indexOf(no) !== -1) return 'no';
    if (attrs.indexOf(yes) !== -1) return 'yes';
    return 'unknown';
  }

  /* opts.knownOnly — drop the grey "we don't know" tiles. Used on the homepage,
   * which is a three-card teaser rather than a comparison grid, so unknowns there
   * are visual noise instead of information. */
  function build(attributes, opts) {
    var attrs = attributes || [], o = opts || {}, html = '';

    var checks = [
      { yes:'Good with Dogs', no:'Not Good with Dogs', override:'Single Dog Home', icon:art.dog,
        labels:{ yes:T.dogYes, no:T.dogNo, unknown:T.dogUnk } },
      { yes:'Good with Cats', no:'Not Good with Cats', icon:art.cat,
        labels:{ yes:T.catYes, no:T.catNo, unknown:T.catUnk } },
      { yes:'Good with Kids', no:'Adult-Only Home Preferred', icon:art.kid,
        labels:{ yes:T.kidYes, no:T.kidNo, unknown:T.kidUnk } }
    ];
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i], st = state(attrs, c.yes, c.no);
      if (c.override && attrs.indexOf(c.override) !== -1) st = 'no';
      if (o.knownOnly && st === 'unknown') continue;
      html += tile(st === 'yes' ? 'attr-yes' : st === 'no' ? 'attr-no' : 'attr-unknown', c.labels[st], c.icon);
    }

    if (attrs.indexOf('Housetrained') !== -1 || attrs.indexOf('Litter Box Trained') !== -1) {
      html += tile('attr-yes', attrs.indexOf('Housetrained') !== -1 ? T.house : T.litter, art.house);
    } else if (attrs.indexOf('Not Housetrained') !== -1) {
      html += tile('attr-no', T.notHouse, art.house);
    }

    // Always rendered on the full grid so icon rows line up card to card.
    var isBonded = attrs.indexOf('Bonded') !== -1;
    if (isBonded) html += tile('attr-special', T.bonded, art.bonded);
    else if (!o.knownOnly) html += tile('attr-unknown', T.notBonded, art.bonded);

    if (attrs.indexOf('Special Dietary needs') !== -1) html += tile('attr-special', T.diet, art.diet);

    return html;
  }

  /* Legend is built from the same `art` object the cards use, so a new icon can't
   * go undocumented and the legend can't drift out of sync again. */
  function renderLegend(el) {
    if (!el) return;
    var items = [
      { icon:art.dog,    state:'attr-yes',     label:T.lDogs },
      { icon:art.cat,    state:'attr-yes',     label:T.lCats },
      { icon:art.kid,    state:'attr-yes',     label:T.lKids },
      { icon:art.house,  state:'attr-yes',     label:T.lHouse },
      { icon:art.bonded, state:'attr-special', label:T.lBonded },
      { icon:art.diet,   state:'attr-special', label:T.lDiet }
    ];
    var keys = [
      { bg:'#e8ebe3', label:T.kYes }, { bg:'#fee2e2', label:T.kNo },
      { bg:'#f3f4f6', label:T.kUnk }, { bg:'#fef3c7', label:T.kSpecial }
    ];
    // Equal-width grid columns rather than flex-wrap, so differing label widths
    // don't leave the row looking ragged. Reflows 6 -> 3 -> 2 as it narrows.
    var a = '<div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-3 text-sm text-gray-500">';
    for (var i = 0; i < items.length; i++) {
      a += '<div class="flex items-center justify-start gap-2 px-1"><span class="attr-icon ' + items[i].state +
           ' shrink-0">' + items[i].icon + '</span><span class="truncate">' + items[i].label + '</span></div>';
    }
    a += '</div><div class="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-y-2 text-xs text-gray-400">';
    for (var j = 0; j < keys.length; j++) {
      a += '<span class="flex items-center justify-start gap-1.5 px-1"><span class="inline-block w-3 h-3 rounded shrink-0" style="background:' +
           keys[j].bg + '"></span><span class="truncate">' + keys[j].label + '</span></span>';
    }
    window.wcahsPetIcons._legendEl = el;
    el.innerHTML = a + '</div>';
  }

  window.wcahsPetIcons = { build: build, renderLegend: renderLegend, art: art };
})();
