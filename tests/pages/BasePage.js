export class BasePage {
  constructor(page) {
    this.page = page;
  }

  async goto(url) {
    await this.page.goto(url);
  }

  async waitForReady() {
    await this.page.waitForLoadState('networkidle');
  }
}
