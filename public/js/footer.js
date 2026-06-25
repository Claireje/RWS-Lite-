class GlobalFooter extends HTMLElement {
    async connectedCallback() {
        try {
            // path is relative to the page, not this file, so it'll break if a page lives in a subfolder
            const response = await fetch('footer.html');
            if (!response.ok) throw new Error('footer.html not found or failed to load');

            this.innerHTML = await response.text();
        } catch (error) {
            console.error('global-footer failed to load:', error);
        }
    }
}

customElements.define('global-footer', GlobalFooter);