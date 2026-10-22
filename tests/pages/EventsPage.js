export class EventsPage {
  constructor(page) {
    this.page = page;
  }

  async waitForSubmitButton() {
    await this.page.waitForSelector('button#submit, [data-testid="adt-submit"]', { state: 'visible', timeout: 10000 });
  }

  async waitForSuccess() {
    await this.page.waitForSelector('.success-message, [data-testid="adt-success"]', { timeout: 10000 });
  }

  async submitEvent() {
    const button = await this.page.$('button#submit, [data-testid="adt-submit"]');
    if (button) {
      await button.click();
    }
  }
}
