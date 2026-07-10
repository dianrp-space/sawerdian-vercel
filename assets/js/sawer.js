/**
 * Sawerdian - Halaman sawer publik
 * Load config, render UI, handle submit donasi
 */

// ============================================
// API base
// ============================================
const API_BASE = (() => {
  const { hostname, protocol } = window.location;
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    protocol === 'file:'
  ) {
    return 'http://localhost:3003';
  }
  return ''; // same origin
})();

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

// ============================================
// State
// ============================================
const state = {
  config: null,
  selectedAmount: null,
  currentDonation: null,
  countdownInterval: null,
};

// ============================================
// Theme handling
// ============================================
function initTheme() {
  const saved = localStorage.getItem('drp-theme');
  const theme = saved || 'light';
  document.documentElement.setAttribute('data-theme', theme);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.checked = theme === 'dark';
    toggle.addEventListener('change', (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', newTheme);
      localStorage.setItem('drp-theme', newTheme);
    });
  }
}

// ============================================
// Toast
// ============================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  const alertClass = {
    info: 'alert-info',
    success: 'alert-success',
    warning: 'alert-warning',
    error: 'alert-error',
  }[type] || 'alert-info';
  const el = document.createElement('div');
  el.className = `alert ${alertClass} shadow-lg`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, duration);
}

// ============================================
// Helpers
// ============================================
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#39;');
}

function formatIDR(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(n);
}

function formatShort(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(0) + 'jt';
  if (n >= 1000) return (n / 1000).toFixed(0) + 'rb';
  return n.toString();
}

// ============================================
// Load config & stats
// ============================================
async function loadConfig() {
  try {
    const [config, stats] = await Promise.all([
      api('/api/config'),
      api('/api/leaderboard/stats').catch(() => null),
    ]);
    state.config = config;
    applyConfig(config);
    if (stats) applyStats(stats);
  } catch (err) {
    console.error('Failed to load config:', err);
    showToast('Gagal memuat konfigurasi. Coba refresh halaman.', 'error', 5000);
  }
}

function applyConfig(config) {
  // Creator info
  document.getElementById('creatorName').textContent = config.creator.name;
  document.getElementById('creatorTagline').textContent = config.creator.tagline || '';
  if (config.creator.avatar) {
    document.getElementById('creatorAvatar').src = config.creator.avatar;
  }

  // Primary color CSS variable
  if (config.creator.primaryColor) {
    document.documentElement.style.setProperty('--drp-primary', config.creator.primaryColor);
    // Convert hex to rgb tuple
    const rgb = hexToRgb(config.creator.primaryColor);
    if (rgb) {
      document.documentElement.style.setProperty('--drp-primary-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
    }
  }

  // Banner (optional)
  if (config.creator.banner) {
    const bannerWrap = document.getElementById('bannerWrap');
    const bannerImg = document.getElementById('creatorBanner');
    if (bannerWrap && bannerImg) {
      bannerImg.src = config.creator.banner;
      bannerWrap.classList.remove('hidden');
    }
  }

  // Social links
  const socialWrap = document.getElementById('socialLinks');
  socialWrap.innerHTML = '';
  if (config.creator.website) {
    socialWrap.appendChild(createSocialBtn(config.creator.website, getIcon('website'), 'Website'));
  }
  (config.socials || []).forEach((s) => {
    socialWrap.appendChild(createSocialBtn(s.url, getIcon(s.platform), s.label || s.platform));
  });




  // Footer
  if (config.footer) {
    document.getElementById('footerText').textContent = config.footer;
  }

  // Preset amounts
  renderPresets(config.donation.presets);

  // Toggle optional fields
  if (!config.donation.donorNameEnabled) {
    document.getElementById('donorNameWrap').style.display = 'none';
  }
  if (!config.donation.messageEnabled) {
    document.getElementById('messageWrap').style.display = 'none';
  }

  // Set min/max on custom input
  const customInput = document.getElementById('customAmount');
  customInput.min = config.donation.minAmount;
  customInput.max = config.donation.maxAmount;
}

function applyStats(stats) {
  document.getElementById('statTotal').textContent = stats.all.totalFormatted || 'Rp 0';
  document.getElementById('statMonth').textContent = stats.month.totalFormatted || 'Rp 0';
}

function createSocialBtn(url, iconHTML, label) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.className = 'tooltip';
  a.setAttribute('data-tip', label);
  // iconHTML adalah HTML brand-icon (bukan string yg perlu di-escape)
  a.innerHTML = iconHTML;
  return a;
}


/**
 * Brand badge untuk social media icon.
 * Return HTML span dengan warna brand + huruf/logo yang recognizable.
 * 36x36 px circle, white text, brand color background.
 */
function getIcon(platform) {
  const p = (platform || '').toLowerCase();
  const s = 20;

  function svg(d) {
    return `<span class="brand-icon" style="background:${d.bg}"><svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="white">${d.path}</svg></span>`;
  }

  const map = {
    instagram: {
      bg: 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
      path: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5"/>',
    },
    youtube: {
      bg: '#FF0000',
      path: '<path d="M23.5 6.2c-.3-1-1.1-1.8-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6c-1 .3-1.8 1.1-2.1 2.1C.5 8.1.5 12 .5 12s0 3.9.6 5.8c.3 1 1.1 1.8 2.1 2.1 1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6c1-.3 1.8-1.1 2.1-2.1.6-1.9.6-5.8.6-5.8s0-3.9-.6-5.8zM9.7 15.5V8.5l6.3 3.5-6.3 3.5z"/>',
    },
    tiktok: {
      bg: 'linear-gradient(135deg, #25F4EE 0%, #25F4EE 50%, #FE2C55 50%, #FE2C55 100%)',
      path: '<path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>',
    },
    twitter: {
      bg: '#000000',
      path: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>',
    },
    x: {
      bg: '#000000',
      path: '<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>',
    },
    telegram: {
      bg: '#26A5E4',
      path: '<path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.127.087.536.09.548.117.548.403 2.093.575 3.107.11.63.205 1.168.248 1.428.08.5.108.777.036.938a.624.624 0 01-.288.307c-.236.123-.586.028-.607.024-.1-.017-1.851-.634-2.238-.744-.143-.04-.636-.177-.817.183-.227.452-.455.896-.673 1.326-.143.288-.308.477-.317.487l-.004.004c-.062.065-.139.129-.27.16-.194.046-.363-.028-.488-.082-.77-.33-1.5-.71-2.17-1.12l-.022-.013c-.278-.186-.553-.373-.802-.582a.42.42 0 01-.14-.256c-.006-.11.065-.22.138-.296l.004-.004c.063-.065.147-.125.23-.185.238-.167.536-.353.826-.532.646-.397 1.38-.848 1.958-1.22.31-.2.57-.36.752-.478.078-.051.168-.1.242-.147.058-.037.125-.059.177-.026.04.027.04.083.04.13 0 .049-.004.109-.007.164-.021.152-.058.378-.092.56-.17.91-.277 1.484-.277 1.484s-.007.016-.015.033c-.032.058-.107.128-.173.197-.276.276-.627.463-.979.605l-.558.228c-.336.134-.692.28-.996.414a78.9 78.9 0 01-.275.11c-.235.092-.47.172-.613.208-.083.02-.186.032-.27-.022-.047-.03-.08-.084-.107-.139-.097-.2-.17-.42-.228-.62-.111-.377-.194-.759-.277-1.134-.14-.615-.246-1.22-.275-1.293-.018-.048-.024-.113-.008-.168.02-.08.08-.14.16-.176.03-.012.059-.024.087-.036.3-.122.668-.26 1.02-.39.586-.217 1.251-.462 1.717-.614.253-.082.54-.176.774-.27.15-.06.3-.116.427-.158.127-.042.22-.06.28-.046.05.01.113.043.14.133.022.076.023.204.019.324-.007.19-.031.46-.049.654-.03.30-.050.528-.050.528s.108-.045.24-.105c.11-.051.24-.114.341-.173.41-.238 1.148-.718 1.269-.788.026-.014.052-.026.073-.027l.004-.002c.032-.007.07-.005.104.01.05.023.086.068.106.123.026.069.022.16.018.218a2.6 2.6 0 01-.016.17l-.004.028c-.023.174-.067.358-.113.53-.054.205-.114.406-.14.524-.049.23-.05.397.039.507.025.032.065.053.115.06.118.018.282-.043.405-.101.064-.03.125-.064.181-.1.117-.076.208-.165.266-.278.064-.122.087-.252.11-.37.018-.097.03-.189.043-.278.01-.072.02-.12.029-.147.023-.067.05-.115.107-.143.148-.073.43-.26.486-.296.022-.015.048-.023.077-.028z"/>',
    },
    facebook: {
      bg: '#1877F2',
      path: '<path d="M12 2C6.477 2 2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.879V14.89h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.631.771-1.631 1.562V12h2.773l-.443 2.89h-2.33v6.989C18.343 21.129 22 16.99 22 12c0-5.523-4.477-10-10-10z"/>',
    },
    github: {
      bg: '#181717',
      path: '<path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>',
    },
    discord: {
      bg: '#5865F2',
      path: '<path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028 14.09 14.09 0 001.226-1.994.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>',
    },
    whatsapp: {
      bg: '#25D366',
      path: '<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>',
    },
    youtube_music: {
      bg: '#FF0000',
      path: '<path d="M9.5 4.5c-3.86 0-7 3.14-7 7s3.14 7 7 7 7-3.14 7-7-3.14-7-7-7zm-2 10.5v-7l6 3.5-6 3.5z"/><circle cx="9.5" cy="11.5" r="9"/><path d="M22 12a9.5 9.5 0 01-9.5 9.5 9.46 9.46 0 01-4.72-1.25c3.18.94 6.72.14 9.09-2.23 2.37-2.37 3.17-5.91 2.23-9.09A9.47 9.47 0 0122 12z"/>',
    },
    line: {
      bg: '#00C300',
      path: '<path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.27 14.85c-.22.28-.62.33-.9.12l-3.36-2.52-3.36 2.52c-.28.22-.68.16-.9-.12-.22-.28-.17-.68.11-.9l3.67-2.76V8.27c0-.36.29-.65.65-.65s.65.29.65.65v2.91l3.67 2.76c.28.22.33.62.11.9z"/>',
    },
    wechat: {
      bg: '#09B83E',
      path: '<path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .545-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm3.164 2.098c-.58-.01-1.138.07-1.667.223a5.46 5.46 0 00.466.614c1.246 1.394 1.776 3.06 1.561 4.564.059.012.119.02.18.02a7.99 7.99 0 001.975-.289.701.701 0 01.578.079l1.35.844c.05.03.104.043.158.043a.195.195 0 00.193-.194c0-.05-.02-.099-.037-.147l-.282-1.123a.489.489 0 01.174-.516C22.121 16.054 23 14.62 23 12.997c0-2.91-2.754-5.464-6.238-5.464zM14.11 11.26c.497 0 .9.408.9.91a.905.905 0 01-.9.91.905.905 0 01-.9-.91c0-.502.403-.91.9-.91zm4.18 0c.497 0 .9.408.9.91a.905.905 0 01-.9.91.905.905 0 01-.9-.91c0-.502.403-.91.9-.91z"/>',
    },
    linkedin: {
      bg: '#0A66C2',
      path: '<path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>',
    },
    pinterest: {
      bg: '#E60023',
      path: '<path d="M12 0C5.372 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.936 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.67.968-2.917 2.173-2.917 1.024 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.17 1.777 2.17 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 01.083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.631-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.628 0 12-5.372 12-12S18.628 0 12 0z"/>',
    },
    spotify: {
      bg: '#1DB954',
      path: '<path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>',
    },
    twitch: {
      bg: '#9146FF',
      path: '<path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/>',
    },
    website: {
      bg: '#6b7280',
      path: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>',
    },
  };

  const entry = map[p] || { bg: '#6b7280', path: '<text x="12" y="16" text-anchor="middle" font-size="14" font-weight="bold" fill="white">?</text>' };
  return svg(entry);
}


function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

// ============================================
// Preset amounts
// ============================================
function renderPresets(presets) {
  const grid = document.getElementById('presetGrid');
  grid.innerHTML = '';
  presets.forEach((amount) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline btn-lg';
    btn.dataset.amount = amount;
    btn.innerHTML = `💸 <span class="font-bold">${formatShort(amount)}</span>`;
    btn.addEventListener('click', () => selectPreset(amount, btn));
    grid.appendChild(btn);
  });
}

function selectPreset(amount, btn) {
  state.selectedAmount = amount;
  document.getElementById('customAmount').value = '';
  // Highlight selected
  document.querySelectorAll('#presetGrid button').forEach((b) => b.classList.remove('selected'));
  btn.classList.add('selected');
  updateSawerBtn();
}

function clearPresetSelection() {
  state.selectedAmount = null;
  document.querySelectorAll('#presetGrid button').forEach((b) => {
    b.classList.remove('selected');
  });
}

function updateSawerBtn() {
  const btn = document.getElementById('sawerBtn');
  const txt = document.getElementById('btnText');
  const amt = getSelectedAmount();
  if (amt && amt > 0) {
    btn.disabled = false;
    txt.textContent = `Sawer ${formatIDR(amt)}`;
  } else {
    btn.disabled = true;
    txt.textContent = 'Pilih nominal dulu';
  }
}

function getSelectedAmount() {
  if (state.selectedAmount) return state.selectedAmount;
  const custom = parseInt(document.getElementById('customAmount').value, 10);
  return Number.isFinite(custom) && custom > 0 ? custom : 0;
}

// ============================================
// Submit sawer
// ============================================
async function submitSawer() {
  const amount = getSelectedAmount();
  if (!amount || amount <= 0) {
    showToast('Pilih nominal dulu', 'warning');
    return;
  }

  const config = state.config;
  if (amount < config.donation.minAmount) {
    showToast(`Nominal minimum ${formatIDR(config.donation.minAmount)}`, 'warning');
    showToast(`Parkir aja ${formatIDR(config.donation.minAmount)}, bos!`, 'warning');
    return;
  }
  if (amount > config.donation.maxAmount) {
    showToast(`Nominal maksimum ${formatIDR(config.donation.maxAmount)}`, 'warning');
    showToast(`Jangan berlebihan, ${formatIDR(config.donation.maxAmount)} sudah cukup, bos!`, 'warning');
    return;
  }

  const donorName = document.getElementById('donorName').value.trim();
  const message = document.getElementById('message').value.trim();
  const isAnonymous = document.getElementById('isAnonymous')?.checked || false;

  const btn = document.getElementById('sawerBtn');
  const loading = document.getElementById('btnLoading');
  const txt = document.getElementById('btnText');
  btn.disabled = true;
  loading.classList.remove('hidden');
  txt.textContent = 'Membuat QR...';

  try {
    const data = await api('/api/donations', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        donorName: donorName || null,
        message: message || null,
        isAnonymous,
      }),
    });

    state.currentDonation = data;

    try {
      localStorage.setItem(`drp-pay-${data.qrToken}`, JSON.stringify({
        qrImage: data.qrImage,
        dynamicQris: data.qrisString || data.dynamicQris,
        expiresAt: data.expiresAt,
        amountFormatted: data.amountFormatted,
        uniqueCode: data.uniqueCode,
        donorName: data.donorName,
        message: data.message,
      }));
    } catch (e) {
      console.warn('Gagal menyimpan QR cache:', e);
    }

    // Redirect ke halaman pembayaran dedicated (full page, bukan modal)
    // supaya user tidak bisa accidental close modal & batal transaksi
    window.location.href = `/pay?token=${data.qrToken}`;
  } catch (err) {
    console.error('Sawer error:', err);
    showToast(err.message || 'Gagal membuat saweran', 'error', 5000);
  } finally {
    loading.classList.add('hidden');
    updateSawerBtn();
  }
}

// ============================================
// Event listeners
// ============================================
function attachEvents() {
  // Custom amount
  document.getElementById('customAmount').addEventListener('input', (e) => {
    if (e.target.value) clearPresetSelection();
    updateSawerBtn();
  });

  // Sawer button - submit dan redirect ke /pay page dedicated
  document.getElementById('sawerBtn').addEventListener('click', submitSawer);
}

// ============================================
// Init
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  attachEvents();
  loadConfig();
});
