// loads footer.html and drops it into the page
// (path is relative to the page, not this file, so it'll break if a page lives in a subfolder)
async function loadFooter() {
    const el = document.getElementById('footer-placeholder');
    if (!el) return;
    try {
        const response = await fetch('footer.html');
        if (!response.ok) throw new Error('footer.html not found or failed to load');
        el.innerHTML = await response.text();
    } catch (error) {
        console.error('footer failed to load:', error);
    }
}
loadFooter();
