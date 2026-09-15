// ============================================================
//  Dombla Desktop — Desktop-specific UI logic
//  Handles custom title bar controls & Electron bridge
// ============================================================

(() => {
    'use strict';

    // Only run in Electron context
    const isDesktop = window.domblaDesktop && window.domblaDesktop.isDesktop;
    const titlebar = document.getElementById('desktop-titlebar');

    if (!isDesktop) {
        // Hide the custom title bar if not running in Electron
        if (titlebar) titlebar.style.display = 'none';
        return;
    }

    // Add desktop class to body for CSS adjustments
    document.body.classList.add('is-desktop');

    const api = window.domblaDesktop;

    // ── Title Bar Button Handlers ────────────────────────────
    const btnMinimize = document.getElementById('btn-minimize');
    const btnMaximize = document.getElementById('btn-maximize');
    const btnClose = document.getElementById('btn-close');

    if (btnMinimize) {
        btnMinimize.addEventListener('click', () => api.minimize());
    }

    if (btnMaximize) {
        btnMaximize.addEventListener('click', async () => {
            await api.maximize();
            updateMaximizeIcon();
        });
    }

    if (btnClose) {
        btnClose.addEventListener('click', () => api.close());
    }

    // Update maximize/restore icon based on window state
    async function updateMaximizeIcon() {
        if (!btnMaximize) return;
        const maximized = await api.isMaximized();
        const svg = btnMaximize.querySelector('svg');
        if (!svg) return;

        if (maximized) {
            // Restore icon (two overlapping rectangles)
            svg.innerHTML = `
                <rect x="3" y="3.5" width="7" height="7" rx="0.5" fill="none" stroke="currentColor" stroke-width="1"/>
                <polyline points="5 3.5 5 1.5 11 1.5 11 7.5 9 7.5" fill="none" stroke="currentColor" stroke-width="1"/>
            `;
        } else {
            // Maximize icon (single rectangle)
            svg.innerHTML = `
                <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1"/>
            `;
        }
    }

    // Listen for window resize to update icon
    window.addEventListener('resize', () => {
        setTimeout(updateMaximizeIcon, 50);
    });

    // Double-click on drag region to maximize/restore
    const dragRegion = document.querySelector('.titlebar-drag-region');
    if (dragRegion) {
        dragRegion.addEventListener('dblclick', async () => {
            await api.maximize();
            updateMaximizeIcon();
        });
    }

    // Initial icon state
    updateMaximizeIcon();

    // Log desktop mode
    api.getVersion().then(v => {
        console.log(`[Dombla Desktop] v${v} running on Electron`);
    });

})();
