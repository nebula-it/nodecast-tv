/**
 * Guide Page Controller
 */

class GuidePage {
    constructor(app) {
        this.app = app;
    }

    async init() {
        // EPG guide will lazy load when shown
    }

    async show() {
        // Always reload EPG data when page is shown to ensure fresh data
        await this.app.epgGuide.loadEpg();
    }

    hide() {
        // Page is hidden
    }
}

window.GuidePage = GuidePage;
