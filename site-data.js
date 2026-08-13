// Phone formatting — auto-formats as (555) 123-4567
function formatPhone(input) {
  var digits = input.value.replace(/\D/g, '').substring(0, 10);
  if (digits.length === 0) { input.value = ''; return; }
  if (digits.length <= 3) { input.value = '(' + digits; }
  else if (digits.length <= 6) { input.value = '(' + digits.substring(0,3) + ') ' + digits.substring(3); }
  else { input.value = '(' + digits.substring(0,3) + ') ' + digits.substring(3,6) + '-' + digits.substring(6); }
}

function displayPhone(phone) {
  if (!phone) return '';
  var digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '(' + digits.substring(0,3) + ') ' + digits.substring(3,6) + '-' + digits.substring(6);
  if (digits.length === 11 && digits[0] === '1') return '(' + digits.substring(1,4) + ') ' + digits.substring(4,7) + '-' + digits.substring(7);
  return phone; // return as-is if not a standard US number
}

// Shared site data loader — fetches settings from API and updates dynamic elements
(function() {
  function loadSettings() {
    fetch('/api/settings')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        applySettings(data);
      })
      .catch(function() {
        // API not available — site works fine with hardcoded defaults
      });
  }

  function applySettings(s) {
    // Announcement banner (with page targeting)
    var banner = document.getElementById('announcement-banner');
    if (banner && (s.announcement_enabled === true || s.announcement_enabled === 'true') && s.announcement_text) {
      var pages = s.announcement_pages || 'all';
      var currentPage = location.pathname.replace(/.*\//, '').replace('.html', '') || 'home';
      if (currentPage === 'index') currentPage = 'home';
      if (currentPage === 'pet') currentPage = 'pets';
      var show = pages === 'all' || pages.split(',').indexOf(currentPage) !== -1;
      if (show) {
        banner.querySelector('.announcement-text').textContent = s.announcement_text;
        banner.classList.remove('hidden');
      }
    }

    // Footer contact info
    var footerPhones = document.querySelectorAll('[data-setting="phone"]');
    footerPhones.forEach(function(footerPhone) {
      if (s.phone) {
        footerPhone.textContent = displayPhone(s.phone);
        var link = footerPhone.closest('a');
        if (link) link.href = 'tel:' + s.phone.replace(/\D/g, '');
      }
    });
    var footerAddress = document.querySelector('[data-setting="address"]');
    if (footerAddress && s.address) footerAddress.textContent = s.address;

    var footerFb = document.querySelector('[data-setting="facebook_url"]');
    if (footerFb && s.facebook_url) footerFb.href = s.facebook_url;

    // Partners (index page)
    var partnersList = document.getElementById('partners-list');
    if (partnersList && s.partners) {
      var partners = Array.isArray(s.partners) ? s.partners : JSON.parse(s.partners);
      partnersList.innerHTML = partners.map(function(p) {
        return '<span class="text-lg font-bold text-gray-400">' + p + '</span>';
      }).join('');
    }

    // Store globally for page-specific use
    window._wcahsSettings = s;

    // Donations: ShelterLuv Donation Boost by default, Zeffy kept as a switchable
    // alternative. Admin > Site Settings > Integrations picks the provider, so
    // switching back is a settings change and not a redeploy.
    wcahsApplyDonateLinks();
  }

  // Resolve the active donation URL from settings.
  window.wcahsDonateUrl = function() {
    var s = window._wcahsSettings || {};
    if (s.donation_provider === 'zeffy') {
      var z = s.zeffy_url || 'https://www.zeffy.com/embed/donation-form/donate-to-change-lives-16581';
      return z + (z.indexOf('?') === -1 ? '?' : '&') + 'modal=true';
    }
    return s.donate_url || 'https://checkout.shelterluv.com/donate/WCAH';
  };

  // Any <a data-donate> on the page points at whichever provider is active.
  function wcahsApplyDonateLinks() {
    var url = window.wcahsDonateUrl();
    var links = document.querySelectorAll('a[data-donate]');
    for (var i = 0; i < links.length; i++) links[i].href = url;
  }
  window.wcahsApplyDonateLinks = wcahsApplyDonateLinks;

  // Shared donate modal — both providers allow framing, so donors stay on wcahs.org.
  window.openDonate = function() {
    var existing = document.getElementById('donateOverlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'donateOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;';
    overlay.innerHTML = '<div style="position:relative;width:100%;max-width:560px;height:92vh;max-height:820px;background:#fff;border-radius:16px;overflow:hidden;">' +
      '<button aria-label="Close" onclick="document.getElementById(\'donateOverlay\').remove()" style="position:absolute;top:10px;right:10px;z-index:10;background:rgba(0,0,0,0.5);color:#fff;border:none;width:36px;height:36px;border-radius:50%;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#10005;</button>' +
      '<iframe src="' + window.wcahsDonateUrl() + '" style="width:100%;height:100%;border:none;" allow="payment"></iframe></div>';
    overlay.addEventListener('click', function(e) { if (e.target === overlay) overlay.remove(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { var o = document.getElementById('donateOverlay'); if (o) o.remove(); document.removeEventListener('keydown', esc); }
    });
    document.body.appendChild(overlay);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSettings);
  } else {
    loadSettings();
  }
})();
