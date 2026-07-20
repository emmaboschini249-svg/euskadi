document.addEventListener('DOMContentLoaded', () => {
  // Global State
  let allLocations = [];
  let currentFilteredLocations = [];
  let map = null;
  let markersClusterGroup = null;
  let locationMarkersMap = new Map(); // name -> L.marker
  let activeTileLayer = null;

  // Tile Layer Configurations
  const TILE_LAYERS = {
    voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    })
  };

  // DOM Elements
  const locationListEl = document.getElementById('location-list');
  const searchInputEl = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const categorySelectEl = document.getElementById('category-select');
  const filterPillsEl = document.getElementById('filter-pills');
  const resultsCountEl = document.getElementById('results-count');
  const resetViewBtn = document.getElementById('reset-view-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle');
  const sidebarEl = document.getElementById('sidebar');

  // Initialize Map
  function initMap() {
    map = L.map('map', {
      center: [43.32, -2.15],
      zoom: 10,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    activeTileLayer = TILE_LAYERS.voyager;
    activeTileLayer.addTo(map);

    markersClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 40,
      spiderfyOnMaxZoom: true
    });
    map.addLayer(markersClusterGroup);
  }

  // Create Custom HTML Pin Icon with Emoji
  function createCustomIcon(emoji, hasNote) {
    const className = hasNote ? 'custom-pin has-note' : 'custom-pin standard';
    const displayEmoji = emoji || '📍';
    
    return L.divIcon({
      className: '',
      html: `<div class="${className}"><div class="custom-pin-inner">${displayEmoji}</div></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -34]
    });
  }

  // Load Locations Data
  async function loadData() {
    try {
      const response = await fetch('locations.json');
      allLocations = await response.json();
      currentFilteredLocations = [...allLocations];

      renderSidebarList(currentFilteredLocations);
      renderMapMarkers(currentFilteredLocations);
      updateStats();
    } catch (err) {
      console.error('Error loading location data:', err);
      locationListEl.innerHTML = '<li class="location-item" style="color: #ef4444;">Failed to load location data.</li>';
    }
  }

  // Update Top Stats
  function updateStats() {
    document.getElementById('stat-total').textContent = allLocations.length;
    const withNotes = allLocations.filter(loc => loc.note && loc.note.trim() !== '').length;
    document.getElementById('stat-notes').textContent = withNotes;
  }

  // Render Sidebar Location Cards
  function renderSidebarList(locations) {
    locationListEl.innerHTML = '';

    if (locations.length === 0) {
      locationListEl.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-location-dot" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
          No locations match your search or filter.
        </div>`;
      resultsCountEl.textContent = '0 locations found';
      return;
    }

    resultsCountEl.textContent = `Showing ${locations.length} location${locations.length === 1 ? '' : 's'}`;

    locations.forEach((loc) => {
      const itemEl = document.createElement('li');
      itemEl.className = 'location-item';
      itemEl.dataset.name = loc.name;

      const hasNote = loc.note && loc.note.trim() !== '';

      itemEl.innerHTML = `
        <div class="location-title-row">
          <span class="location-name">${escapeHtml(loc.name)}</span>
          <span class="category-tag">${loc.emoji || '📍'} ${escapeHtml(loc.category || 'Other')}</span>
        </div>
        ${hasNote ? `<div class="note-badge"><i class="fa-solid fa-comment-dots"></i> ${escapeHtml(loc.note)}</div>` : ''}
        <div class="location-address">
          <i class="fa-solid fa-location-pin"></i>
          <span>${escapeHtml(loc.address || 'Basque Country')}</span>
        </div>
      `;

      itemEl.addEventListener('click', () => {
        selectLocation(loc);
        if (window.innerWidth <= 768) {
          sidebarEl.classList.add('collapsed');
        }
      });

      locationListEl.appendChild(itemEl);
    });
  }

  // Render Leaflet Map Markers
  function renderMapMarkers(locations) {
    markersClusterGroup.clearLayers();
    locationMarkersMap.clear();

    const bounds = L.latLngBounds();

    locations.forEach((loc) => {
      if (!loc.lat || !loc.lng) return;

      const hasNote = loc.note && loc.note.trim() !== '';
      const markerIcon = createCustomIcon(loc.emoji, hasNote);

      const marker = L.marker([loc.lat, loc.lng], { icon: markerIcon });

      // Popup Content Card
      const popupHtml = `
        <div class="popup-card">
          <div class="popup-category">${loc.emoji || '📍'} ${escapeHtml(loc.category || 'Location')}</div>
          <div class="popup-title">${escapeHtml(loc.name)}</div>
          ${hasNote ? `<div class="popup-note"><i class="fa-solid fa-star"></i> ${escapeHtml(loc.note)}</div>` : ''}
          ${loc.address ? `<div class="popup-address"><i class="fa-solid fa-map-marker-alt"></i> ${escapeHtml(loc.address)}</div>` : ''}
          <a href="${loc.url}" target="_blank" rel="noopener noreferrer" class="popup-gmaps-btn">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> Open in Google Maps
          </a>
        </div>
      `;

      marker.bindPopup(popupHtml, { closeButton: false });

      marker.on('click', () => {
        highlightSidebarItem(loc.name);
      });

      markersClusterGroup.addLayer(marker);
      locationMarkersMap.set(loc.name, marker);
      bounds.extend([loc.lat, loc.lng]);
    });

    if (locations.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
  }

  // Select Location (Pan Map & Open Popup)
  function selectLocation(loc) {
    const marker = locationMarkersMap.get(loc.name);

    if (marker) {
      map.flyTo([loc.lat, loc.lng], 16, {
        animate: true,
        duration: 1.2
      });

      markersClusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    }

    highlightSidebarItem(loc.name);
  }

  // Highlight Sidebar Card & Scroll into view
  function highlightSidebarItem(name) {
    document.querySelectorAll('.location-item').forEach((item) => {
      if (item.dataset.name === name) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Search & Filter Logic
  function applyFilters() {
    const query = searchInputEl.value.toLowerCase().trim();
    const selectedCategory = categorySelectEl.value;

    currentFilteredLocations = allLocations.filter((loc) => {
      // Search query check
      const nameMatch = loc.name.toLowerCase().includes(query);
      const noteMatch = loc.note && loc.note.toLowerCase().includes(query);
      const addrMatch = loc.address && loc.address.toLowerCase().includes(query);
      const catMatch = loc.category && loc.category.toLowerCase().includes(query);
      const matchesSearch = nameMatch || noteMatch || addrMatch || catMatch;

      if (!matchesSearch) return false;

      // Category filter check
      if (selectedCategory === 'all') {
        return true;
      } else if (selectedCategory === 'notes') {
        return loc.note && loc.note.trim() !== '';
      } else {
        return loc.category === selectedCategory;
      }
    });

    renderSidebarList(currentFilteredLocations);
    renderMapMarkers(currentFilteredLocations);
  }

  // Sync category select dropdown with quick pills
  function syncCategoryFilter(categoryValue) {
    categorySelectEl.value = categoryValue;

    document.querySelectorAll('.filter-pills .pill').forEach((pill) => {
      if (pill.dataset.filter === categoryValue) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });

    applyFilters();
  }

  // Event Listeners
  searchInputEl.addEventListener('input', () => {
    clearSearchBtn.classList.toggle('hidden', searchInputEl.value.trim() === '');
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInputEl.value = '';
    clearSearchBtn.classList.add('hidden');
    applyFilters();
  });

  categorySelectEl.addEventListener('change', (e) => {
    syncCategoryFilter(e.target.value);
  });

  filterPillsEl.addEventListener('click', (e) => {
    const pill = e.target.closest('.pill');
    if (!pill) return;

    syncCategoryFilter(pill.dataset.filter);
  });

  // Map Tile Selector
  document.querySelectorAll('.tile-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tileType = btn.dataset.tile;
      if (!TILE_LAYERS[tileType]) return;

      document.querySelectorAll('.tile-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      map.removeLayer(activeTileLayer);
      activeTileLayer = TILE_LAYERS[tileType];
      activeTileLayer.addTo(map);
    });
  });

  // Reset Map Bounds
  resetViewBtn.addEventListener('click', () => {
    if (currentFilteredLocations.length > 0) {
      const bounds = L.latLngBounds(currentFilteredLocations.map(l => [l.lat, l.lng]));
      map.fitBounds(bounds.pad(0.12));
    }
  });

  // Toggle Sidebar
  toggleSidebarBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
  });

  if (mobileSidebarToggleBtn) {
    mobileSidebarToggleBtn.addEventListener('click', () => {
      sidebarEl.classList.toggle('collapsed');
    });
  }

  // Helper function to prevent XSS
  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, (m) => {
      return {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      }[m];
    });
  }

  // Init
  initMap();
  loadData();
});
