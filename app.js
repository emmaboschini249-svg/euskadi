document.addEventListener('DOMContentLoaded', () => {
  // Application Data & State
  let allLocations = [];
  let map = null;
  let markersClusterGroup = null;
  let locationMarkersMap = new Map(); // Store markers by location name
  let activeTileLayer = null;

  // Map Tile Layers (Light, Dark, Satellite)
  const TILE_LAYERS = {
    voyager: L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS'
    })
  };

  // DOM Elements
  const locationListEl = document.getElementById('location-list');
  const searchInputEl = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search');
  const categorySelectEl = document.getElementById('category-select');
  const resultsCountEl = document.getElementById('results-count');
  const resetViewBtn = document.getElementById('reset-view-btn');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
  const mobileSidebarToggleBtn = document.getElementById('mobile-sidebar-toggle');
  const sidebarEl = document.getElementById('sidebar');

  // Step 1: Initialize Leaflet Map
  function initMap() {
    map = L.map('map', {
      center: [43.32, -2.15],
      zoom: 10,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Set default Light map tiles
    activeTileLayer = TILE_LAYERS.voyager;
    activeTileLayer.addTo(map);

    // Cluster group for pins
    markersClusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 35,
      spiderfyOnMaxZoom: true
    });
    map.addLayer(markersClusterGroup);
  }

  // Step 2: Create Custom Pin Icon with Emoji
  function createMarkerIcon(emoji, hasNote) {
    const className = hasNote ? 'custom-pin has-note' : 'custom-pin';
    const displayEmoji = emoji || '📍';
    
    return L.divIcon({
      className: '',
      html: `<div class="${className}"><div class="custom-pin-inner">${displayEmoji}</div></div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 38],
      popupAnchor: [0, -34]
    });
  }

  // Step 3: Fetch Locations JSON File
  async function loadLocations() {
    try {
      const response = await fetch('locations.json');
      allLocations = await response.json();

      // Initial render with all locations
      applyFilters();
    } catch (err) {
      console.error('Failed to load locations.json:', err);
      locationListEl.innerHTML = '<li class="location-item" style="color: #ef4444; text-align: center;">Error loading location data.</li>';
    }
  }

  // Step 4: Core Filtering Function (Search + Category Select)
  function applyFilters() {
    const query = searchInputEl.value.toLowerCase().trim();
    const selectedCategory = categorySelectEl.value;

    // Filter array based on user choices
    const filteredLocations = allLocations.filter((loc) => {
      // Search query filter (matches name, address, note, or category)
      const nameMatch = loc.name.toLowerCase().includes(query);
      const noteMatch = loc.note && loc.note.toLowerCase().includes(query);
      const addrMatch = loc.address && loc.address.toLowerCase().includes(query);
      const catMatch = loc.category && loc.category.toLowerCase().includes(query);
      const matchesSearch = nameMatch || noteMatch || addrMatch || catMatch;

      if (!matchesSearch) return false;

      // Category dropdown filter
      if (selectedCategory === 'all') {
        return true;
      } else if (selectedCategory === 'notes') {
        return loc.note && loc.note.trim() !== '';
      } else {
        return loc.category === selectedCategory;
      }
    });

    // Update List & Map
    renderLocationList(filteredLocations);
    renderMapMarkers(filteredLocations);
  }

  // Step 5: Render Sidebar List
  function renderLocationList(locations) {
    locationListEl.innerHTML = '';

    resultsCountEl.textContent = `Showing ${locations.length} location${locations.length === 1 ? '' : 's'}`;

    if (locations.length === 0) {
      locationListEl.innerHTML = `
        <div style="padding: 30px 20px; text-align: center; color: var(--text-muted);">
          <i class="fa-solid fa-location-dot" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
          No locations match your selection.
        </div>`;
      return;
    }

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
        ${hasNote ? `<div class="note-badge"><i class="fa-solid fa-star"></i> ${escapeHtml(loc.note)}</div>` : ''}
        <div class="location-address">
          <i class="fa-solid fa-location-pin"></i>
          <span>${escapeHtml(loc.address || 'Basque Country')}</span>
        </div>
      `;

      // Click card -> Fly to map pin
      itemEl.addEventListener('click', () => {
        focusLocationOnMap(loc);
        if (window.innerWidth <= 768) {
          sidebarEl.classList.add('collapsed');
        }
      });

      locationListEl.appendChild(itemEl);
    });
  }

  // Step 6: Render Map Markers
  function renderMapMarkers(locations) {
    markersClusterGroup.clearLayers();
    locationMarkersMap.clear();

    const bounds = L.latLngBounds();

    locations.forEach((loc) => {
      if (!loc.lat || !loc.lng) return;

      const hasNote = loc.note && loc.note.trim() !== '';
      const icon = createMarkerIcon(loc.emoji, hasNote);

      const marker = L.marker([loc.lat, loc.lng], { icon: icon });

      // Build Popup Card HTML
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
        highlightSidebarCard(loc.name);
      });

      markersClusterGroup.addLayer(marker);
      locationMarkersMap.set(loc.name, marker);
      bounds.extend([loc.lat, loc.lng]);
    });

    // Auto-fit map bounds to currently visible markers
    if (locations.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds.pad(0.12));
    }
  }

  // Step 7: Focus & Zoom Map to Selected Location
  function focusLocationOnMap(loc) {
    const marker = locationMarkersMap.get(loc.name);

    if (marker) {
      map.flyTo([loc.lat, loc.lng], 16, { animate: true, duration: 1.2 });
      markersClusterGroup.zoomToShowLayer(marker, () => {
        marker.openPopup();
      });
    }

    highlightSidebarCard(loc.name);
  }

  // Step 8: Highlight Active Card in Sidebar
  function highlightSidebarCard(name) {
    document.querySelectorAll('.location-item').forEach((item) => {
      if (item.dataset.name === name) {
        item.classList.add('active');
        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  // Event Listeners
  categorySelectEl.addEventListener('change', applyFilters);

  searchInputEl.addEventListener('input', () => {
    clearSearchBtn.classList.toggle('hidden', searchInputEl.value.trim() === '');
    applyFilters();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInputEl.value = '';
    clearSearchBtn.classList.add('hidden');
    applyFilters();
  });

  // Tile Switcher (Light / Dark / Satellite)
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

  // Reset Map View
  resetViewBtn.addEventListener('click', () => {
    if (allLocations.length > 0) {
      categorySelectEl.value = 'all';
      searchInputEl.value = '';
      clearSearchBtn.classList.add('hidden');
      applyFilters();
    }
  });

  // Toggle Sidebar Collapse
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

  // Init App
  initMap();
  loadLocations();
});
