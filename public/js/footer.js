class GlobalFooter extends HTMLElement {
    async connectedCallback() {
        try {
            // Fetch your standalone footer file
            const response = await fetch('footer.html');
            if (!response.ok) throw new Error('Footer partial asset offline');
            
            // Set the inner contents of our element to match the layout
            this.innerHTML = await response.text();
        } catch (error) {
            console.error("Component construction fault: ", error);
        }
    }
}

// Define the custom tag element for browsers to understand
customElements.define('global-footer', GlobalFooter);